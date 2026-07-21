import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, receipts } from "../db/schema";
import { encodeReceiptCursor, type parseReceiptQuery } from "./receipt-input";
import { receiptView } from "./receipt-view";

type ReceiptQuery = ReturnType<typeof parseReceiptQuery>;

export class LeashReceiptNotFoundError extends Error {
  constructor() {
    super("The Agent receipt resource was not found.");
    this.name = "LeashReceiptNotFoundError";
  }
}

const receiptProjection = {
  amountAtomic: receipts.amountAtomic,
  amountUsd: receipts.amountUsd,
  asset: receipts.asset,
  authorizationNonce: receipts.authorizationNonce,
  authorizationValidBefore: receipts.authorizationValidBefore,
  capAtomicAtAttempt: receipts.capAtomicAtAttempt,
  committedAtomicBefore: receipts.committedAtomicBefore,
  createdAt: receipts.createdAt,
  id: receipts.id,
  intendedNetwork: receipts.intendedNetwork,
  network: receipts.network,
  origin: receipts.origin,
  payTo: receipts.payTo,
  reason: receipts.reason,
  resourceHost: receipts.resourceHost,
  resourceUrl: receipts.resourceUrl,
  settledAt: receipts.settledAt,
  status: receipts.status,
  txHash: receipts.txHash,
};

async function requireOwnedAgent(database: Database, ownerId: string, agentId: string) {
  const [owned] = await database
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
    .limit(1);
  if (!owned) throw new LeashReceiptNotFoundError();
}

export async function listOwnerReceipts(
  database: Database,
  options: ReceiptQuery & { ownerId: string },
) {
  await requireOwnedAgent(database, options.ownerId, options.agentId);
  const conditions: SQL[] = [eq(receipts.agentId, options.agentId)];
  if (options.cursor) {
    conditions.push(
      or(
        lt(receipts.createdAt, options.cursor.createdAt),
        and(eq(receipts.createdAt, options.cursor.createdAt), lt(receipts.id, options.cursor.id)),
      ) as SQL,
    );
  }
  const rows = await database
    .select(receiptProjection)
    .from(receipts)
    .where(and(...conditions))
    .orderBy(desc(receipts.createdAt), desc(receipts.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    nextCursor:
      rows.length > options.limit && last
        ? encodeReceiptCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    receipts: page.map(receiptView),
  };
}

export async function readOwnerReceipt(
  database: Database,
  options: { ownerId: string; receiptId: string },
) {
  const [row] = await database
    .select(receiptProjection)
    .from(receipts)
    .innerJoin(agents, eq(agents.id, receipts.agentId))
    .where(and(eq(receipts.id, options.receiptId), eq(agents.ownerId, options.ownerId)))
    .limit(1);
  if (!row) throw new LeashReceiptNotFoundError();
  return receiptView(row);
}
