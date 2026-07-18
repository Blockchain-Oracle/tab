import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { assertNewPaymentEnvelopeCapacity } from "./payment-envelope-capacity.js";
import {
  preparePaymentEnvelopeDirectory,
  readPaymentEnvelopeDocument,
  writePaymentEnvelopeDocument,
} from "./payment-envelope-disk.js";
import { withPaymentEnvelopeLock } from "./payment-envelope-lock.js";
import {
  type NewPaymentEnvelope,
  type PaymentEnvelopeDocument,
  type PaymentEnvelopeRecord,
  PaymentEnvelopeStoreError,
  validateNewPaymentEnvelope,
  validatePaymentIdempotencyKey,
  validateRequestFingerprint,
} from "./payment-envelope-model.js";
import {
  type PaymentSettlementObservation,
  parsePaymentSettlementObservation,
} from "./payment-settlement-observation.js";

export type { NewPaymentEnvelope, PaymentEnvelopeRecord } from "./payment-envelope-model.js";
export { PaymentEnvelopeStoreError } from "./payment-envelope-model.js";

export interface PaymentEnvelopeStoreOptions {
  lockRetryDelayMs?: number;
  lockTimeoutMs?: number;
  now?: () => Date;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function invalidConfiguration(message: string): never {
  throw new PaymentEnvelopeStoreError("PAYMENT_ENVELOPE_INVALID_INPUT", message);
}

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) invalidConfiguration(`${name} is invalid.`);
  return value;
}

export function agentPaymentStateDirectory(stateRoot: string, address: `0x${string}`) {
  if (!ADDRESS.test(address)) invalidConfiguration("The agent address is invalid.");
  if (!stateRoot || stateRoot.trim() !== stateRoot) {
    invalidConfiguration("The payment state directory is invalid.");
  }
  return join(resolve(stateRoot), address.toLowerCase());
}

export function defaultPaymentStateDirectory(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
) {
  const configured = environment.LEASH_STATE_DIRECTORY;
  if (configured !== undefined) {
    if (!configured || configured.trim() !== configured) {
      invalidConfiguration("LEASH_STATE_DIRECTORY is invalid.");
    }
    return resolve(configured);
  }
  const xdg = environment.XDG_STATE_HOME;
  if (xdg !== undefined && (!xdg || xdg.trim() !== xdg || !isAbsolute(xdg))) {
    invalidConfiguration("XDG_STATE_HOME is invalid.");
  }
  return join(xdg ?? join(home, ".local", "state"), "tab", "leash");
}

function clone(record: PaymentEnvelopeRecord): PaymentEnvelopeRecord {
  return {
    ...record,
    ...(record.settlementObservation
      ? { settlementObservation: { ...record.settlementObservation } }
      : {}),
  };
}

