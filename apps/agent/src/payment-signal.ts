import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<AbortSignal>();

export function currentPaymentSignal() {
  return storage.getStore();
}

export function withPaymentSignal<T>(signal: AbortSignal, task: () => T): T {
  return storage.run(signal, task);
}
