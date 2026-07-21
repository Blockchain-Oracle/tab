import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  agentPaymentStateDirectory,
  defaultPaymentStateDirectory,
  PaymentEnvelopeStore,
} from "./payment-envelope-store.js";

const address = "0x1111111111111111111111111111111111111111" as const;
const fingerprint = "ab".repeat(32);
const paymentSignature = "eyJ4NDAyVmVyc2lvbiI6Mn0=";
const roots: string[] = [];

function storedRecord(index: number, state: "pending" | "settled" = "settled") {
  return {
    createdAt: "2026-07-18T12:00:00.000Z",
    paymentSignature,
    receiptId: `receipt-${index}`,
    requestFingerprint: fingerprint,
    state,
    updatedAt: "2026-07-18T12:00:00.000Z",
    validBefore: 1_784_400_300,
  };
}

async function root() {
  const directory = await mkdtemp(join(tmpdir(), "tab-envelope-hardening-"));
  roots.push(directory);
  return directory;
}

function store(stateRoot: string, options: Record<string, unknown> = {}) {
  return new PaymentEnvelopeStore(address, stateRoot, {
    lockRetryDelayMs: 5,
    lockTimeoutMs: 2_000,
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    ...options,
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("PaymentEnvelopeStore hardening", () => {
  it("isolates pending envelopes for two agent addresses under one root", async () => {
    const stateRoot = await root();
    const otherAddress = "0x2222222222222222222222222222222222222222" as const;
    const first = new PaymentEnvelopeStore(address, stateRoot);
    const second = new PaymentEnvelopeStore(otherAddress, stateRoot);

    await first.getOrCreate("pay_first", fingerprint, async () => ({
      paymentSignature,
      receiptId: "receipt-first",
      validBefore: 1_784_400_300,
    }));
    await expect(
      second.getOrCreate("pay_second", fingerprint, async () => ({
        paymentSignature,
        receiptId: "receipt-second",
        validBefore: 1_784_400_300,
      })),
    ).resolves.toMatchObject({ created: true });
  });

  it.each([
    ["malformed JSON", "{"],
    ["unknown schema field", JSON.stringify({ records: {}, version: 1, surprise: true })],
    [
      "unknown record field",
      JSON.stringify({
        records: {
          pay_first: {
            createdAt: "2026-07-18T12:00:00.000Z",
            paymentSignature,
            receiptId: "receipt-one",
            requestFingerprint: fingerprint,
            state: "settled",
            surprise: true,
            updatedAt: "2026-07-18T12:00:00.000Z",
            validBefore: 1_784_400_300,
          },
        },
        version: 1,
      }),
    ],
    [
      "more than 1024 records",
      JSON.stringify({
        records: Object.fromEntries(
          Array.from({ length: 1_025 }, (_, index) => [`pay_${index}`, storedRecord(index)]),
        ),
        version: 1,
      }),
    ],
  ])("fails closed for %s", async (_name, contents) => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(join(directory, "payment-envelopes.v1.json"), contents, { mode: 0o600 });

    await expect(store(stateRoot).find("pay_missing", fingerprint)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_CORRUPT",
    });
  });

  it("fails closed when a document contains two pending records", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(
      join(directory, "payment-envelopes.v1.json"),
      JSON.stringify({
        records: { pay_first: storedRecord(1, "pending"), pay_second: storedRecord(2, "pending") },
        version: 1,
      }),
      { mode: 0o600 },
    );

    await expect(store(stateRoot).findPending()).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_CORRUPT",
    });
  });

  it("fails closed at capacity without deleting settled idempotency history", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(
      join(directory, "payment-envelopes.v1.json"),
      JSON.stringify({
        records: Object.fromEntries(
          Array.from({ length: 1_024 }, (_, index) => [`pay_${index}`, storedRecord(index)]),
        ),
        version: 1,
      }),
      { mode: 0o600 },
    );
    let factoryCalls = 0;

    await expect(
      store(stateRoot).getOrCreate("pay_overflow", fingerprint, async () => {
        factoryCalls += 1;
        return { paymentSignature, receiptId: "receipt-overflow", validBefore: 1_784_400_300 };
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_CAPACITY" });
    await expect(
      store(stateRoot).getOrCreate("pay_0", fingerprint, async () => {
        factoryCalls += 1;
        return { paymentSignature, receiptId: "receipt-replay", validBefore: 1_784_400_300 };
      }),
    ).resolves.toMatchObject({
      created: false,
      record: { receiptId: "receipt-0", state: "settled" },
    });
    expect(factoryCalls).toBe(0);
    const persisted = JSON.parse(
      await readFile(join(directory, "payment-envelopes.v1.json"), "utf8"),
    );
    expect(Object.keys(persisted.records)).toHaveLength(1_024);
    expect(persisted.records.pay_0).toMatchObject({ receiptId: "receipt-0", state: "settled" });
    expect(persisted.records.pay_overflow).toBeUndefined();
  });

  it("reserves worst-case serialized capacity before invoking the signing factory", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const contents = JSON.stringify({
      records: Object.fromEntries(
        Array.from({ length: 126 }, (_, index) => [
          `pay_${index}`,
          { ...storedRecord(index), paymentSignature: "A".repeat(32_768) },
        ]),
      ),
      version: 1,
    });
    expect(Buffer.byteLength(contents)).toBeLessThanOrEqual(4 * 1_024 * 1_024);
    await writeFile(join(directory, "payment-envelopes.v1.json"), contents, { mode: 0o600 });
    let factoryCalls = 0;

    await expect(
      store(stateRoot).getOrCreate("pay_overflow", fingerprint, async () => {
        factoryCalls += 1;
        return {
          paymentSignature: "A".repeat(32_768),
          receiptId: "receipt-overflow",
          validBefore: Number.MAX_SAFE_INTEGER,
        };
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_CAPACITY" });
    expect(factoryCalls).toBe(0);
    await expect(store(stateRoot).find("pay_0", fingerprint)).resolves.toMatchObject({
      receiptId: "receipt-0",
      state: "settled",
    });
  });

  it("rejects an oversized store without parsing it", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const file = join(directory, "payment-envelopes.v1.json");
    await writeFile(file, " ".repeat(4 * 1024 * 1024 + 1), { mode: 0o600 });

    await expect(store(stateRoot).find("pay_missing", fingerprint)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_OVERSIZE",
    });
  });

  it.each([
    "../escape",
    "contains whitespace",
    "",
    "a".repeat(129),
  ])("rejects unsafe idempotency key %j", async (key) => {
    await expect(store(await root()).find(key, fingerprint)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_INVALID_INPUT",
    });
  });

  it("repairs private modes on an existing agent directory and store", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await mkdir(directory, { mode: 0o755, recursive: true });
    const file = join(directory, "payment-envelopes.v1.json");
    await writeFile(file, JSON.stringify({ records: {}, version: 1 }), { mode: 0o644 });
    await chmod(directory, 0o755);

    await store(stateRoot).find("pay_missing", fingerprint);

    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("rejects a symlink substituted for the per-agent directory", async () => {
    const stateRoot = await root();
    const outside = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await symlink(outside, directory);

    await expect(store(stateRoot).find("pay_missing", fingerprint)).rejects.toMatchObject({
      code: "PAYMENT_ENVELOPE_CORRUPT",
    });
  });

  it("resolves an explicit or XDG-backed default state root", () => {
    expect(defaultPaymentStateDirectory({ TAB_STATE_DIRECTORY: "/private/tab" }, "/home/a")).toBe(
      "/private/tab",
    );
    expect(defaultPaymentStateDirectory({ XDG_STATE_HOME: "/state" }, "/home/a")).toBe(
      "/state/tab/leash",
    );
    expect(defaultPaymentStateDirectory({}, "/home/a")).toBe("/home/a/.local/state/tab/leash");
  });
});
