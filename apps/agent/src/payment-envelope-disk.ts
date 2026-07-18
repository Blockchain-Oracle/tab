import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { TextDecoder } from "node:util";

import {
  MAX_PAYMENT_ENVELOPE_STORE_BYTES,
  type PaymentEnvelopeDocument,
  PaymentEnvelopeStoreError,
  parsePaymentEnvelopeDocument,
} from "./payment-envelope-model.js";

export const PAYMENT_ENVELOPE_FILE = "payment-envelopes.v1.json";

function ioError(): PaymentEnvelopeStoreError {
  return new PaymentEnvelopeStoreError(
    "PAYMENT_ENVELOPE_CORRUPT",
    "The durable payment envelope store could not be read safely.",
  );
}

export async function preparePaymentEnvelopeDirectory(directory: string) {
  try {
    await mkdir(directory, { mode: 0o700, recursive: true });
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw ioError();
    await chmod(directory, 0o700);
  } catch {
    throw ioError();
  }
}

export async function readPaymentEnvelopeDocument(
  directory: string,
): Promise<PaymentEnvelopeDocument> {
  const path = `${directory}/${PAYMENT_ENVELOPE_FILE}`;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: {}, version: 1 };
    throw ioError();
  }
  try {
    await handle.chmod(0o600);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw ioError();
    if (metadata.size > MAX_PAYMENT_ENVELOPE_STORE_BYTES) {
      throw new PaymentEnvelopeStoreError(
        "PAYMENT_ENVELOPE_OVERSIZE",
        "The durable payment envelope store exceeds its size bound.",
      );
    }
    const chunks: Buffer[] = [];
    let length = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(64 * 1_024);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (length > MAX_PAYMENT_ENVELOPE_STORE_BYTES) {
        throw new PaymentEnvelopeStoreError(
          "PAYMENT_ENVELOPE_OVERSIZE",
          "The durable payment envelope store exceeds its size bound.",
        );
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length));
    return parsePaymentEnvelopeDocument(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof PaymentEnvelopeStoreError) throw error;
    throw ioError();
  } finally {
    await handle.close();
  }
}

export async function writePaymentEnvelopeDocument(
  directory: string,
  document: PaymentEnvelopeDocument,
) {
  const contents = JSON.stringify(document);
  if (Buffer.byteLength(contents) > MAX_PAYMENT_ENVELOPE_STORE_BYTES) {
    throw new PaymentEnvelopeStoreError(
      "PAYMENT_ENVELOPE_OVERSIZE",
      "The durable payment envelope store exceeds its size bound.",
    );
  }
  const destination = `${directory}/${PAYMENT_ENVELOPE_FILE}`;
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await chmod(destination, 0o600);
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    if (error instanceof PaymentEnvelopeStoreError) throw error;
    throw ioError();
  }
}
