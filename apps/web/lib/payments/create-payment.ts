import { and, eq } from "drizzle-orm";

import type { ApiKeyPrincipal } from "../auth/api-key";
import type { Database } from "../db/client";
import { merchants, payments } from "../db/schema";
import { ARBITRUM_CHAIN_ID, ARBITRUM_USDC_ADDRESS, parsePaymentAddress } from "./payment-intent";
import { InvalidPaymentIntentTokenError, verifyPaymentIntentToken } from "./payment-intent-token";
import { mintPaymentRefCode } from "./ref-code";

const CREATE_KEYS = ["intentToken"];
const MAX_TOKEN_LENGTH = 8_192;
const MAX_INSERT_ATTEMPTS = 5;

type Payment = typeof payments.$inferSelect;

export class InvalidCreatePaymentRequestError extends Error {
  readonly code = "INVALID_PAYMENT_INTENT_TOKEN";

  constructor() {
    super("The payment intent token is invalid or expired.");
    this.name = "InvalidCreatePaymentRequestError";
  }
}

export class StalePaymentIntentError extends Error {
  readonly code = "PAYMENT_INTENT_STALE";

  constructor() {
    super("The merchant payment destination has changed. Request a new payment intent.");
    this.name = "StalePaymentIntentError";
  }
}

export class PaymentIntentConflictError extends Error {
  readonly code = "PAYMENT_INTENT_CONFLICT";

  constructor() {
    super("The payment intent conflicts with an existing payment.");
    this.name = "PaymentIntentConflictError";
  }
}

export class PaymentCreationUnavailableError extends Error {
  readonly code = "PAYMENT_CREATION_UNAVAILABLE";

  constructor() {
    super("Payment creation is temporarily unavailable.");
    this.name = "PaymentCreationUnavailableError";
  }
}

function parseRequest(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidCreatePaymentRequestError();
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== CREATE_KEYS.length ||
    keys[0] !== CREATE_KEYS[0] ||
    typeof record.intentToken !== "string" ||
    record.intentToken.length === 0 ||
    record.intentToken.length > MAX_TOKEN_LENGTH
  ) {
    throw new InvalidCreatePaymentRequestError();
  }
  return record.intentToken;
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function paymentMatches(
  payment: Payment,
  intent: Awaited<ReturnType<typeof verifyPaymentIntentToken>>,
) {
  return (
    payment.merchantId === intent.merchantId &&
    payment.env === intent.env &&
    payment.livemode === (intent.env === "live") &&
    payment.amountUsd === intent.amountUsd &&
    payment.currency === intent.currency &&
    sameAddress(payment.receiver, intent.receiver) &&
    sameAddress(payment.tokenAddress, intent.tokenAddress) &&
    payment.tokenChainId === intent.tokenChainId &&
    payment.intentUrl === intent.intentUrl
  );
}

function requireMatchingPayment(
  payment: Payment,
  intent: Awaited<ReturnType<typeof verifyPaymentIntentToken>>,
) {
  if (!paymentMatches(payment, intent)) throw new PaymentIntentConflictError();
  return payment;
}

export async function createPayment(db: Database, principal: ApiKeyPrincipal, value: unknown) {
  const token = parseRequest(value);
  const intent = await verifyPaymentIntentToken(token);
  if (intent.merchantId !== principal.merchantId || intent.env !== principal.env) {
    throw new InvalidPaymentIntentTokenError();
  }

  return db.transaction(async (transaction) => {
    const findExisting = async () => {
      const [payment] = await transaction
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, intent.jti),
            eq(payments.merchantId, principal.merchantId),
            eq(payments.env, principal.env),
          ),
        )
        .limit(1);
      return payment;
    };

    const existing = await findExisting();
    if (existing) return { created: false, payment: requireMatchingPayment(existing, intent) };

    const [merchant] = await transaction
      .select({ receivingAddress: merchants.receivingAddress })
      .from(merchants)
      .where(eq(merchants.id, principal.merchantId))
      .for("share");
    const currentReceiver = parsePaymentAddress(merchant?.receivingAddress);
    if (!currentReceiver || !sameAddress(currentReceiver, intent.receiver)) {
      throw new StalePaymentIntentError();
    }

    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
      const [payment] = await transaction
        .insert(payments)
        .values({
          amountUsd: intent.amountUsd,
          currency: intent.currency,
          env: intent.env,
          id: intent.jti,
          intentUrl: intent.intentUrl,
          livemode: intent.env === "live",
          merchantId: intent.merchantId,
          receiver: intent.receiver,
          refCode: mintPaymentRefCode(),
          tokenAddress: ARBITRUM_USDC_ADDRESS,
          tokenChainId: ARBITRUM_CHAIN_ID,
        })
        .onConflictDoNothing()
        .returning();
      if (payment) return { created: true, payment };

      const replay = await findExisting();
      if (replay) return { created: false, payment: requireMatchingPayment(replay, intent) };
    }

    throw new PaymentCreationUnavailableError();
  });
}
