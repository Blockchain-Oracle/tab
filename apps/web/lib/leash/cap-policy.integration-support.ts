import { randomBytes, randomUUID } from "node:crypto";

import { createDatabase } from "../db/client";
import { agents, receipts, users } from "../db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for cap-policy integration tests");

export const connection = createDatabase(databaseUrl, 4);
const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const payTo = "0x1111111111111111111111111111111111111111";

export async function provision(label: string) {
  const [owner] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const [agent] = await connection.db
    .insert(agents)
    .values({ ownerId: owner.id, name: `${label} agent`, signerSubject: `leash:${randomUUID()}` })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  return { agentId: agent.id, ownerId: owner.id };
}

export async function insertReceipt(
  identity: Awaited<ReturnType<typeof provision>>,
  cycleId: string,
  status: "pending" | "settled" | "failed" | "blocked",
  amountAtomic: string,
  failedTransaction?: { hash: string; validBefore: Date },
) {
  const atomic = BigInt(amountAtomic);
  const settled = status === "settled";
  const blocked = status === "blocked";
  const txHash = settled
    ? `0x${randomBytes(32).toString("hex")}`
    : (failedTransaction?.hash ?? null);
  await connection.db.insert(receipts).values({
    agentId: identity.agentId,
    amountAtomic,
    amountUsd: `${atomic / BigInt(1_000_000)}.${(atomic % BigInt(1_000_000))
      .toString()
      .padStart(6, "0")}`,
    asset: baseUsdc,
    authorizationNonce: `0x${randomBytes(32).toString("hex")}`,
    authorizationValidBefore:
      failedTransaction?.validBefore ?? new Date("2030-01-01T00:00:00.000Z"),
    cycleId,
    intendedNetwork: blocked ? "eip155:8453" : null,
    network: "eip155:8453",
    payTo,
    reason:
      status === "failed"
        ? failedTransaction
          ? "invalid_exact_evm_transaction_failed"
          : "FLOAT_EMPTY"
        : blocked
          ? "CAP_EXCEEDED"
          : null,
    requestFingerprint: randomBytes(32).toString("hex"),
    settledAt: settled ? new Date("2026-07-17T00:01:00.000Z") : null,
    settlementResponse: settled
      ? { success: true, transaction: txHash }
      : failedTransaction
        ? { success: false, transaction: failedTransaction.hash }
        : null,
    status,
    txHash,
  });
}
