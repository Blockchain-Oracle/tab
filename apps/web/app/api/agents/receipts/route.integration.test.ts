import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createReceiptRouteHarness } from "./receipt-route-test-support";
import { GET } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receipt route tests");
const harness = createReceiptRouteHarness(databaseUrl);

beforeEach(async () => {
  await harness.connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await harness.connection.client.end();
});

describe("GET /api/leash/receipts with real PostgreSQL", () => {
  it("requires an owner session and wires the strict query parser", async () => {
    const owner = await harness.provision("strict");
    const unauthorized = await GET(harness.request(`/api/leash/receipts?agentId=${owner.agentId}`));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");

    const malformed = [
      "/api/leash/receipts",
      `/api/leash/receipts?agentId=${owner.agentId}&agentId=${owner.agentId}`,
      `/api/leash/receipts?agentId=${owner.agentId}&surprise=true`,
      `/api/leash/receipts?agentId=${owner.agentId}&cursor=***`,
      `/api/leash/receipts?agentId=${owner.agentId}&limit=101`,
    ];
    for (const path of malformed) {
      const response = await GET(harness.request(path, owner.token));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_RECEIPT_INPUT" },
      });
    }
  });

  it("lists all statuses newest-first with stable pagination and the public projection", async () => {
    const owner = await harness.provision("feed");
    const createdAt = new Date("2026-07-17T10:00:00.123Z");
    const rows = [
      ["00000000-0000-4000-8000-000000000001", "pending"],
      ["00000000-0000-4000-8000-000000000002", "settled"],
      ["00000000-0000-4000-8000-000000000003", "failed"],
      ["00000000-0000-4000-8000-000000000004", "blocked"],
    ] as const;
    for (const [id, status] of rows) {
      await harness.seedReceipt(owner, { createdAt, id, status });
    }

    const first = await GET(
      harness.request(`/api/leash/receipts?agentId=${owner.agentId}&limit=2`, owner.token),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const firstBody = await first.json();
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await GET(
      harness.request(
        `/api/leash/receipts?agentId=${owner.agentId}&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
        owner.token,
      ),
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("cache-control")).toBe("no-store");
    const secondBody = await second.json();
    const receipts = [...firstBody.receipts, ...secondBody.receipts];
    expect(receipts.map((receipt: { status: string }) => receipt.status)).toEqual([
      "blocked",
      "failed",
      "settled",
      "pending",
    ]);
    expect(secondBody.nextCursor).toBeNull();

    const publicFields = [
      "amountAtomic",
      "amountDisplay",
      "amountUsd",
      "asset",
      "capContext",
      "createdAt",
      "explorer",
      "id",
      "network",
      "origin",
      "payTo",
      "reason",
      "resourceHost",
      "resourceUrl",
      "settledAt",
      "status",
      "txHash",
    ].sort();
    for (const receipt of receipts) {
      expect(Object.keys(receipt).sort()).toEqual(publicFields);
      expect(receipt).toMatchObject({
        amountAtomic: "420000",
        amountDisplay: "$0.42",
        asset: "USDC",
        capContext: {
          capAtomic: "1000000",
          committedBeforeAtomic: "500000",
          projectedAfterAtomic: "920000",
        },
        origin: { clientName: "Claude Code", toolName: "search", transport: "mcp" },
      });
    }
    expect(receipts.find((receipt) => receipt.status === "blocked")).toMatchObject({
      explorer: null,
      network: { id: "eip155:8453", label: "Base", target: true },
      reason: "LEASH_CAP_EXCEEDED",
    });
    expect(receipts.find((receipt) => receipt.status === "pending")).toMatchObject({
      explorer: null,
      reason: null,
      settledAt: null,
      txHash: null,
    });
  });

  it("makes foreign and nonexistent agent feeds the same generic 404", async () => {
    const owner = await harness.provision("owned-feed");
    const foreign = await harness.provision("foreign-feed");
    const responses = await Promise.all(
      [foreign.agentId, randomUUID()].map((agentId) =>
        GET(harness.request(`/api/leash/receipts?agentId=${agentId}`, owner.token)),
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
