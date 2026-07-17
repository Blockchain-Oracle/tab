import { wrapFetchWithPayment } from "@x402/fetch";

import { currentPaymentOrigin, withPaymentOrigin } from "./origin-context.js";
import { createLeashPaymentClient } from "./payment-client.js";
import { LeashRemoteSigner } from "./remote-signer.js";

interface LeashFetchOptions {
  address: `0x${string}`;
  apiBaseUrl: string;
  apiKey: string;
  clientName?: string;
  fetch?: typeof globalThis.fetch;
}

type FetchInput = Request | string | URL;

function requestName(input: FetchInput, init?: RequestInit) {
  const request = new Request(input, init);
  return `${request.method} ${request.url}`;
}

export function createLeashFetch(options: LeashFetchOptions) {
  const baseFetch = options.fetch ?? globalThis.fetch;
  const signer = new LeashRemoteSigner({
    address: options.address,
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    fetch: baseFetch,
    origin: currentPaymentOrigin,
  });
  const paidFetch = wrapFetchWithPayment(baseFetch, createLeashPaymentClient(signer));

  return (input: FetchInput, init?: RequestInit) =>
    withPaymentOrigin(
      {
        clientName: options.clientName ?? "leash-fetch",
        toolName: requestName(input, init),
        transport: "http",
      },
      () => paidFetch(input, init),
    );
}
