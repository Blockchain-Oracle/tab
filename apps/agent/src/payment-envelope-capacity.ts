import {
  MAX_PAYMENT_ENVELOPE_RECORDS,
  MAX_PAYMENT_ENVELOPE_STORE_BYTES,
  type PaymentEnvelopeDocument,
  PaymentEnvelopeStoreError,
} from "./payment-envelope-model.js";

const MAX_PAYMENT_SIGNATURE = "A".repeat(32_768);
const MAX_RECEIPT_ID = "r".repeat(128);

function capacityError(): never {
  throw new PaymentEnvelopeStoreError(
    "PAYMENT_ENVELOPE_CAPACITY",
    "The durable payment envelope store reached its capacity bound.",
  );
}

export function assertNewPaymentEnvelopeCapacity(
  document: PaymentEnvelopeDocument,
  key: string,
  requestFingerprint: string,
  timestamp: string,
) {
  if (Object.keys(document.records).length >= MAX_PAYMENT_ENVELOPE_RECORDS) capacityError();
  const worstCase: PaymentEnvelopeDocument = {
    records: {
      ...document.records,
      [key]: {
        createdAt: timestamp,
        paymentSignature: MAX_PAYMENT_SIGNATURE,
        receiptId: MAX_RECEIPT_ID,
        requestFingerprint,
        state: "pending",
        updatedAt: timestamp,
        validBefore: Number.MAX_SAFE_INTEGER,
      },
    },
    version: 1,
  };
  if (Buffer.byteLength(JSON.stringify(worstCase)) > MAX_PAYMENT_ENVELOPE_STORE_BYTES) {
    capacityError();
  }
}
