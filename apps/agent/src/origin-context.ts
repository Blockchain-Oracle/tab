import { AsyncLocalStorage } from "node:async_hooks";

import type { PaymentOrigin } from "./remote-signer.js";

const paymentOrigin = new AsyncLocalStorage<PaymentOrigin>();

export function currentPaymentOrigin() {
  return paymentOrigin.getStore();
}

export function withPaymentOrigin<T>(origin: PaymentOrigin, action: () => T) {
  return paymentOrigin.run(origin, action);
}
