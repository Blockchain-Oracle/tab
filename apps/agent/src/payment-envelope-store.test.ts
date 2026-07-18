import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agentPaymentStateDirectory,
  PaymentEnvelopeStore,
  PaymentEnvelopeStoreError,
} from "./payment-envelope-store.js";

const address = "0x1111111111111111111111111111111111111111" as const;
const fingerprint = "ab".repeat(32);
const otherFingerprint = "cd".repeat(32);
const paymentSignature = "eyJ4NDAyVmVyc2lvbiI6Mn0=";
const receiptId = "5f87e8e6-56fd-4694-8477-4bd692307f82";
const now = new Date("2026-07-18T12:00:00.000Z");
const roots: string[] = [];

async function root() {
  const directory = await mkdtemp(join(tmpdir(), "tab-envelope-"));
  roots.push(directory);
  return directory;
}

function factory(overrides: Partial<{ paymentSignature: string; receiptId: string }> = {}) {
  return vi.fn(async () => ({
    paymentSignature: overrides.paymentSignature ?? paymentSignature,
    receiptId: overrides.receiptId ?? receiptId,
    validBefore: 1_784_400_300,
  }));
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("PaymentEnvelopeStore", () => {
  it("creates a pending envelope once and preserves the exact payment header", async () => {
    const stateRoot = await root();
    const store = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });
    const create = factory();

    const result = await store.getOrCreate("pay_first", fingerprint, create);
    const replay = await store.getOrCreate("pay_first", fingerprint, create);

    expect(result).toEqual({
      created: true,
      record: {
        createdAt: now.toISOString(),
        paymentSignature,
        receiptId,
        requestFingerprint: fingerprint,
        state: "pending",
        updatedAt: now.toISOString(),
        validBefore: 1_784_400_300,
      },
    });
    expect(replay).toEqual({ created: false, record: result.record });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent store instances in one process and invokes the factory once", async () => {
    const stateRoot = await root();
    const first = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });
    const second = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });
    const create = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { paymentSignature, receiptId, validBefore: 1_784_400_300 };
    });

    const results = await Promise.all([
      first.getOrCreate("pay_concurrent", fingerprint, create),
      second.getOrCreate("pay_concurrent", fingerprint, create),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  });

  it("treats valid object-prototype names as ordinary idempotency keys", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });

    await expect(store.getOrCreate("constructor", fingerprint, factory())).resolves.toMatchObject({
      created: true,
    });
    await expect(store.find("constructor", fingerprint)).resolves.toMatchObject({ receiptId });
  });

  it("survives restart and rejects reuse of a key for another request", async () => {
    const stateRoot = await root();
    const first = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });
    await first.getOrCreate("pay_first", fingerprint, factory());
    const restarted = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });

    await expect(restarted.find("pay_first", fingerprint)).resolves.toMatchObject({
      paymentSignature,
      state: "pending",
    });
    await expect(restarted.find("pay_first", otherFingerprint)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_CONFLICT",
    });
  });

  it("blocks a different key while one envelope is pending", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    const secondFactory = factory({ receiptId: "receipt-second" });

    await expect(
      store.getOrCreate("pay_second", otherFingerprint, secondFactory),
    ).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_PENDING" });
    expect(secondFactory).not.toHaveBeenCalled();
  });

  it("finds the one pending envelope for expired-authorization reconciliation", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    const created = await store.getOrCreate("pay_first", fingerprint, factory());

    await expect(store.findPending()).resolves.toEqual({
      idempotencyKey: "pay_first",
      record: created.record,
    });
    await store.markSettled("pay_first", fingerprint);
    await expect(store.findPending()).resolves.toBeNull();
  });

  it("allows a different key only after the first envelope is settled", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    const settled = await store.markSettled("pay_first", fingerprint);

    const second = await store.getOrCreate(
      "pay_second",
      otherFingerprint,
      factory({ receiptId: "receipt-second" }),
    );

    expect(settled.state).toBe("settled");
    expect(second.created).toBe(true);
    expect(second.record.state).toBe("pending");
  });

  it("does not persist a partial record when the factory fails", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });

    await expect(
      store.getOrCreate("pay_first", fingerprint, async () => {
        throw new Error("signing failed");
      }),
    ).rejects.toThrow("signing failed");
    await expect(store.find("pay_first", fingerprint)).resolves.toBeNull();
    await expect(store.getOrCreate("pay_first", fingerprint, factory())).resolves.toMatchObject({
      created: true,
    });
  });

  it("removes pending state only after an independent unused proof", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    const unresolved = vi.fn(async () => false);

    await expect(store.removeIfPending("pay_first", fingerprint, unresolved)).rejects.toMatchObject(
      { code: "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED" },
    );
    expect(await store.find("pay_first", fingerprint)).not.toBeNull();

    const provedUnused = vi.fn(async () => true);
    await expect(store.removeIfPending("pay_first", fingerprint, provedUnused)).resolves.toBe(true);
    expect(await store.find("pay_first", fingerprint)).toBeNull();
    expect(unresolved).toHaveBeenCalledTimes(1);
    expect(provedUnused).toHaveBeenCalledTimes(1);
  });

  it("never removes a settled record or invokes an unused-proof callback for it", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    await store.markSettled("pay_first", fingerprint);
    const proof = vi.fn(async () => true);

    await expect(store.removeIfPending("pay_first", fingerprint, proof)).resolves.toBe(false);
    expect(proof).not.toHaveBeenCalled();
    await expect(store.find("pay_first", fingerprint)).resolves.toMatchObject({ state: "settled" });
  });

  it("redacts errors thrown by the unused-proof callback and retains pending state", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    let caught: unknown;

    try {
      await store.removeIfPending("pay_first", fingerprint, async () => {
        throw new Error(`provider leaked ${paymentSignature}`);
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: "PAYMENT_ENVELOPE_CHAIN_STATE_UNRESOLVED" });
    expect(String(caught)).not.toContain(paymentSignature);
    await expect(store.find("pay_first", fingerprint)).resolves.toMatchObject({ state: "pending" });
  });

  it("uses private directory and file permissions with the exact v1 schema", async () => {
    const stateRoot = await root();
    const store = new PaymentEnvelopeStore(address, stateRoot, { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());
    const agentDirectory = agentPaymentStateDirectory(stateRoot, address);
    const file = join(agentDirectory, "payment-envelopes.v1.json");
    const document = JSON.parse(await readFile(file, "utf8"));

    expect((await stat(agentDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await readdir(agentDirectory)).filter((name) => name.includes(".tmp-"))).toEqual([]);
    expect(document).toEqual({
      records: {
        pay_first: {
          createdAt: now.toISOString(),
          paymentSignature,
          receiptId,
          requestFingerprint: fingerprint,
          state: "pending",
          updatedAt: now.toISOString(),
          validBefore: 1_784_400_300,
        },
      },
      version: 1,
    });
  });

  it("never includes the payment header in errors", async () => {
    const store = new PaymentEnvelopeStore(address, await root(), { now: () => now });
    await store.getOrCreate("pay_first", fingerprint, factory());

    try {
      await store.getOrCreate("pay_first", otherFingerprint, factory());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentEnvelopeStoreError);
      expect(String(error)).not.toContain(paymentSignature);
    }
  });
});
