import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { notifications } from "../db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Notification = typeof notifications.$inferSelect;
type NotificationInsert = typeof notifications.$inferInsert;

interface CapNotificationOptions {
  agentId: string;
  capAtomic: string;
  committedAtomic: string;
  cycleId: string;
  now: Date;
}

interface ReceiptNotificationOptions extends CapNotificationOptions {
  attemptedAtomic: string;
  receiptId: string;
}

interface FloatEmptyNotificationOptions {
  agentId: string;
  availableAtomic: string;
  cycleId: string;
  network: "eip155:8453" | "eip155:42161";
  now: Date;
  receiptId: string;
  reservedAtomic: string;
}

function constraintName(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const candidate = error as Error & { cause?: unknown; constraint_name?: unknown };
  if (typeof candidate.constraint_name === "string") return candidate.constraint_name;
  return constraintName(candidate.cause);
}

async function insertOrFind(
  transaction: Transaction,
  event: string,
  insert: (savepoint: Transaction) => Promise<Notification | undefined>,
  find: () => Promise<Notification | undefined>,
) {
  let eventKeyConflict: unknown;
  try {
    const inserted = await transaction.transaction(insert);
    if (inserted) return inserted;
  } catch (error) {
    if (constraintName(error) !== "notifications_agent_event_key_unique") throw error;
    eventKeyConflict = error;
  }
  const existing = await find();
  if (existing) return existing;
  if (eventKeyConflict) throw eventKeyConflict;
  throw new Error(`Expected an existing ${event} notification`);
}

async function findActiveCapHalt(transaction: Transaction, agentId: string) {
  const [notification] = await transaction
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.agentId, agentId),
        isNull(notifications.resolvedAt),
        inArray(notifications.type, ["cap_blocked", "cap_lowered_halt"]),
      ),
    )
    .limit(1);
  return notification;
}

async function emitCapHalt(transaction: Transaction, values: NotificationInsert) {
  return insertOrFind(
    transaction,
    "cap-halt",
    async (savepoint) => {
      const [inserted] = await savepoint
        .insert(notifications)
        .values(values)
        .onConflictDoNothing({
          target: notifications.agentId,
          where: sql`${notifications.resolvedAt} is null
            and ${notifications.type} in ('cap_blocked', 'cap_lowered_halt')`,
        })
        .returning();
      return inserted;
    },
    () => findActiveCapHalt(transaction, values.agentId),
  );
}

export async function emitCap75(transaction: Transaction, options: CapNotificationOptions) {
  return insertOrFind(
    transaction,
    "cap_75",
    async (savepoint) => {
      const [inserted] = await savepoint
        .insert(notifications)
        .values({
          agentId: options.agentId,
          createdAt: options.now,
          cycleId: options.cycleId,
          eventKey: `cap_75:${options.cycleId}`,
          metadata: {
            capAtomic: options.capAtomic,
            committedAtomic: options.committedAtomic,
            thresholdPercent: 75,
          },
          sticky: false,
          tier: "2",
          type: "cap_75",
        })
        .onConflictDoNothing({
          target: [notifications.agentId, notifications.cycleId],
          where: sql`${notifications.type} = 'cap_75'`,
        })
        .returning();
      return inserted;
    },
    async () => {
      const [existing] = await transaction
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.agentId, options.agentId),
            eq(notifications.cycleId, options.cycleId),
            eq(notifications.type, "cap_75"),
          ),
        )
        .limit(1);
      return existing;
    },
  );
}

export async function emitUnusualDomain(
  transaction: Transaction,
  options: {
    agentId: string;
    cycleId: string;
    now: Date;
    receiptId: string;
    resourceHost: string;
    resourceKey: string;
    resourceUrl: string;
  },
) {
  return insertOrFind(
    transaction,
    "unusual-domain",
    async (savepoint) => {
      const [inserted] = await savepoint
        .insert(notifications)
        .values({
          agentId: options.agentId,
          createdAt: options.now,
          cycleId: options.cycleId,
          eventKey: `unusual_domain:${options.resourceKey}`,
          metadata: {
            resourceHost: options.resourceHost,
            resourceUrl: options.resourceUrl,
          },
          receiptId: options.receiptId,
          resourceHost: options.resourceHost,
          resourceKey: options.resourceKey,
          sticky: false,
          tier: "2",
          type: "unusual_domain",
        })
        .onConflictDoNothing({
          target: [notifications.agentId, notifications.resourceKey],
          where: sql`${notifications.type} = 'unusual_domain'`,
        })
        .returning();
      return inserted;
    },
    async () => {
      const [existing] = await transaction
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.agentId, options.agentId),
            eq(notifications.resourceKey, options.resourceKey),
            eq(notifications.type, "unusual_domain"),
          ),
        )
        .limit(1);
      return existing;
    },
  );
}

export async function emitFloatEmpty(
  transaction: Transaction,
  options: FloatEmptyNotificationOptions,
) {
  const eventKey = `float_empty:${options.cycleId}:${options.network}`;
  return insertOrFind(
    transaction,
    "float-empty",
    async (savepoint) => {
      const [inserted] = await savepoint
        .insert(notifications)
        .values({
          agentId: options.agentId,
          createdAt: options.now,
          cycleId: options.cycleId,
          eventKey,
          metadata: {
            availableAtomic: options.availableAtomic,
            network: options.network,
            reservedAtomic: options.reservedAtomic,
          },
          receiptId: options.receiptId,
          sticky: false,
          tier: "2",
          type: "float_empty",
        })
        .returning();
      return inserted;
    },
    async () => {
      const [existing] = await transaction
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.agentId, options.agentId),
            eq(notifications.eventKey, eventKey),
            eq(notifications.type, "float_empty"),
          ),
        )
        .limit(1);
      return existing;
    },
  );
}

export function emitCapBlocked(transaction: Transaction, options: ReceiptNotificationOptions) {
  return emitCapHalt(transaction, {
    agentId: options.agentId,
    createdAt: options.now,
    cycleId: options.cycleId,
    eventKey: `cap_blocked:${options.receiptId}`,
    metadata: {
      attemptedAtomic: options.attemptedAtomic,
      capAtomic: options.capAtomic,
      committedAtomic: options.committedAtomic,
    },
    receiptId: options.receiptId,
    sticky: true,
    tier: "3",
    type: "cap_blocked",
  });
}

export function emitCapLoweredHalt(transaction: Transaction, options: CapNotificationOptions) {
  return emitCapHalt(transaction, {
    agentId: options.agentId,
    createdAt: options.now,
    cycleId: options.cycleId,
    eventKey: `cap_lowered_halt:${options.cycleId}:${options.now.toISOString()}`,
    metadata: { capAtomic: options.capAtomic, committedAtomic: options.committedAtomic },
    sticky: true,
    tier: "3",
    type: "cap_lowered_halt",
  });
}

export async function resolveActiveCapHalt(
  transaction: Transaction,
  options: { agentId: string; now: Date },
) {
  const [resolved] = await transaction
    .update(notifications)
    .set({ resolvedAt: options.now })
    .where(
      and(
        eq(notifications.agentId, options.agentId),
        isNull(notifications.resolvedAt),
        inArray(notifications.type, ["cap_blocked", "cap_lowered_halt"]),
      ),
    )
    .returning();
  return resolved;
}
