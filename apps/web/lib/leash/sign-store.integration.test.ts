import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { completePreSigningChecks, reserveSignRequest, type SignGateError } from "./sign-store";
import {
  connection,
  insertCommitted,
  insertRevertedAuthorization,
  nowSeconds,
  provision,
  signBody,
} from "./sign-store.integration-support";

describe("atomic hosted-signer reservation gate", () => {
  it.each([
    ["paused", "AGENT_PAUSED"],
    ["cancelled", "AGENT_CANCELLED"],
    ["nuked", "AGENT_CANCELLED"],
  ] as const)("rejects %s before parsing an invalid request", async (status, code) => {
    const identity = await provision({ status });
    await expect(
      reserveSignRequest(connection.db, {
        ...identity,
        body: { invalid: true },
        nowSeconds,
      }),
    ).rejects.toMatchObject({ code, status: 423 } satisfies Partial<SignGateError>);
    const [count] = await connection.client<{ count: string }[]>`select count(*) from receipts`;
    expect(count?.count).toBe("0");
  });

  it("reserves a frozen request, then persists the signer-stage rejection as failed evidence", async () => {
    const identity = await provision({ status: "frozen" });
    const reservation = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody(),
      nowSeconds,
    });
    expect(reservation).toMatchObject({ kind: "pending", replayed: false });
    if (reservation.kind !== "pending") throw new Error("Expected a frozen reservation");

    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(1_000_000),
        nowSeconds,
        receiptId: reservation.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({
      code: "AGENT_FROZEN",
      kind: "failed",
      receiptId: reservation.receiptId,
    });

    const [stored] = await connection.client<
      { reason: string | null; status: string; tx_hash: string | null }[]
    >`
      select status, reason, tx_hash from receipts where id = ${reservation.receiptId}
    `;
    expect(stored).toEqual({ reason: "AGENT_FROZEN", status: "failed", tx_hash: null });
  });

  it("excludes only non-replayable failures and blocked attempts from committed spend", async () => {
    const identity = await provision({ capCents: "100" });
    await insertCommitted(identity.agentId, identity.cycleId, "settled", "300000");
    await insertCommitted(identity.agentId, identity.cycleId, "pending", "300000");
    await insertCommitted(identity.agentId, identity.cycleId, "failed", "900000");
    await insertCommitted(identity.agentId, identity.cycleId, "blocked", "900000");

    const exact = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("400000"),
      nowSeconds,
    });
    expect(exact).toMatchObject({ kind: "pending", replayed: false });
    const blocked = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("1"),
      nowSeconds,
    });
    expect(blocked).toMatchObject({ code: "CAP_EXCEEDED", kind: "blocked" });

    const stored = await connection.client<
      {
        cap_atomic_at_attempt: string | null;
        committed_atomic_before: string | null;
        id: string;
        intended_network: string | null;
        status: string;
      }[]
    >`
      select id, status, intended_network, cap_atomic_at_attempt, committed_atomic_before
      from receipts
      where id in (${exact.receiptId}, ${blocked.receiptId})
      order by id
    `;
    expect(stored).toEqual(
      [
        {
          cap_atomic_at_attempt: "1000000",
          committed_atomic_before: "600000",
          id: exact.receiptId,
          intended_network: null,
          status: "pending",
        },
        {
          cap_atomic_at_attempt: "1000000",
          committed_atomic_before: "1000000",
          id: blocked.receiptId,
          intended_network: "eip155:8453",
          status: "blocked",
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("keeps a reverted authorization committed after validBefore for the whole cycle", async () => {
    const identity = await provision({ capCents: "100" });
    await insertRevertedAuthorization(identity.agentId, identity.cycleId, "700000", nowSeconds);

    const exact = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("300000"),
      nowSeconds,
    });
    expect(exact).toMatchObject({ kind: "pending", replayed: false });
    const blocked = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("1"),
      nowSeconds,
    });
    expect(blocked).toMatchObject({ code: "CAP_EXCEEDED", kind: "blocked" });

    const [stored] = await connection.client<
      { committed_atomic_before: string | null; status: string }[]
    >`
      select committed_atomic_before, status from receipts where id = ${exact.receiptId}
    `;
    expect(stored).toEqual({ committed_atomic_before: "700000", status: "pending" });
  });
  it("serializes concurrent requests so only one can reserve the remaining cap", async () => {
    const identity = await provision({ capCents: "50" });
    const results = await Promise.all(
      [signBody("300000"), signBody("300000")].map((body) =>
        reserveSignRequest(connection.db, { ...identity, body, nowSeconds }),
      ),
    );
    expect(results.map((result) => result.kind).sort()).toEqual(["blocked", "pending"]);
  });

  it("reuses an identical nonce reservation without double-counting it", async () => {
    const identity = await provision();
    const body = signBody();
    const first = await reserveSignRequest(connection.db, { ...identity, body, nowSeconds });
    const second = await reserveSignRequest(connection.db, { ...identity, body, nowSeconds });
    expect(second).toMatchObject({ kind: "pending", receiptId: first.receiptId, replayed: true });
    const [count] = await connection.client<{ count: string }[]>`select count(*) from receipts`;
    expect(count?.count).toBe("1");
  });

  it("treats case variants of one EIP-3009 nonce as the same reservation", async () => {
    const identity = await provision();
    const mixedCaseNonce = "aB".repeat(32);
    const first = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("250000", mixedCaseNonce),
      nowSeconds,
    });
    const second = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("250000", mixedCaseNonce.toLowerCase()),
      nowSeconds,
    });

    expect(second).toMatchObject({ kind: "pending", receiptId: first.receiptId, replayed: true });
    const rows = await connection.client<{ authorization_nonce: string }[]>`
      select authorization_nonce from receipts where agent_id = ${identity.agentId}
    `;
    expect(rows).toEqual([{ authorization_nonce: `0x${"ab".repeat(32)}` }]);
  });

  it("replays a migrated legacy receipt by semantics without rewriting its audit fingerprint", async () => {
    const identity = await provision();
    const mixedCaseNonce = "aB".repeat(32);
    const body = signBody("250000", mixedCaseNonce);
    const first = await reserveSignRequest(connection.db, { ...identity, body, nowSeconds });
    const legacyFingerprint = "f".repeat(64);
    await connection.client`
      update receipts set request_fingerprint = ${legacyFingerprint} where id = ${first.receiptId}
    `;

    const replay = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("250000", mixedCaseNonce.toLowerCase()),
      nowSeconds,
    });

    expect(replay).toMatchObject({ kind: "pending", receiptId: first.receiptId, replayed: true });
    const [stored] = await connection.client<{ request_fingerprint: string }[]>`
      select request_fingerprint from receipts where id = ${first.receiptId}
    `;
    expect(stored?.request_fingerprint).toBe(legacyFingerprint);
  });

  it("rejects a reused nonce when the stored payment semantics differ", async () => {
    const identity = await provision();
    const nonce = randomBytes(32).toString("hex");
    await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("250000", nonce),
      nowSeconds,
    });

    await expect(
      reserveSignRequest(connection.db, {
        ...identity,
        body: signBody("250001", nonce),
        nowSeconds,
      }),
    ).rejects.toMatchObject({
      code: "SIGN_REQUEST_CONFLICT",
      status: 409,
    } satisfies Partial<SignGateError>);
  });

  it("fails safely before signing when pending floats overcommit or the signer is blocked", async () => {
    const identity = await provision({ capCents: "200" });
    const first = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("600000"),
      nowSeconds,
    });
    const second = await reserveSignRequest(connection.db, {
      ...identity,
      body: signBody("600000"),
      nowSeconds,
    });
    if (first.kind !== "pending" || second.kind !== "pending") throw new Error("Expected pending");

    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(1_000_000),
        nowSeconds,
        receiptId: second.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ code: "FLOAT_EMPTY", kind: "failed" });
    await expect(
      completePreSigningChecks(connection.db, {
        ...identity,
        liveBalanceAtomic: BigInt(1_000_000),
        nowSeconds,
        receiptId: first.receiptId,
        signerAvailable: false,
      }),
    ).resolves.toMatchObject({ code: "SIGNER_NOT_CONFIGURED", kind: "failed" });
  });
});
