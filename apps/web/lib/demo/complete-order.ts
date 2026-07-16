import { and, count, eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { merchants, orders, payments, settlements } from "../db/schema";
import { formatOrderNumber } from "./order-number";

export class DemoPaymentNotFoundError extends Error {
  readonly code = "DEMO_PAYMENT_NOT_FOUND";

  constructor() {
    super("A settled test payment was not found for this merchant.");
    this.name = "DemoPaymentNotFoundError";
  }
}

export async function completeDemoOrder(db: Database, merchantId: string, transactionId: string) {
  if (!transactionId.startsWith("test_") || transactionId.length > 256) {
    throw new DemoPaymentNotFoundError();
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${merchantId}, 0))`,
    );
    const [payment] = await transaction
      .select({
        businessName: merchants.businessName,
        env: payments.env,
        paymentRef: payments.refCode,
      })
      .from(settlements)
      .innerJoin(payments, eq(payments.id, settlements.paymentId))
      .innerJoin(merchants, eq(merchants.id, payments.merchantId))
      .where(
        and(
          eq(settlements.particleTransactionId, transactionId),
          eq(payments.merchantId, merchantId),
          eq(payments.env, "test"),
          eq(payments.status, "settled"),
        ),
      )
      .limit(1);
    if (!payment) throw new DemoPaymentNotFoundError();

    const [existing] = await transaction
      .select({ orderNumber: orders.orderNumber, paymentRef: orders.paymentRef })
      .from(orders)
      .where(eq(orders.paymentRef, payment.paymentRef))
      .limit(1);
    if (existing) return existing;

    const [total] = await transaction
      .select({ value: count(orders.id) })
      .from(orders)
      .where(and(eq(orders.merchantId, merchantId), eq(orders.env, payment.env)));
    const orderNumber = formatOrderNumber(payment.businessName, (total?.value ?? 0) + 1);
    const [created] = await transaction
      .insert(orders)
      .values({
        env: payment.env,
        merchantId,
        orderNumber,
        paymentRef: payment.paymentRef,
      })
      .returning({ orderNumber: orders.orderNumber, paymentRef: orders.paymentRef });
    if (!created) throw new Error("Demo order was not created");
    return created;
  });
}
