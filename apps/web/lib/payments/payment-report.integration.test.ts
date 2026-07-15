import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";
import { payments, settlements } from "../db/schema";
import { PaymentReportConflictError, reportPayment } from "./payment-report";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for payment-report tests");

const connection = createDatabase(databaseUrl, 4);
const payerAddress = "0x9999999999999999999999999999999999999999";

async function merchant(label: string) {
  return provisionMerchant(connection.db, {
    email: `${label}-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
}

async function payment(merchantId: string, env: "live" | "test") {
  const [row] = await connection.db
    .insert(payments)
    .values({
      amountUsd: "7.250000",
      currency: "USD",
      env,
      intentUrl: "https://merchant.example.test/payment-intent",
      livemode: env === "live",
      merchantId,
      refCode: `TAB-${randomUUID().slice(0, 8).toUpperCase()}`,
      receiver: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      tokenChainId: 42161,
    })
    .returning({ id: payments.id });
  if (!row) throw new Error("Expected a payment row");
  return row.id;
}

function evidence(transactionId = `test_${randomUUID()}`) {
  return {
    tokenChanges: [{ from: payerAddress, source: "tab_normalized_candidate" }],
    transactionId,
  };
}

describe("payment reporting with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`truncate table users cascade`;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("atomically creates one explicitly simulated test settlement under concurrent replay", async () => {
    const identity = await merchant("report-test");
    const paymentId = await payment(identity.merchantId, "test");
    const report = evidence();
    const principal = { env: "test" as const, merchantId: identity.merchantId };

    const results = await Promise.all([
      reportPayment(connection.db, principal, paymentId, report, { payerAddress }, "inline"),
      reportPayment(connection.db, principal, paymentId, report, { payerAddress }, "inline"),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ status: "settled", verificationMethod: "simulated_test" }),
      expect.objectContaining({ status: "settled", verificationMethod: "simulated_test" }),
    ]);

    const [storedPayment] = await connection.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    const storedSettlements = await connection.db
      .select()
      .from(settlements)
      .where(eq(settlements.paymentId, paymentId));
    expect(storedPayment).toMatchObject({
      payerAddress,
      payerEmail: null,
      reportedTokenChanges: report.tokenChanges,
      reportedTransactionId: report.transactionId,
      status: "settled",
    });
    expect(storedPayment?.settledAt).toBeInstanceOf(Date);
    expect(storedSettlements).toHaveLength(1);
    expect(storedSettlements[0]).toMatchObject({
      amountAtomic: "7250000",
      livemode: false,
      particleTransactionId: report.transactionId,
      tokenChangesJson: [
        {
          amountAtomic: "7250000",
          chainId: 42161,
          receiver: "0x1111111111111111111111111111111111111111",
          simulation: "simulated_test",
          tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
      ],
      verificationMethod: "simulated_test",
      verificationTrigger: "inline",
    });
  });

  it("stores live evidence but remains honestly pending without a settlement", async () => {
    const identity = await merchant("report-live");
    const paymentId = await payment(identity.merchantId, "live");
    const report = evidence(`live_candidate_${randomUUID()}`);

    await expect(
      reportPayment(
        connection.db,
        { env: "live", merchantId: identity.merchantId },
        paymentId,
        report,
        { payerAddress },
        "inline",
      ),
    ).resolves.toMatchObject({ status: "pending", verificationMethod: null });

    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(stored).toMatchObject({
      payerAddress,
      reportedTransactionId: report.transactionId,
      settledAt: null,
      status: "pending",
    });
    expect(await connection.db.select().from(settlements)).toHaveLength(0);
  });

  it("rejects cross-scope access and serializes conflicting reports to one winner", async () => {
    const first = await merchant("report-first");
    const second = await merchant("report-second");
    const paymentId = await payment(first.merchantId, "test");
    const livePaymentId = await payment(first.merchantId, "live");
    const principal = { env: "test" as const, merchantId: first.merchantId };
    const candidates = [evidence(), evidence()] as const;

    await expect(
      reportPayment(
        connection.db,
        { env: "test", merchantId: second.merchantId },
        paymentId,
        candidates[0],
        { payerAddress },
        "inline",
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
    await expect(
      reportPayment(
        connection.db,
        principal,
        livePaymentId,
        candidates[0],
        { payerAddress },
        "inline",
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });

    const results = await Promise.allSettled(
      candidates.map((candidate) =>
        reportPayment(connection.db, principal, paymentId, candidate, { payerAddress }, "inline"),
      ),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(PaymentReportConflictError);

    const [stored] = await connection.db.select().from(payments).where(eq(payments.id, paymentId));
    expect(stored?.reportedTransactionId).toBe(fulfilled[0]?.value.reportedTransactionId);
    expect(await connection.db.select().from(settlements)).toHaveLength(1);
  });
});
