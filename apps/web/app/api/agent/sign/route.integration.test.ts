import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { notifications, receipts } from "../../../../lib/db/schema";
import { POST } from "./route";
import {
  connection,
  createRpcHarness,
  provision,
  request,
  signBody,
} from "./route.integration-support";

describe("POST /api/agent/sign", () => {
  const rpc = createRpcHarness();

  beforeAll(() => rpc.start());

  beforeEach(() => rpc.reset());

  afterAll(() => rpc.stop());

  it("authenticates first and applies the status gate before malformed JSON", async () => {
    const paused = await provision({ status: "paused" });
    const unknown = await POST(request(null, "{", true));
    expect(unknown.status).toBe(401);

    const response = await POST(request(paused.secret, "{", true));
    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AGENT_PAUSED" } });
    expect(rpc.methods).toHaveLength(0);
  });

  it("parses frozen requests but rejects their reservation at the signer gate", async () => {
    const frozen = await provision({ status: "frozen" });
    const malformed = await POST(request(frozen.secret, "{", true));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_SIGN_REQUEST" },
    });
    expect(await connection.db.select({ id: receipts.id }).from(receipts)).toEqual([]);

    const response = await POST(request(frozen.secret, signBody()));
    const body = await response.json();
    expect(response.status).toBe(423);
    expect(body).toMatchObject({ error: { code: "AGENT_FROZEN" } });
    expect(JSON.stringify(body)).not.toContain("signature");
    expect(rpc.methods).toEqual(["eth_chainId", "eth_call"]);

    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({ reason: "AGENT_FROZEN", status: "failed", txHash: null });
  });

  it("rejects malformed authority and no-cap policy before touching RPC", async () => {
    const configured = await provision();
    expect((await POST(request(configured.secret, { arbitrary: "typed data" }))).status).toBe(400);

    await connection.client`truncate table users cascade`;
    const noCap = await provision({ capCents: null });
    const response = await POST(request(noCap.secret, signBody()));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CAP_NOT_SET" } });
    expect(rpc.methods).toHaveLength(0);
  });

  it("rejects an oversized uint256 before PostgreSQL can write partial audit state", async () => {
    const identity = await provision();
    const uint256Max = (BigInt(2) ** BigInt(256) - BigInt(1)).toString();
    const response = await POST(request(identity.secret, signBody(uint256Max)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SIGN_REQUEST" },
    });
    const receiptRows = await connection.db.select({ id: receipts.id }).from(receipts);
    const notificationRows = await connection.db
      .select({ id: notifications.id })
      .from(notifications);
    expect({ notificationRows, receiptRows }).toEqual({ notificationRows: [], receiptRows: [] });
    expect(rpc.methods).toHaveLength(0);
  });

  it("writes cap-exceeded as blocked without reading or signing", async () => {
    const identity = await provision({ capCents: "1" });
    const response = await POST(request(identity.secret, signBody("25000")));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAP_EXCEEDED" },
    });
    const [stored] = await connection.db
      .select({ intendedNetwork: receipts.intendedNetwork, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ intendedNetwork: "eip155:8453", status: "blocked" });
    expect(rpc.methods).toHaveLength(0);
  });

  it("reads live native-USDC balance and records a proven empty float", async () => {
    const identity = await provision();
    rpc.setBalance(BigInt(0));
    const response = await POST(request(identity.secret, signBody()));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FLOAT_EMPTY" } });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ reason: "FLOAT_EMPTY", status: "failed" });
    expect(rpc.methods).toEqual(["eth_chainId", "eth_call"]);
  });

  it("terminalizes a reservation when RPC fails before any signature can escape", async () => {
    const identity = await provision();
    rpc.setUnavailable(true);
    const response = await POST(request(identity.secret, signBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FLOAT_CHECK_UNAVAILABLE" },
    });
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts);
    expect(stored).toEqual({ reason: "FLOAT_CHECK_UNAVAILABLE", status: "failed" });
  });

  it("returns the honest signer block with a failed receipt and no signature or hash", async () => {
    const identity = await provision();
    const response = await POST(request(identity.secret, signBody()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ error: { code: "SIGNER_NOT_CONFIGURED" } });
    expect(JSON.stringify(body)).not.toContain("signature");
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status, txHash: receipts.txHash })
      .from(receipts);
    expect(stored).toEqual({ reason: "SIGNER_NOT_CONFIGURED", status: "failed", txHash: null });
  });
});
