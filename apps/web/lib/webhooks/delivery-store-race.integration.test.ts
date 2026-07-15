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

async function expire(id: string) {
  await ledgerTestConnection.db
    .update(webhookDeliveries)
    .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
    .where(eq(webhookDeliveries.id, id));
}

async function stored(id: string) {
  const [row] = await ledgerTestConnection.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, id));
  return row;
}

describe("expired webhook lease races with real PostgreSQL", () => {
  it("allows late finalization while the expired fence is still the stored owner", async () => {
    const delivery = await createPendingPaymentDelivery();
    const claim = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id);
    if (!claim?.leaseToken) throw new Error("Expected a lease token");
    expect(
      await armWebhookDelivery(
        ledgerTestConnection.db,
        delivery.id,
        claim.leaseToken,
        validSignature,
      ),
    ).toBe(true);
    await expire(delivery.id);

    await expect(
      finalizeWebhookDelivery(ledgerTestConnection.db, delivery.id, claim.leaseToken, {
        completedAt: new Date(),
        responseBodySnippet: "late",
        responseTimeMs: 40,
        result: "delivered",
        signatureHeader: validSignature,
        statusCode: 204,
      }),
    ).resolves.toBe(true);
    expect(await stored(delivery.id)).toMatchObject({ leaseToken: null, result: "delivered" });
  });

  it("lets exactly one expired finalizer or reclaimer win the token race", async () => {
    const delivery = await createPendingPaymentDelivery();
    const claim = await claimWebhookDelivery(ledgerTestConnection.db, delivery.id);
    if (!claim?.leaseToken) throw new Error("Expected a lease token");
    await expire(delivery.id);

    const [finalized, reclaimed] = await Promise.all([
      finalizeWebhookDelivery(ledgerTestConnection.db, delivery.id, claim.leaseToken, {
        completedAt: new Date(),
        responseBodySnippet: "race",
        responseTimeMs: 40,
        result: "delivered",
        signatureHeader: validSignature,
        statusCode: 204,
      }),
      claimWebhookDelivery(ledgerTestConnection.db, delivery.id),
    ]);

    expect(Number(finalized) + Number(reclaimed !== null)).toBe(1);
    const row = await stored(delivery.id);
    if (finalized) expect(row).toMatchObject({ leaseToken: null, result: "delivered" });
    else expect(row).toMatchObject({ leaseToken: reclaimed?.leaseToken, result: "pending" });
  });
});
