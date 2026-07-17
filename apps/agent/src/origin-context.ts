import { AsyncLocalStorage } from "node:async_hooks";

import type { PaymentOrigin } from "./remote-signer.js";

const paymentOrigin = new AsyncLocalStorage<PaymentOrigin>();
const paymentResourceUrl = new AsyncLocalStorage<string>();

export function currentPaymentOrigin() {
  return paymentOrigin.getStore();
}

export function withPaymentOrigin<T>(origin: PaymentOrigin, action: () => T) {
  return paymentOrigin.run(origin, action);
}

export function currentPaymentResourceUrl() {
  return paymentResourceUrl.getStore();
}

export function withPaymentResourceUrl<T>(resourceUrl: string, action: () => T) {
  return paymentResourceUrl.run(resourceUrl, action);
}
