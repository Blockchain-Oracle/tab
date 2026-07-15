import { and, desc, eq } from "drizzle-orm";

import type { ApiEnvironment } from "../auth/api-key";
import type { Database } from "../db/client";
import { payments } from "../db/schema";

export interface PaymentReadPrincipal {
  env: ApiEnvironment;
  merchantId: string;
}

function pageSize(value: number) {
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

export function listPayments(
  db: Database,
  principal: PaymentReadPrincipal,
  options: { limit: number },
) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.merchantId, principal.merchantId), eq(payments.env, principal.env)))
    .orderBy(desc(payments.createdAt))
    .limit(pageSize(options.limit));
}

export async function retrievePayment(
  db: Database,
  principal: PaymentReadPrincipal,
  paymentId: string,
) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.merchantId, principal.merchantId),
        eq(payments.env, principal.env),
      ),
    )
    .limit(1);

  return payment;
}
