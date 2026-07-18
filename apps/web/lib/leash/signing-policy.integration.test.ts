import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { receipts } from "../db/schema";
import { setOwnerCap } from "./cap-policy";
import { completePreSigningChecks, reserveSignRequest } from "./sign-store";
import { connection, nowSeconds, provision, signBody } from "./sign-store.integration-support";
import { claimSigningLease } from "./signing-lease";

const DIGEST = `0x${"11".repeat(32)}` as const;
const LIVE_BALANCE = BigInt(10_000_000);

describe("atomic final signing policy", () => {
  it("denies a cap lowering committed between preflight and the provider lease", async () => {
    const identity = await provision({ capCents: "100" });
    const reserved = await reserveSignRequest(connection.db, {
      agentId: identity.agentId,
      body: signBody("250000"),
      keyId: identity.keyId,
      nowSeconds,
    });
    if (reserved.kind !== "pending") throw new Error("Expected a pending reservation");
    await expect(
      completePreSigningChecks(connection.db, {
        agentId: identity.agentId,
        keyId: identity.keyId,
        liveBalanceAtomic: LIVE_BALANCE,
        nowSeconds,
        receiptId: reserved.receiptId,
        signerAvailable: true,
      }),
    ).resolves.toMatchObject({ kind: "ready" });

    await setOwnerCap(connection.db, {
      agentId: identity.agentId,
      amountUsdCents: "1",
      frequency: "daily",
      now: new Date((nowSeconds + 1) * 1_000),
      ownerId: identity.ownerId,
    });
    await expect(
      claimSigningLease(connection.db, {
        agentId: identity.agentId,
        digest: DIGEST,
        floatCheckedAt: new Date((nowSeconds + 2) * 1_000),
        keyId: identity.keyId,
        liveBalanceAtomic: LIVE_BALANCE,
        now: new Date((nowSeconds + 2) * 1_000),
        receiptId: reserved.receiptId,
      }),
    ).resolves.toMatchObject({ code: "LEASH_CAP_EXCEEDED", kind: "denied" });

    const [stored] = await connection.db
      .select({
        attempts: receipts.signingAttempts,
        claim: receipts.signingClaimToken,
        status: receipts.status,
      })
      .from(receipts)
      .where(eq(receipts.id, reserved.receiptId));
    expect(stored).toEqual({ attempts: 0, claim: null, status: "blocked" });
  });
});
