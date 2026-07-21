import { readPaymentAuthorizationState } from "./payment-authorization-state.js";
import { parsePaymentEnvelope } from "./payment-envelope.js";
import type {
  NewPaymentEnvelope,
  PaymentEnvelopeRecord,
  PaymentEnvelopeStore,
} from "./payment-envelope-store.js";
import { PaymentEnvelopeStoreError } from "./payment-envelope-store.js";
import type { PaymentProfile } from "./payment-profile.js";
import { parsePaymentSettlementObservation } from "./payment-settlement-observation.js";
import type { TabRemoteSigner } from "./remote-signer.js";

export class PaymentIdempotencyRequiredError extends Error {
  readonly code = "PAYMENT_IDEMPOTENCY_KEY_REQUIRED";

  constructor() {
    super("A payment idempotency key is required for paid requests.");
    this.name = "PaymentIdempotencyRequiredError";
  }
}

export class PaymentReconciliationRequiredError extends Error {
  readonly code = "PAYMENT_RECONCILIATION_REQUIRED";

  constructor() {
    super("A previous payment must be reconciled before a new authorization can be created.");
    this.name = "PaymentReconciliationRequiredError";
  }
}

interface PaymentEnvelopeJournalOptions {
  address: `0x${string}`;
  authorizationState?: typeof readPaymentAuthorizationState;
  nowSeconds?: () => number;
  paymentProfile: PaymentProfile;
  signer: TabRemoteSigner;
  store: PaymentEnvelopeStore;
}

type ParsedEnvelope = Awaited<ReturnType<typeof parsePaymentEnvelope>>;
type ParsedEnvelopePayload = Pick<ParsedEnvelope, "payload">;

export class PaymentEnvelopeJournal {
  readonly #address: `0x${string}`;
  readonly #authorizationState: typeof readPaymentAuthorizationState;
  readonly #nowSeconds: () => number;
  readonly #paymentProfile: PaymentProfile;
  readonly #signer: TabRemoteSigner;
  readonly #store: PaymentEnvelopeStore;

  constructor(options: PaymentEnvelopeJournalOptions) {
    this.#address = options.address;
    this.#authorizationState = options.authorizationState ?? readPaymentAuthorizationState;
    this.#nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
    this.#paymentProfile = options.paymentProfile;
    this.#signer = options.signer;
    this.#store = options.store;
  }

  async #removeIfExpiredAndUnused(
    idempotencyKey: string,
    requestFingerprint: string,
    envelope: PaymentEnvelopeRecord,
  ) {
    if (envelope.state === "settled" || envelope.validBefore > this.#nowSeconds()) return false;
    let authorizationState: "unused" | "used" | undefined;
    try {
      return await this.#store.removeIfPending(
        idempotencyKey,
        requestFingerprint,
        async (current) => {
          if (current.validBefore > this.#nowSeconds()) return false;
          const parsed = await parsePaymentEnvelope(
            current.paymentSignature,
            this.#address,
            this.#paymentProfile,
          );
          authorizationState = await this.#authorizationState(parsed);
          if (authorizationState !== "unused") return false;
          return this.#signer.reconcileExpiredPayment(current.receiptId);
        },
      );
    } catch (error) {
      if (
        error instanceof PaymentEnvelopeStoreError &&
        error.code === "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED" &&
        authorizationState === "used"
      ) {
        return false;
      }
      throw error;
    }
  }

  async load(idempotencyKey: string, requestFingerprint: string) {
    const pending = await this.#store.findUnsettled();
    if (pending && pending.idempotencyKey !== idempotencyKey) {
      const removed = await this.#removeIfExpiredAndUnused(
        pending.idempotencyKey,
        pending.record.requestFingerprint,
        pending.record,
      );
      if (!removed) throw new PaymentReconciliationRequiredError();
    }
    const existing = await this.#store.find(idempotencyKey, requestFingerprint);
    if (!existing) return null;
    const removed = await this.#removeIfExpiredAndUnused(
      idempotencyKey,
      requestFingerprint,
      existing,
    );
    return removed ? null : existing;
  }

  async getOrCreate(
    idempotencyKey: string,
    requestFingerprint: string,
    factory: () => Promise<NewPaymentEnvelope>,
  ) {
    try {
      return (await this.#store.getOrCreate(idempotencyKey, requestFingerprint, factory)).record;
    } catch (error) {
      if (error instanceof PaymentEnvelopeStoreError && error.code === "PAYMENT_ENVELOPE_PENDING") {
        throw new PaymentReconciliationRequiredError();
      }
      throw error;
    }
  }

  async parse(envelope: PaymentEnvelopeRecord) {
    const parsed = await parsePaymentEnvelope(
      envelope.paymentSignature,
      this.#address,
      this.#paymentProfile,
    );
    if (parsed.validBefore !== envelope.validBefore) {
      throw new Error("Stored payment envelope is invalid");
    }
    this.#signer.restorePaymentCorrelation(
      parsed.signature,
      envelope.receiptId,
      envelope.validBefore,
    );
    return parsed;
  }

  async recordObservation(
    idempotencyKey: string,
    requestFingerprint: string,
    parsed: ParsedEnvelopePayload,
    value: unknown,
  ) {
    const observation = parsePaymentSettlementObservation(value, {
      amount: parsed.payload.accepted.amount,
      network: parsed.payload.accepted.network,
      payer: this.#address,
    });
    if (!observation) return null;
    return this.#store.markObserved(idempotencyKey, requestFingerprint, observation);
  }

  async reconcileObserved(
    idempotencyKey: string,
    requestFingerprint: string,
    envelope: PaymentEnvelopeRecord,
    parsed: ParsedEnvelopePayload,
  ) {
    if (!envelope.settlementObservation) return { status: "ignored", verified: false } as const;
    const result = await this.#signer.reportPaymentObservation({
      paymentPayload: parsed.payload,
      requirements: parsed.payload.accepted,
      settleResponse: envelope.settlementObservation,
    });
    if (result.status === "settled" && result.verified) {
      await this.#store.markSettled(idempotencyKey, requestFingerprint);
    }
    return result;
  }

  markSettled(idempotencyKey: string, requestFingerprint: string) {
    return this.#store.markSettled(idempotencyKey, requestFingerprint);
  }
}
