import { hashTypedData } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { asc, eq } from "drizzle-orm";

import { receipts } from "../../../../lib/db/schema";
import { MagicExpressError } from "../../../../lib/leash/magic-express";
import { createSignPost } from "./route";
import {
  connection,
  createRpcHarness,
  provision,
  request,
  signBody,
} from "./route.integration-support";

describe("POST /api/agent/sign provider lifecycle", () => {
  const rpc = createRpcHarness();

  beforeAll(() => rpc.start());
  beforeEach(() => rpc.reset());
  afterAll(() => rpc.stop());

  it("persists and idempotently replays one provider-backed signature", async () => {
    const identity = await provision();
    let signingCalls = 0;
    const signedPost = createSignPost({
      signer: {
        async signTypedData({ typedData }) {
          signingCalls += 1;
          return {
            digest: hashTypedData(typedData),
            signature: `0x${"22".repeat(65)}` as `0x${string}`,
          };
        },
      },
      signerConfigured: () => true,
    });
    const body = signBody();

    const first = await signedPost(request(identity.secret, body));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({
      receiptId: expect.any(String),
      signature: expect.any(String),
    });

    const replay = await signedPost(request(identity.secret, body));
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(signingCalls).toBe(1);
    const [stored] = await connection.db
      .select({ attempts: receipts.signingAttempts, signature: receipts.signingSignature })
      .from(receipts);
    expect(stored).toEqual({ attempts: 1, signature: firstBody.signature });
  });

  it("allows only one Magic call for concurrent duplicate requests", async () => {
    const identity = await provision();
    let signingCalls = 0;
    let releaseSigning: (() => void) | undefined;
    let signingStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signingStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseSigning = resolve;
    });
    const signedPost = createSignPost({
      signer: {
        async signTypedData({ typedData }) {
          signingCalls += 1;
          signingStarted?.();
          await released;
          return {
            digest: hashTypedData(typedData),
            signature: `0x${"33".repeat(65)}` as `0x${string}`,
          };
        },
      },
      signerConfigured: () => true,
    });
    const body = signBody();

    const first = signedPost(request(identity.secret, body));
    await started;
    const duplicate = await signedPost(request(identity.secret, body));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "SIGN_REQUEST_IN_PROGRESS" },
    });
    releaseSigning?.();
    expect((await first).status).toBe(200);
    expect(signingCalls).toBe(1);
  });

  it("retains an ambiguous timeout lease and does not immediately sign again", async () => {
    const identity = await provision();
    let signingCalls = 0;
    const signedPost = createSignPost({
      signer: {
        async signTypedData() {
          signingCalls += 1;
          throw new MagicExpressError("SIGNER_PROVIDER_TIMEOUT");
        },
      },
      signerConfigured: () => true,
    });
    const body = signBody();

    const timeout = await signedPost(request(identity.secret, body));
    expect(timeout.status).toBe(503);
    await expect(timeout.json()).resolves.toMatchObject({
      error: { code: "SIGNER_PROVIDER_TIMEOUT" },
    });
    const retry = await signedPost(request(identity.secret, body));
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "SIGN_REQUEST_IN_PROGRESS" },
    });
    expect(signingCalls).toBe(1);
    const [stored] = await connection.db
      .select({
        claim: receipts.signingClaimToken,
        reason: receipts.reason,
        status: receipts.status,
      })
      .from(receipts);
    expect(stored).toMatchObject({ claim: expect.any(String), reason: null, status: "pending" });
  });

  it("releases an expired orphan only after finalized-unused proof so a later payment can sign", async () => {
    const identity = await provision({ capCents: "3" });
    const finalizedAuthorizationUsed = vi.fn(async () => false);
    let signingCalls = 0;
    const signedPost = createSignPost({
      finalizedAuthorizationUsed,
      signer: {
        async signTypedData({ typedData }) {
          signingCalls += 1;
          if (signingCalls === 1) throw new MagicExpressError("SIGNER_PROVIDER_TIMEOUT");
          return {
            digest: hashTypedData(typedData),
            signature: `0x${"44".repeat(65)}` as `0x${string}`,
          };
        },
      },
      signerConfigured: () => true,
    });

    const timeout = await signedPost(request(identity.secret, signBody()));
    expect(timeout.status).toBe(503);
    expect(JSON.stringify(await timeout.json())).not.toContain("receiptId");
    const [orphan] = await connection.db.select({ id: receipts.id }).from(receipts);
    if (!orphan) throw new Error("Expected the timed-out pending receipt");
    await connection.db
      .update(receipts)
      .set({ authorizationValidBefore: new Date(Date.now() - 1_000) })
      .where(eq(receipts.id, orphan.id));

    const independent = await signedPost(request(identity.secret, signBody()));
    expect(independent.status).toBe(200);
    expect(signingCalls).toBe(2);
    expect(finalizedAuthorizationUsed).toHaveBeenCalledOnce();
    const stored = await connection.db
      .select({ id: receipts.id, reason: receipts.reason, status: receipts.status })
      .from(receipts)
      .orderBy(asc(receipts.createdAt), asc(receipts.id));
    expect(stored).toEqual([
      { id: orphan.id, reason: "AUTHORIZATION_EXPIRED", status: "failed" },
      { id: expect.any(String), reason: null, status: "pending" },
    ]);
  });

  it.each([
    ["used", async () => true],
    [
      "unavailable",
      async () => {
        throw new Error("finalized-proof-unavailable-must-not-escape");
      },
    ],
  ])("keeps an expired orphan committed when finalized proof is %s", async (_proof, proof) => {
    const identity = await provision({ capCents: "3" });
    const finalizedAuthorizationUsed = vi.fn(proof);
    let signingCalls = 0;
    const signedPost = createSignPost({
      finalizedAuthorizationUsed,
      signer: {
        async signTypedData() {
          signingCalls += 1;
          throw new MagicExpressError("SIGNER_PROVIDER_TIMEOUT");
        },
      },
      signerConfigured: () => true,
    });

    expect((await signedPost(request(identity.secret, signBody()))).status).toBe(503);
    const [orphan] = await connection.db.select({ id: receipts.id }).from(receipts);
    if (!orphan) throw new Error("Expected the timed-out pending receipt");
    await connection.db
      .update(receipts)
      .set({ authorizationValidBefore: new Date(Date.now() - 1_000) })
      .where(eq(receipts.id, orphan.id));

    const independent = await signedPost(request(identity.secret, signBody()));
    expect(independent.status).toBe(403);
    await expect(independent.json()).resolves.toMatchObject({
      error: { code: "CAP_EXCEEDED" },
    });
    expect(signingCalls).toBe(1);
    expect(finalizedAuthorizationUsed).toHaveBeenCalledOnce();
    const [stored] = await connection.db
      .select({ reason: receipts.reason, status: receipts.status })
      .from(receipts)
      .where(eq(receipts.id, orphan.id));
    expect(stored).toEqual({ reason: null, status: "pending" });
  });

  it("terminalizes a definite provider rejection with no signature", async () => {
    const identity = await provision();
    const signedPost = createSignPost({
      signer: {
        async signTypedData() {
          throw new MagicExpressError("SIGNER_PROVIDER_REJECTED");
        },
      },
      signerConfigured: () => true,
    });

    const response = await signedPost(request(identity.secret, signBody()));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SIGNER_PROVIDER_REJECTED" },
    });
    const [stored] = await connection.db
      .select({
        claim: receipts.signingClaimToken,
        reason: receipts.reason,
        status: receipts.status,
      })
      .from(receipts);
    expect(stored).toEqual({ claim: null, reason: "SIGNER_PROVIDER_REJECTED", status: "failed" });
  });
});
