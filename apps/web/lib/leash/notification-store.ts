import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, notifications } from "../db/schema";
import { encodeNotificationCursor, type parseNotificationQuery } from "./notification-input";

type NotificationFilters = ReturnType<typeof parseNotificationQuery>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class LeashNotificationNotFoundError extends Error {
  constructor() {
    super("The Leash notification resource was not found.");
    this.name = "LeashNotificationNotFoundError";
  }
}

async function requireOwnedAgent(
  database: Database | Transaction,
  ownerId: string,
  agentId: string,
) {
  const [owned] = await database
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
    .limit(1);
  if (!owned) throw new LeashNotificationNotFoundError();
}

async function unreadCount(database: Database | Transaction, agentId: string) {
  const [result] = await database
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.agentId, agentId),
        isNull(notifications.readAt),
        inArray(notifications.tier, ["2", "3"]),
      ),
    );
  return result?.value ?? 0;
}

export async function countOwnerUnreadNotifications(
  database: Database,
  options: { ownerId: string },
) {
  const [result] = await database
    .select({ value: count() })
    .from(notifications)
    .innerJoin(agents, eq(agents.id, notifications.agentId))
    .where(
      and(
        eq(agents.ownerId, options.ownerId),
        isNull(notifications.readAt),
        inArray(notifications.tier, ["2", "3"]),
      ),
    );
  return result?.value ?? 0;
}

function cta(agentId: string, tier: "2" | "3", resolvedAt: Date | null) {
  if (tier !== "3" || resolvedAt) return null;
  return {
    href: `/leash/cap?agentId=${encodeURIComponent(agentId)}#cap-controls`,
    kind: "cap_remediation" as const,
    label: "Review cap",
  };
}

export async function listOwnerNotifications(
  database: Database,
  options: NotificationFilters & { ownerId: string },
) {
  await requireOwnedAgent(database, options.ownerId, options.agentId);

  const conditions: SQL[] = [eq(notifications.agentId, options.agentId)];
  if (options.tier) conditions.push(eq(notifications.tier, options.tier));
  if (options.type) conditions.push(eq(notifications.type, options.type));
  if (options.read === "read") conditions.push(isNotNull(notifications.readAt));
  if (options.read === "unread") conditions.push(isNull(notifications.readAt));
  if (options.resolution === "active") conditions.push(isNull(notifications.resolvedAt));
  if (options.resolution === "resolved") conditions.push(isNotNull(notifications.resolvedAt));
  if (options.cursor) {
    conditions.push(
      or(
        lt(notifications.createdAt, options.cursor.createdAt),
        and(
          eq(notifications.createdAt, options.cursor.createdAt),
          lt(notifications.id, options.cursor.id),
        ),
      ) as SQL,
    );
  }

  const [rows, badgeCount] = await Promise.all([
    database
      .select({
        agentId: notifications.agentId,
        createdAt: notifications.createdAt,
        cycleId: notifications.cycleId,
        id: notifications.id,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        receiptId: notifications.receiptId,
        resolvedAt: notifications.resolvedAt,
        resourceHost: notifications.resourceHost,
        sticky: notifications.sticky,
        tier: notifications.tier,
        type: notifications.type,
      })
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(options.limit + 1),
    unreadCount(database, options.agentId),
  ]);

  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > options.limit && last
      ? encodeNotificationCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  return {
    nextCursor,
    notifications: page.map((row) => ({
      ...row,
      cta: cta(row.agentId, row.tier, row.resolvedAt),
    })),
    unreadCount: badgeCount,
  };
}

export async function markOwnerNotificationRead(
  database: Database,
  options: { agentId: string; notificationId: string; now: Date; ownerId: string },
) {
  return database.transaction(async (transaction) => {
    await requireOwnedAgent(transaction, options.ownerId, options.agentId);
    const updated = await transaction
      .update(notifications)
      .set({
        readAt: sql`greatest(${options.now.toISOString()}::timestamptz, ${notifications.createdAt})`,
      })
      .where(
        and(
          eq(notifications.id, options.notificationId),
          eq(notifications.agentId, options.agentId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    if (updated.length === 0) {
      const [existing] = await transaction
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.id, options.notificationId),
            eq(notifications.agentId, options.agentId),
          ),
        )
        .limit(1);
      if (!existing) throw new LeashNotificationNotFoundError();
    }
    return {
      unreadCount: await unreadCount(transaction, options.agentId),
      updatedCount: updated.length,
    };
  });
}

export async function markAllOwnerNotificationsRead(
  database: Database,
  options: { agentId: string; now: Date; ownerId: string },
) {
  return database.transaction(async (transaction) => {
    await requireOwnedAgent(transaction, options.ownerId, options.agentId);
    const updated = await transaction
      .update(notifications)
      .set({
        readAt: sql`greatest(${options.now.toISOString()}::timestamptz, ${notifications.createdAt})`,
      })
      .where(and(eq(notifications.agentId, options.agentId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return {
      unreadCount: await unreadCount(transaction, options.agentId),
      updatedCount: updated.length,
    };
  });
}
