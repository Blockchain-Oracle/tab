export class PaymentCorrelations {
  readonly #entries = new Map<string, { receiptId: string; validBeforeSeconds: number }>();

  constructor(readonly nowSeconds: () => number) {}

  set(signature: string, receiptId: string, validBeforeSeconds: number) {
    this.#prune();
    this.#entries.set(signature.toLowerCase(), { receiptId, validBeforeSeconds });
  }

  restore(signature: string, receiptId: string, validBeforeSeconds: number) {
    if (
      !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
      !/^\S{1,256}$/.test(receiptId) ||
      !Number.isSafeInteger(validBeforeSeconds) ||
      validBeforeSeconds < 1
    ) {
      throw new Error("The persisted payment correlation is invalid.");
    }
    this.set(signature, receiptId, Math.max(validBeforeSeconds, this.nowSeconds() + 3_600));
  }

  get(signature: string) {
    this.#prune();
    return this.#entries.get(signature.toLowerCase())?.receiptId ?? null;
  }

  deleteIf(signature: string, receiptId: string) {
    const key = signature.toLowerCase();
    if (this.#entries.get(key)?.receiptId === receiptId) this.#entries.delete(key);
  }

  #prune() {
    const now = this.nowSeconds();
    for (const [signature, correlation] of this.#entries) {
      if (correlation.validBeforeSeconds <= now) this.#entries.delete(signature);
    }
  }
}
