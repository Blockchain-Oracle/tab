import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { InvalidApiKeyError, type SecretApiKeyPrincipal } from "../auth/api-key";
import type { Database } from "../db/client";
import { merchants } from "../db/schema";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC_ADDRESS,
  parseIntentAuditUrl,
  parsePaymentAddress,
  parseUsdAmount,
} from "./payment-intent";
import { signPaymentIntentToken } from "./payment-intent-token";

const REQUEST_KEYS = ["amount", "intentUrl"];

export class InvalidPaymentIntentRequestError extends Error {
  readonly code = "INVALID_PAYMENT_INTENT_REQUEST";

  constructor() {
    super("The payment intent request is invalid.");
    this.name = "InvalidPaymentIntentRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown) {
  if (!isRecord(value)) throw new InvalidPaymentIntentRequestError();
  const keys = Object.keys(value).sort();
  if (
    keys.length !== REQUEST_KEYS.length ||
    keys.some((key, index) => key !== REQUEST_KEYS[index])
  ) {
    throw new InvalidPaymentIntentRequestError();
  }

  try {
    return {
      amountUsd: parseUsdAmount(value.amount),
      intentUrl: parseIntentAuditUrl(value.intentUrl),
    };
  } catch {
    throw new InvalidPaymentIntentRequestError();
  }
}

export async function mintPaymentIntent(
  db: Database,
  principal: SecretApiKeyPrincipal,
  value: unknown,
) {
  const request = parseRequest(value);
  const [merchant] = await db
    .select({ receivingAddress: merchants.receivingAddress })
    .from(merchants)
    .where(eq(merchants.id, principal.merchantId))
    .limit(1);
  const receiver = parsePaymentAddress(merchant?.receivingAddress);
  if (!receiver) throw new InvalidApiKeyError();

  const intentToken = await signPaymentIntentToken({
    amountUsd: request.amountUsd,
    env: principal.env,
    intentUrl: request.intentUrl,
    jti: randomUUID(),
    merchantId: principal.merchantId,
    receiver,
  });

  return {
    intent: {
      amount: request.amountUsd,
      currency: "USD" as const,
      mode: principal.env,
      receiver,
      token: {
        address: ARBITRUM_USDC_ADDRESS,
        chainId: ARBITRUM_CHAIN_ID,
      },
    },
    intentToken,
  };
}
