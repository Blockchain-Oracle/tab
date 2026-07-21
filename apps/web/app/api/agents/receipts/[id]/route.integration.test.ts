import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createReceiptRouteHarness, receiptTransactionHash } from "../receipt-route-test-support";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt detail route tests");
const harness = createReceiptRouteHarness(databaseUrl);
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await harness.connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await harness.connection.client.end();
});

describe("GET /api/leash/receipts/:id with real PostgreSQL", () => {
  it("requires an owner session and rejects a malformed path identifier", async () => {
    const owner = await harness.provision("detail-auth");
    const id = await harness.seedReceipt(owner, {
      createdAt: new Date("2026-07-17T10:00:00.123Z"),
      status: "pending",
    });

    const unauthorized = await GET(harness.request(`/api/leash/receipts/${id}`), context(id));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");

    const malformed = await GET(
      harness.request("/api/leash/receipts/not-a-uuid", owner.token),
      context("not-a-uuid"),
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("cache-control")).toBe("no-store");
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_RECEIPT_INPUT" },
    });
  });

  it("returns exact settled evidence through the sanitized public projection", async () => {
    const owner = await harness.provision("detail-evidence");
    const id = await harness.seedReceipt(owner, {
      createdAt: new Date("2026-07-17T10:00:00.123Z"),
      network: "eip155:42161",
      status: "settled",
    });
    const response = await GET(
      harness.request(`/api/leash/receipts/${id}`, owner.token),
      context(id),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      receipt: {
        amountAtomic: "420000",
        amountDisplay: "$0.42",
        amountUsd: "0.420000",
        asset: "USDC",
        capContext: {
          capAtomic: "1000000",
          committedBeforeAtomic: "500000",
          projectedAfterAtomic: "920000",
        },
        createdAt: "2026-07-17T10:00:00.123Z",
        explorer: {
          href: `https://arbiscan.io/tx/${receiptTransactionHash(id)}`,
          label: "View on Arbiscan",
        },
        id,
        network: {
          id: "eip155:42161",
          label: "Arbitrum",
          target: false,
          testFunds: false,
        },
        origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
        payTo: "0x1111111111111111111111111111111111111111",
        reason: null,
        resourceHost: "api.example.test",
        resourceUrl: "https://api.example.test/search",
        settledAt: "2026-07-17T10:00:01.000Z",
        status: "settled",
        txHash: receiptTransactionHash(id),
      },
    });
    expect(JSON.stringify(body)).not.toContain("authorizationNonce");
    expect(JSON.stringify(body)).not.toContain("requestFingerprint");
    expect(JSON.stringify(body)).not.toContain("settlementResponse");
  });

  it("makes foreign and nonexistent receipt details the same generic 404", async () => {
    const owner = await harness.provision("detail-owned");
    const foreign = await harness.provision("detail-foreign");
    const foreignId = await harness.seedReceipt(foreign, {
      createdAt: new Date("2026-07-17T10:00:00.123Z"),
      status: "failed",
    });
    const missingId = randomUUID();
    const responses = await Promise.all(
      [foreignId, missingId].map((id) =>
        GET(harness.request(`/api/leash/receipts/${id}`, owner.token), context(id)),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(responses.map((response) => response.headers.get("cache-control"))).toEqual([
      "no-store",
      "no-store",
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({
      error: {
        code: "LEASH_RESOURCE_NOT_FOUND",
        message: "The Leash receipt resource was not found.",
      },
    });
  });
});
