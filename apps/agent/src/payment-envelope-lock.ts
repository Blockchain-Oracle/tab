import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { tryLock, unlock } from "fs-native-extensions";

import { PaymentEnvelopeStoreError } from "./payment-envelope-model.js";

const LOCK_FILE = ".payment-envelopes.lock";

export interface PaymentEnvelopeLockOptions {
  lockRetryDelayMs: number;
  lockTimeoutMs: number;
}

function lockFailure(): PaymentEnvelopeStoreError {
  return new PaymentEnvelopeStoreError(
    "PAYMENT_ENVELOPE_CORRUPT",
    "The durable payment envelope lock failed safely.",
  );
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function openAnchor(directory: string) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      `${directory}/${LOCK_FILE}`,
      constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      0o600,
    );
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw lockFailure();
    await handle.chmod(0o600);
    return handle;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof PaymentEnvelopeStoreError) throw error;
    throw lockFailure();
  }
}

async function acquire(directory: string, options: PaymentEnvelopeLockOptions) {
  const handle = await openAnchor(directory);
  const deadline = performance.now() + options.lockTimeoutMs;
  let firstAttempt = true;
  try {
    while (true) {
      if (!firstAttempt && performance.now() >= deadline) {
        throw new PaymentEnvelopeStoreError(
          "PAYMENT_ENVELOPE_LOCK_TIMEOUT",
          "The durable payment envelope lock timed out.",
        );
      }
      firstAttempt = false;
      let acquired: boolean;
      try {
        acquired = tryLock(handle.fd);
      } catch {
        throw lockFailure();
      }
      if (acquired) return handle;
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        throw new PaymentEnvelopeStoreError(
          "PAYMENT_ENVELOPE_LOCK_TIMEOUT",
          "The durable payment envelope lock timed out.",
        );
      }
      await pause(Math.min(options.lockRetryDelayMs, remaining));
    }
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export async function withPaymentEnvelopeLock<T>(
  directory: string,
  options: PaymentEnvelopeLockOptions,
  task: () => Promise<T>,
) {
  const handle = await acquire(directory, options);
  let completed = false;
  let releaseError: PaymentEnvelopeStoreError | undefined;
  let taskError: unknown;
  let value: T | undefined;
  try {
    value = await task();
    completed = true;
  } catch (error) {
    taskError = error;
  }
  try {
    unlock(handle.fd);
  } catch {
    releaseError = lockFailure();
  }
  try {
    await handle.close();
  } catch {
    releaseError = lockFailure();
  }
  if (releaseError) throw releaseError;
  if (!completed) throw taskError;
  return value as T;
}
