import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

export function currentPaymentIdempotencyKey() {
  return storage.getStore();
}

export function withPaymentIdempotencyKey<T>(key: string, task: () => T): T {
  return storage.run(key, task);
}
