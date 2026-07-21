import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, capCycles, receipts, users } from "../../../../lib/db/schema";

export type ReceiptStatus = "pending" | "settled" | "failed" | "blocked";

export interface ReceiptOwner {
  agentId: string;
  cycleId: string;
  ownerId: string;
  token: string;
}

interface ReceiptSeed {
  createdAt: Date;
  id?: string;
  network?: "eip155:8453" | "eip155:42161";
  status: ReceiptStatus;
}

export function receiptTransactionHash(id: string) {
  return `0x${id.replaceAll("-", "").padEnd(64, "a")}`;
}

export function createReceiptRouteHarness(databaseUrl: string) {
  const connection = createDatabase(databaseUrl, 2);
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

  async function provision(label: string): Promise<ReceiptOwner> {
    const email = `${label}-${randomUUID()}@example.test`;
    const [owner] = await connection.db
      .insert(users)
      .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
      .returning({ id: users.id });
    if (!owner) throw new Error("Expected owner");
    const [agent] = await connection.db
      .insert(agents)
      .values({ ownerId: owner.id, name: `${label} agent`, signerSubject: `leash:${randomUUID()}` })
      .returning({ id: agents.id });
    if (!agent) throw new Error("Expected agent");
    const [cycle] = await connection.db
      .insert(capCycles)
      .values({ agentId: agent.id, startedAt: new Date("2026-07-17T09:00:00.000Z") })
      .returning({ id: capCycles.id });
    if (!cycle) throw new Error("Expected cycle");
    return {
      agentId: agent.id,
      cycleId: cycle.id,
      ownerId: owner.id,
      token: await createSessionToken({ email, userId: owner.id }),
    };
  }

  async function seedReceipt(owner: ReceiptOwner, input: ReceiptSeed) {
    const id = input.id ?? randomUUID();
    const network = input.network ?? "eip155:8453";
    await connection.db.insert(receipts).values({
      agentId: owner.agentId,
      amountAtomic: "420000",
      amountUsd: "0.420000",
      asset:
        network === "eip155:8453"
          ? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
          : "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      authorizationNonce: `0x${randomUUID().replaceAll("-", "").padEnd(64, "0")}`,
      authorizationValidBefore: new Date("2026-07-17T11:00:00.000Z"),
      capAtomicAtAttempt: "1000000",
      committedAtomicBefore: "500000",
      createdAt: input.createdAt,
      cycleId: owner.cycleId,
      id,
      intendedNetwork: input.status === "blocked" ? network : null,
      network,
      origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
      payTo: "0x1111111111111111111111111111111111111111",
      reason:
        input.status === "blocked"
          ? "CAP_EXCEEDED"
          : input.status === "failed"
            ? "FACILITATOR_REJECTED"
            : null,
      requestFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "f"),
      resourceHost: "api.example.test",
      resourceUrl: "https://api.example.test/search",
      settlementResponse:
        input.status === "settled"
          ? { success: true, transaction: receiptTransactionHash(id) }
          : null,
      settledAt: input.status === "settled" ? new Date("2026-07-17T10:00:01.000Z") : null,
      status: input.status,
      txHash: input.status === "settled" ? receiptTransactionHash(id) : null,
    });
    return id;
  }

  function request(path: string, token?: string) {
    return new NextRequest(new URL(path, appOrigin), {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
      method: "GET",
    });
  }

  return { connection, provision, request, seedReceipt };
}
