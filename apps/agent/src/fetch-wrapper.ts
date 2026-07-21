import { createDurablePaymentFetch } from "./durable-payment-fetch.js";
import {
  currentPaymentOrigin,
  withPaymentOrigin,
  withPaymentResourceUrl,
} from "./origin-context.js";
import type { readPaymentAuthorizationState } from "./payment-authorization-state.js";
import { createLeashPaymentClient } from "./payment-client.js";
import { defaultPaymentStateDirectory, PaymentEnvelopeStore } from "./payment-envelope-store.js";
import { currentPaymentIdempotencyKey } from "./payment-idempotency.js";
import type { PaymentProfile } from "./payment-profile.js";
import { createPinnedPaymentFetch, type PaymentTargetLookup } from "./payment-target-network.js";
import { safePaymentRequestInit, validatePaymentTarget } from "./payment-target-policy.js";
import { TabRemoteSigner } from "./remote-signer.js";

interface LeashFetchOptions {
  address: `0x${string}`;
  allowDevelopmentLoopback?: boolean;
  apiBaseUrl: string;
  apiKey: string;
  authorizationState?: typeof readPaymentAuthorizationState;
  clientName?: string | (() => string);
  fetch?: typeof globalThis.fetch;
  idempotencyKey?: () => string | undefined;
  nowSeconds?: () => number;
  paymentProfile: PaymentProfile;
  paymentStateDirectory?: string;
  lookup?: PaymentTargetLookup;
  signer?: TabRemoteSigner;
}

type FetchInput = Request | string | URL;

function requestUrl(input: FetchInput) {
  return input instanceof Request ? input.url : input.toString();
}

function requestName(input: FetchInput, init?: RequestInit) {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const rawUrl = input instanceof Request ? input.url : input.toString();
  let safeUrl = "Invalid URL";
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    safeUrl = url.toString();
  } catch {
    // The underlying fetch reports invalid input without persisting the raw value as receipt origin.
  }
  return `${method.toUpperCase()} ${safeUrl}`;
}

export function createTabFetch(options: LeashFetchOptions) {
  const baseFetch = options.fetch ?? globalThis.fetch;
  const allowDevelopmentLoopback = options.allowDevelopmentLoopback === true;
  const targetPolicy = createPinnedPaymentFetch({
    allowDevelopmentLoopback,
    fetch: baseFetch,
    ...(options.lookup ? { lookup: options.lookup } : {}),
  });
  const signer =
    options.signer ??
    new TabRemoteSigner({
      address: options.address,
      apiBaseUrl: options.apiBaseUrl,
      apiKey: options.apiKey,
      fetch: baseFetch,
      origin: currentPaymentOrigin,
      paymentProfile: options.paymentProfile,
    });
  const paidFetch = createDurablePaymentFetch({
    address: options.address,
    ...(options.authorizationState ? { authorizationState: options.authorizationState } : {}),
    client: createLeashPaymentClient(signer, options.paymentProfile),
    fetch: targetPolicy.fetch,
    idempotencyKey: options.idempotencyKey ?? currentPaymentIdempotencyKey,
    ...(options.nowSeconds ? { nowSeconds: options.nowSeconds } : {}),
    paymentProfile: options.paymentProfile,
    signer,
    store: new PaymentEnvelopeStore(
      options.address,
      options.paymentStateDirectory ?? defaultPaymentStateDirectory(),
    ),
  });

  const leashFetch = (input: FetchInput, init?: RequestInit) => {
    validatePaymentTarget(requestUrl(input), {
      allowDevelopmentLoopback,
    });
    return withPaymentOrigin(
      {
        clientName:
          typeof options.clientName === "function"
            ? options.clientName()
            : (options.clientName ?? "leash-fetch"),
        toolName: requestName(input, init),
        transport: "http",
      },
      () =>
        withPaymentResourceUrl(requestUrl(input), () =>
          paidFetch(input, safePaymentRequestInit(init)),
        ),
    );
  };
  return Object.assign(leashFetch, { close: () => targetPolicy.close() });
}
