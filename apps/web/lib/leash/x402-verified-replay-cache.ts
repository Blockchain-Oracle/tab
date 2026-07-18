import { paymentFingerprintMatches } from "./x402-payment-fingerprint";

const DEFAULT_CAPACITY = 256;
const DEFAULT_TTL_MS = 30_000;

interface VerifiedReplayCacheOptions {
  capacity?: number;
  now?: () => number;
  ttlMs?: number;
}

type Fingerprinted = { paymentFingerprint: string };
type Entry<T> = { expiresAt: number; value: T };

export class VerifiedReplayCache<T extends Fingerprinted> {
  readonly #capacity: number;
  readonly #entries = new Map<string, Entry<T>>();
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(options: VerifiedReplayCacheOptions = {}) {
    this.#capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (
      !Number.isSafeInteger(this.#capacity) ||
      this.#capacity < 1 ||
      !Number.isSafeInteger(this.#ttlMs) ||
      this.#ttlMs < 1
    ) {
      throw new Error("The verified replay cache configuration is invalid.");
    }
  }

  set(key: string, value: T) {
    const now = this.#now();
    this.#prune(now);
    this.#entries.delete(key);
    this.#entries.set(key, { expiresAt: now + this.#ttlMs, value });
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  take(key: string, fingerprint: string) {
    this.#prune(this.#now());
    const entry = this.#entries.get(key);
    if (!entry) return null;
    this.#entries.delete(key);
    return paymentFingerprintMatches(entry.value.paymentFingerprint, fingerprint)
      ? entry.value
      : null;
  }

  #prune(now: number) {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key);
    }
  }
}