export class PaymentEnvelopeStore {
  readonly #directory: string;
  readonly #lockOptions: {
    lockRetryDelayMs: number;
    lockTimeoutMs: number;
  };
  readonly #now: () => Date;

  constructor(
    address: `0x${string}`,
    stateDirectory: string,
    options: PaymentEnvelopeStoreOptions = {},
  ) {
    this.#directory = agentPaymentStateDirectory(stateDirectory, address);
    this.#lockOptions = {
      lockRetryDelayMs: positiveInteger(options.lockRetryDelayMs ?? 25, "Lock retry delay"),
      lockTimeoutMs: positiveInteger(options.lockTimeoutMs ?? 5_000, "Lock timeout"),
    };
    this.#now = options.now ?? (() => new Date());
  }

  async #locked<T>(task: (document: PaymentEnvelopeDocument) => Promise<T>) {
    const lockDeadline = performance.now() + this.#lockOptions.lockTimeoutMs;
    await preparePaymentEnvelopeDirectory(this.#directory);
    return withPaymentEnvelopeLock(this.#directory, this.#lockOptions, lockDeadline, async () => {
      const document = await readPaymentEnvelopeDocument(this.#directory);
      return task(document);
    });
  }

  async find(idempotencyKey: string, requestFingerprint: string) {
    const key = validatePaymentIdempotencyKey(idempotencyKey);
    const fingerprint = validateRequestFingerprint(requestFingerprint);
    return this.#locked(async (document) => {
      const existing = this.#existing(document, key);
      if (!existing) return null;
      if (existing.requestFingerprint !== fingerprint) this.#conflict();
      return clone(existing);
    });
  }

  async findUnsettled(): Promise<{
    idempotencyKey: string;
    record: PaymentEnvelopeRecord;
  } | null> {
    return this.#locked(async (document) => {
      const pending = Object.entries(document.records).find(
        ([, value]) => value.state !== "settled",
      );
      return pending ? { idempotencyKey: pending[0], record: clone(pending[1]) } : null;
    });
  }

  findPending() {
    return this.findUnsettled();
  }

  async getOrCreate(
    idempotencyKey: string,
    requestFingerprint: string,
    factory: () => Promise<NewPaymentEnvelope>,
  ): Promise<{ created: boolean; record: PaymentEnvelopeRecord }> {
    const key = validatePaymentIdempotencyKey(idempotencyKey);
    const fingerprint = validateRequestFingerprint(requestFingerprint);
    if (typeof factory !== "function") invalidConfiguration("The envelope factory is invalid.");
    return this.#locked(async (document) => {
      const existing = this.#existing(document, key);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) this.#conflict();
        return { created: false, record: clone(existing) };
      }
      if (Object.values(document.records).some((candidate) => candidate.state !== "settled")) {
        throw new PaymentEnvelopeStoreError(
          "PAYMENT_ENVELOPE_PENDING",
          "Another payment envelope is still pending.",
        );
      }
      const timestamp = this.#timestamp();
      assertNewPaymentEnvelopeCapacity(document, key, fingerprint, timestamp);
      const created = validateNewPaymentEnvelope(await factory());
      const stored: PaymentEnvelopeRecord = {
        createdAt: timestamp,
        paymentSignature: created.paymentSignature,
        receiptId: created.receiptId,
        requestFingerprint: fingerprint,
        state: "pending",
        updatedAt: timestamp,
        validBefore: created.validBefore,
      };
      document.records[key] = stored;
      await writePaymentEnvelopeDocument(this.#directory, document);
      return { created: true, record: clone(stored) };
    });
  }

  async markSettled(idempotencyKey: string, requestFingerprint: string) {
    const key = validatePaymentIdempotencyKey(idempotencyKey);
    const fingerprint = validateRequestFingerprint(requestFingerprint);
    return this.#locked(async (document) => {
      const existing = this.#required(document, key, fingerprint);
      if (existing.state === "settled") return clone(existing);
      const settled: PaymentEnvelopeRecord = {
        ...existing,
        state: "settled",
        updatedAt: this.#timestamp(),
      };
      document.records[key] = settled;
      await writePaymentEnvelopeDocument(this.#directory, document);
      return clone(settled);
    });
  }

  async markObserved(
    idempotencyKey: string,
    requestFingerprint: string,
    value: PaymentSettlementObservation,
  ) {
    const key = validatePaymentIdempotencyKey(idempotencyKey);
    const fingerprint = validateRequestFingerprint(requestFingerprint);
    const settlementObservation = parsePaymentSettlementObservation(value);
    if (!settlementObservation) invalidConfiguration("The settlement observation is invalid.");
    return this.#locked(async (document) => {
      const existing = this.#required(document, key, fingerprint);
      if (existing.state === "settled") return clone(existing);
      const observed: PaymentEnvelopeRecord = {
        ...existing,
        settlementObservation,
        state: "observed",
        updatedAt: this.#timestamp(),
      };
      document.records[key] = observed;
      await writePaymentEnvelopeDocument(this.#directory, document);
      return clone(observed);
    });
  }

  async removeIfPending(
    idempotencyKey: string,
    requestFingerprint: string,
    proveUnused: (record: PaymentEnvelopeRecord) => Promise<boolean>,
  ) {
    const key = validatePaymentIdempotencyKey(idempotencyKey);
    const fingerprint = validateRequestFingerprint(requestFingerprint);
    if (typeof proveUnused !== "function") invalidConfiguration("The chain proof is invalid.");
    return this.#locked(async (document) => {
      const existing = this.#existing(document, key);
      if (!existing) return false;
      if (existing.requestFingerprint !== fingerprint) this.#conflict();
      if (existing.state === "settled") return false;
      let unused = false;
      try {
        unused = (await proveUnused(clone(existing))) === true;
      } catch {
        // The proof callback receives the exact header; its errors must not escape unsanitized.
      }
      if (!unused) {
        throw new PaymentEnvelopeStoreError(
          "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED",
          "Independent chain evidence did not prove the pending authorization unused.",
        );
      }
      delete document.records[key];
      await writePaymentEnvelopeDocument(this.#directory, document);
      return true;
    });
  }

  #required(document: PaymentEnvelopeDocument, key: string, fingerprint: string) {
    const existing = this.#existing(document, key);
    if (!existing) {
      throw new PaymentEnvelopeStoreError(
        "PAYMENT_ENVELOPE_NOT_FOUND",
        "The payment envelope was not found.",
      );
    }
    if (existing.requestFingerprint !== fingerprint) this.#conflict();
    return existing;
  }

  #existing(document: PaymentEnvelopeDocument, key: string) {
    return Object.hasOwn(document.records, key) ? document.records[key] : undefined;
  }

  #conflict(): never {
    throw new PaymentEnvelopeStoreError(
      "PAYMENT_ENVELOPE_CONFLICT",
      "The payment idempotency key belongs to a different request.",
    );
  }

  #timestamp() {
    const value = this.#now();
    if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
      invalidConfiguration("The payment envelope clock is invalid.");
    }
    return value.toISOString();
  }
}
