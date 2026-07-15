import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries } from "../db/schema";
import {
  armWebhookDelivery,
  claimWebhookDelivery,
  finalizeWebhookDelivery,
} from "./delivery-store";
import {
  closeLedgerTests,
  createPendingPaymentDelivery,
  ledgerTestConnection,
  resetLedgerTests,
  validSignature,
} from "./delivery-store-test-support";

beforeEach(resetLedgerTests);
afterAll(closeLedgerTests);

async function stored(id: string) {
  const [row] = await ledgerTestConnection.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, id));
  return row;
}

describe("webhook delivery claims with real PostgreSQL", () => {
  it("atomically grants one 30-second lease under concurrent claims", async () => {
    const delivery = await createPendingPaymentDelivery();
    const before = Date.now();
    const claims = await Promise.all([
      claimWebhookDelivery(ledgerTestConnection.db, delivery.id),
      claimWebhookDelivery(ledgerTestConnection.db, delivery.id),
    ]);

    const claim = claims.find((candidate) => candidate !== null);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claim).toMatchObject({ id: delivery.id, result: "pending" });
    expect(claim?.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(claim?.leaseExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 29_000);
    expect(claim?.leaseExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 30_500);
    expect(claim?.startedAt).toBeInstanceOf(Date);
  });

  it("reclaims an expired short lease with a new fencing token", async () => {
    const delivery = await createPendingPaymentDelivery();
    const first = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id, 20);
    expect(first).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const reclaimed = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id, 20);
    expect(reclaimed?.leaseToken).not.toBe(first?.leaseToken);
    expect(reclaimed?.signatureHeader).toBeNull();
  });

  it("arms only the current unexpired fence and renews its lease", async () => {
    const delivery = await createPendingPaymentDelivery();
    const stale = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id, 20);
    if (!stale?.leaseToken) throw new Error("Expected a lease token");
    await new Promise((resolve) => setTimeout(resolve, 40));
    await expect(
      armWebhookDelivery(
        ledgerTestConnection.db,
        delivery.id,
        stale.leaseToken,
        validSignature,
        1_000,
      ),
    ).resolves.toBe(false);

    const current = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id, 100);
    if (!current?.leaseToken) throw new Error("Expected a reclaimed lease token");
    await expect(
      armWebhookDelivery(ledgerTestConnection.db, delivery.id, stale.leaseToken, validSignature),
    ).resolves.toBe(false);
    const before = Date.now();
    await expect(
      armWebhookDelivery(ledgerTestConnection.db, delivery.id, current.leaseToken, validSignature),
    ).resolves.toBe(true);
    expect(await stored(delivery.id)).toMatchObject({ signatureHeader: validSignature });
    expect((await stored(delivery.id))?.leaseExpiresAt?.getTime()).toBeGreaterThanOrEqual(
      before + 29_000,
    );
  });
});

describe("webhook delivery finalization with real PostgreSQL", () => {
  it("uses the lease token as a compare-and-swap fence", async () => {
    const delivery = await createPendingPaymentDelivery();
    const claim = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id);
    if (!claim?.leaseToken) throw new Error("Expected a lease token");
    const completedAt = new Date();
    const outcome = {
      completedAt,
      responseBodySnippet: "ok",
      responseTimeMs: 12,
      result: "delivered" as const,
      signatureHeader: validSignature,
      statusCode: 204,
    };

    await expect(
      finalizeWebhookDelivery(ledgerTestConnection.db, delivery.id, randomUUID(), outcome),
    ).resolves.toBe(false);
    expect((await stored(delivery.id))?.leaseToken).toBe(claim.leaseToken);
    await expect(
      finalizeWebhookDelivery(ledgerTestConnection.db, delivery.id, claim.leaseToken, outcome),
    ).resolves.toBe(true);
    expect(await stored(delivery.id)).toMatchObject({
      completedAt,
      leaseExpiresAt: null,
      leaseToken: null,
      result: "delivered",
      statusCode: 204,
    });
    await expect(
      finalizeWebhookDelivery(ledgerTestConnection.db, delivery.id, claim.leaseToken, outcome),
    ).resolves.toBe(false);
  });

  it.each([
    {
      expected: { failureKind: "http", result: "retrying", statusCode: 500 },
      outcome: {
        completedAt: new Date(),
        failureKind: "http" as const,
        nextRetryAt: new Date(Date.now() + 60_000),
        responseBodySnippet: "no",
        responseTimeMs: 8,
        result: "retrying" as const,
        signatureHeader: validSignature,
        statusCode: 500,
      },
    },
    {
      expected: { failureKind: "configuration", result: "failed" },
      outcome: { completedAt: new Date(), result: "configuration" as const },
    },
  ])("persists a strict $outcome.result outcome", async ({ expected, outcome }) => {
    const delivery = await createPendingPaymentDelivery();
    const claim = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id);
    if (!claim?.leaseToken) throw new Error("Expected a lease token");

    expect(
      await finalizeWebhookDelivery(
        ledgerTestConnection.db,
        delivery.id,
        claim.leaseToken,
        outcome,
      ),
    ).toBe(true);
    expect(await stored(delivery.id)).toMatchObject(expected);
  });
});
