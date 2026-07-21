import { normalizeApiBaseUrl } from "./api-base-url";
import {
  parseCheckoutContext,
  parseMerchantIntent,
  parseOpenedPayment,
  parsePaymentReport,
  record,
} from "./checkout-parsers";
import { CheckoutApiError, type PaymentIntent } from "./checkout-types";

export { assertOpenedPaymentMatchesIntent } from "./checkout-parsers";
export type {
  CanonicalTestTokenChange,
  CheckoutContext,
  CheckoutMode,
  MerchantIntentResponse,
  OpenedPayment,
  PaymentIntent,
  PaymentReportResponse,
} from "./checkout-types";
export { CheckoutApiError } from "./checkout-types";

type RequestOptions = { request?: typeof fetch; signal?: AbortSignal };

export async function responseJson(response: Response) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CheckoutApiError(
      "INVALID_RESPONSE",
      "Tab returned an invalid response.",
      response.status,
    );
  }
  if (!response.ok) {
    const error = record(record(body)?.error);
    throw new CheckoutApiError(
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "The request could not be completed.",
      response.status,
    );
  }
  return body;
}

export function authHeaders(publishableKey: string) {
  return { authorization: `Bearer ${publishableKey}` };
}

export async function loadMerchantIntent(intentUrl: string, options: RequestOptions = {}) {
  const response = await (options.request ?? fetch)(intentUrl, {
    cache: "no-store",
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseMerchantIntent(await responseJson(response));
}

export async function loadCheckoutContext(
  input: { apiBaseUrl: string; publishableKey: string },
  options: RequestOptions = {},
) {
  const url = new URL("/api/v1/checkout-context", normalizeApiBaseUrl(input.apiBaseUrl)).toString();
  const response = await (options.request ?? fetch)(url, {
    headers: authHeaders(input.publishableKey),
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseCheckoutContext(await responseJson(response));
}

export async function openPayment(
  input: { apiBaseUrl: string; intentToken: string; publishableKey: string },
  options: RequestOptions = {},
) {
  const url = new URL("/api/v1/payments", normalizeApiBaseUrl(input.apiBaseUrl)).toString();
  const response = await (options.request ?? fetch)(url, {
    body: JSON.stringify({ intentToken: input.intentToken }),
    headers: { ...authHeaders(input.publishableKey), "content-type": "application/json" },
    method: "POST",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseOpenedPayment(await responseJson(response));
}

export async function reportPayment(
  input: {
    apiBaseUrl: string;
    buyerDidToken: string;
    paymentId: string;
    publishableKey: string;
    intent: PaymentIntent;
    tokenChanges: object;
    transactionId: string;
  },
  options: RequestOptions = {},
) {
  const url = new URL(
    `/api/v1/payments/${input.paymentId}`,
    normalizeApiBaseUrl(input.apiBaseUrl),
  ).toString();
  const response = await (options.request ?? fetch)(url, {
    body: JSON.stringify({
      buyerDidToken: input.buyerDidToken,
      tokenChanges: [input.tokenChanges],
      transactionId: input.transactionId,
    }),
    headers: { ...authHeaders(input.publishableKey), "content-type": "application/json" },
    keepalive: true,
    method: "PATCH",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const body = await responseJson(response);
  return parsePaymentReport(body, input.paymentId, input.transactionId, input.intent);
}
