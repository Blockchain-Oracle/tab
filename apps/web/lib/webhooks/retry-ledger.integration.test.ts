import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries } from "../db/schema";
import { claimWebhookDelivery, finalizeWebhookDelivery } from "./delivery-store";
import {
  closeLedgerTests,
  createPendingPaymentDelivery,
  ledgerTestConnection,
  resetLedgerTests,
  validSignature,
} from "./delivery-store-test-support";
import { promoteDueWebhookRetry } from "./retry-ledger";

beforeEach(resetLedgerTests);
afterAll(closeLedgerTests);

async function scheduleRetry(id: string, failureKind: "http" | "network" | "timeout" = "http") {
  const claim = await claimWebhookDelivery(ledgerTestConnection.db, id);
  if (!claim?.leaseToken) throw new Error("Expected a delivery lease");
  const failure =
    failureKind === "http"
      ? ({ failureKind, statusCode: 503 } as const)
      : ({ failureKind, statusCode: null } as const);
  const finalized = await finalizeWebhookDelivery(ledgerTestConnection.db, id, claim.leaseToken, {
    completedAt: new Date(),
    nextRetryAt: new Date(Date.now() - 1_000),
    responseBodySnippet: "retry",
    responseTimeMs: 9,
    result: "retrying",
    signatureHeader: validSignature,
    ...failure,
  });
  expect(finalized).toBe(true);
}

async function chain(retryChainId: string) {
  return ledgerTestConnection.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.retryChainId, retryChainId))
    .orderBy(asc(webhookDeliveries.attempt));
}

describe("webhook retry promotion with real PostgreSQL", () => {
  it("copies immutable scope and evidence into one sequential child", async () => {
    const parent = await createPendingPaymentDelivery();
    await scheduleRetry(parent.id);

    const child = await promoteDueWebhookRetry(ledgerTestConnection.db);
    expect(child).toMatchObject({
      attempt: 2,
      endpointId: parent.endpointId,
      env: parent.env,
      eventId: parent.eventId,
      merchantId: parent.merchantId,
      parentAttempt: 1,
      parentDeliveryId: parent.id,
      paymentId: parent.paymentId,
      requestBody: parent.requestBody,
      result: "pending",
      retryChainId: parent.retryChainId,
      settlementId: parent.settlementId,
      trigger: parent.trigger,
      type: parent.type,
    });
    const rows = await chain(parent.retryChainId);
    expect(rows[0]).toMatchObject({
      nextRetryAt: null,
      result: "failed",
      supersededByAttempt: 2,
      supersededById: child?.id,
    });
    expect(rows).toHaveLength(2);
  });

  it("allows only one concurrent promoter to create the next attempt", async () => {
    const parent = await createPendingPaymentDelivery();
    await scheduleRetry(parent.id, "network");

    const promoted = await Promise.all([
      promoteDueWebhookRetry(ledgerTestConnection.db),
      promoteDueWebhookRetry(ledgerTestConnection.db),
    ]);
    expect(promoted.filter(Boolean)).toHaveLength(1);
    expect(await chain(parent.retryChainId)).toHaveLength(2);
  });

  it("promotes timeout lineage through attempt three and supports terminal gave_up", async () => {
    const root = await createPendingPaymentDelivery();
    await scheduleRetry(root.id, "timeout");
    const second = await promoteDueWebhookRetry(ledgerTestConnection.db);
    if (!second) throw new Error("Expected attempt two");
    await scheduleRetry(second.id, "timeout");

    const third = await promoteDueWebhookRetry(ledgerTestConnection.db);
    if (!third) throw new Error("Expected attempt three");
    expect(third).toMatchObject({ attempt: 3, parentDeliveryId: second.id });
    const secondStored = (await chain(root.retryChainId))[1];
    expect(secondStored).toMatchObject({
      nextRetryAt: null,
      result: "timeout",
      supersededById: third.id,
    });

    const claim = await claimWebhookDelivery(ledgerTestConnection.db, third.id);
    if (!claim?.leaseToken) throw new Error("Expected attempt-three lease");
    expect(
      await finalizeWebhookDelivery(ledgerTestConnection.db, third.id, claim.leaseToken, {
        completedAt: new Date(),
        failureKind: "timeout",
        responseBodySnippet: "timeout",
        responseTimeMs: 10_000,
        result: "gave_up",
        signatureHeader: validSignature,
        statusCode: null,
      }),
    ).toBe(true);
    expect((await chain(root.retryChainId))[2]).toMatchObject({ result: "gave_up" });
  });

  it("leaves future retry rows untouched", async () => {
    const parent = await createPendingPaymentDelivery();
    await scheduleRetry(parent.id);
    await ledgerTestConnection.db
      .update(webhookDeliveries)
      .set({ nextRetryAt: new Date(Date.now() + 60_000) })
      .where(and(eq(webhookDeliveries.id, parent.id), eq(webhookDeliveries.result, "retrying")));

    await expect(promoteDueWebhookRetry(ledgerTestConnection.db)).resolves.toBeNull();
    expect(await chain(parent.retryChainId)).toHaveLength(1);
  });
});
