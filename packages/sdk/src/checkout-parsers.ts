import { getAddress, isAddress } from "viem";

import {
  CheckoutApiError,
  type CheckoutContext,
  type MerchantIntentResponse,
  type OpenedPayment,
  type PaymentIntent,
  type PaymentReportResponse,
} from "./checkout-types";

const AMOUNT = /^(?:0\.\d{1,6}|[1-9]\d{0,13}(?:\.\d{1,6})?)$/;
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function address(value: unknown) {
  return typeof value === "string" && isAddress(value) ? getAddress(value) : undefined;
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function paymentIntent(value: unknown): PaymentIntent {
  const input = record(value);
  const token = record(input?.token);
  const receiver = address(input?.receiver);
  const tokenAddress = address(token?.address);
  if (
    typeof input?.amount !== "string" ||
    !AMOUNT.test(input.amount) ||
    input.currency !== "USD" ||
    (input.mode !== "test" && input.mode !== "live") ||
    !receiver ||
    token?.chainId !== 42161 ||
    !tokenAddress
  ) {
    throw new CheckoutApiError("INVALID_PAYMENT_INTENT", "The payment details are invalid.");
  }
  return {
    amount: input.amount,
    currency: "USD",
    mode: input.mode,
    receiver,
    token: { address: tokenAddress, chainId: 42161 },
  };
}

export function parseMerchantIntent(value: unknown): MerchantIntentResponse {
  const body = record(value);
  if (!body || typeof body.intentToken !== "string" || body.intentToken.length < 16) {
    throw new CheckoutApiError("INVALID_PAYMENT_INTENT", "The payment details are invalid.");
  }
  return { intent: paymentIntent(body.intent), intentToken: body.intentToken };
}

export function parseCheckoutContext(value: unknown): CheckoutContext {
  const body = record(value);
  const capabilities = record(body?.capabilities);
  const clientConfig = record(body?.clientConfig);
  const particle = record(clientConfig?.particle);
  const merchant = record(body?.merchant);
  const magicPublishableKey = requiredString(clientConfig?.magicPublishableKey);
  const projectAppUuid = requiredString(particle?.projectAppUuid);
  const projectClientKey = requiredString(particle?.projectClientKey);
  const projectId = requiredString(particle?.projectId);
  if (
    typeof capabilities?.livePaymentExecution !== "boolean" ||
    !magicPublishableKey ||
    !projectAppUuid ||
    !projectClientKey ||
    !projectId ||
    (merchant?.businessName !== null && typeof merchant?.businessName !== "string") ||
    (merchant.logoUrl !== null && typeof merchant.logoUrl !== "string") ||
    (body?.mode !== "test" && body?.mode !== "live")
  ) {
    throw new CheckoutApiError("INVALID_CHECKOUT_CONTEXT", "Checkout is temporarily unavailable.");
  }
  return {
    capabilities: { livePaymentExecution: capabilities.livePaymentExecution },
    clientConfig: {
      magicPublishableKey,
      particle: { projectAppUuid, projectClientKey, projectId },
    },
    merchant: { businessName: merchant.businessName, logoUrl: merchant.logoUrl },
    mode: body.mode,
  };
}

export function parseOpenedPayment(value: unknown): OpenedPayment {
  const body = record(value);
  const payment = record(body?.payment);
  const token = record(payment?.token);
  const receiver = address(payment?.receiver);
  const tokenAddress = address(token?.address);
  const paymentId = requiredString(body?.paymentId);
  const refCode = requiredString(body?.refCode);
  const env = payment?.env;
  if (
    typeof payment?.amount !== "string" ||
    !AMOUNT.test(payment.amount) ||
    payment.currency !== "USD" ||
    (env !== "test" && env !== "live") ||
    payment.livemode !== (env === "live") ||
    !receiver ||
    payment.status !== "pending" ||
    token?.chainId !== 42161 ||
    !tokenAddress ||
    !paymentId ||
    !UUID.test(paymentId) ||
    !refCode ||
    !/^TAB-[0-9A-HJKMNP-TV-Z]{8}$/.test(refCode)
  ) {
    throw new CheckoutApiError("INVALID_PAYMENT_RESPONSE", "Tab returned invalid payment details.");
  }
  return {
    payment: {
      amount: payment.amount,
      currency: "USD",
      env,
      livemode: payment.livemode,
      receiver,
      status: "pending",
      token: { address: tokenAddress, chainId: 42161 },
    },
    paymentId,
    refCode,
  };
}

function amountUnits(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function assertOpenedPaymentMatchesIntent(opened: OpenedPayment, intent: PaymentIntent) {
  const payment = opened.payment;
  if (
    amountUnits(payment.amount) !== amountUnits(intent.amount) ||
    payment.currency !== intent.currency ||
    payment.env !== intent.mode ||
    getAddress(payment.receiver) !== getAddress(intent.receiver) ||
    payment.token.chainId !== intent.token.chainId ||
    getAddress(payment.token.address) !== getAddress(intent.token.address)
  ) {
    throw new CheckoutApiError(
      "PAYMENT_INTENT_CONFLICT",
      "The payment details changed. Please start again.",
    );
  }
}

export function parsePaymentReport(
  value: unknown,
  expectedId: string,
  expectedTransactionId: string,
): PaymentReportResponse {
  const body = record(value);
  const payment = record(body?.payment);
  const verification = record(payment?.verification);
  if (
    payment?.id !== expectedId ||
    !UUID.test(expectedId) ||
    payment.reportedTransactionId !== expectedTransactionId ||
    (payment.status !== "pending" && payment.status !== "settled") ||
    !verification ||
    (verification.method !== null && typeof verification.method !== "string") ||
    (verification.verifiedAt !== null && typeof verification.verifiedAt !== "string")
  ) {
    throw new CheckoutApiError("INVALID_PAYMENT_REPORT", "Tab returned an invalid payment report.");
  }
  return value as PaymentReportResponse;
}
