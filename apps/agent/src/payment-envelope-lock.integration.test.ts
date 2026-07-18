import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { agentPaymentStateDirectory, PaymentEnvelopeStore } from "./payment-envelope-store.js";

const run = promisify(execFile);
const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const address = "0x1111111111111111111111111111111111111111" as const;
const fingerprint = "ab".repeat(32);
const paymentSignature = "eyJ4NDAyVmVyc2lvbiI6Mn0=";
const roots: string[] = [];
const children = new Set<ChildProcess>();

async function root() {
  const directory = await mkdtemp(join(tmpdir(), "tab-envelope-lock-"));
  roots.push(directory);
  return directory;
}

function environment(stateRoot: string, marker: string) {
  return {
    ...process.env,
    ADDRESS: address,
    FINGERPRINT: fingerprint,
    MARKER: marker,
    PAYMENT_SIGNATURE: paymentSignature,
    STATE_ROOT: stateRoot,
  };
}

function child(script: string, stateRoot: string, marker: string) {
  const process_ = spawn(process.execPath, ["--import", "tsx", "--eval", script], {
    cwd: packageDirectory,
    env: environment(stateRoot, marker),
    stdio: "ignore",
  });
  children.add(process_);
  process_.once("exit", () => children.delete(process_));
  return process_;
}

async function waitForFile(path: string) {
  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    try {
      await stat(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("Child did not acquire the payment-envelope lock");
}

function exit(process_: ChildProcess) {
  return new Promise<void>((resolve) => process_.once("exit", () => resolve()));
}

const holdingScript = `
  import { writeFile } from "node:fs/promises";
  import { PaymentEnvelopeStore } from "./src/payment-envelope-store.ts";
  const store = new PaymentEnvelopeStore(process.env.ADDRESS, process.env.STATE_ROOT);
  await store.getOrCreate("pay_held", process.env.FINGERPRINT, async () => {
    await writeFile(process.env.MARKER, "locked");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return { paymentSignature: process.env.PAYMENT_SIGNATURE,
      receiptId: "receipt-held", validBefore: 1784400300 };
  });
`;

const releasingScript = `
  import { writeFile } from "node:fs/promises";
  import { PaymentEnvelopeStore } from "./src/payment-envelope-store.ts";
  const store = new PaymentEnvelopeStore(process.env.ADDRESS, process.env.STATE_ROOT);
  await store.getOrCreate("pay_released", process.env.FINGERPRINT, async () => {
    await writeFile(process.env.MARKER, "locked");
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { paymentSignature: process.env.PAYMENT_SIGNATURE,
      receiptId: "receipt-released", validBefore: 1784400300 };
  });
`;

afterEach(async () => {
  for (const process_ of children) process_.kill("SIGKILL");
  await Promise.all([...children].map(exit));
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("PaymentEnvelopeStore kernel lock", () => {
  it("serializes separate processes so a same-key factory runs once", async () => {
    const stateRoot = await root();
    const marker = join(stateRoot, "factory-calls");
    const script = `
      import { appendFile } from "node:fs/promises";
      import { PaymentEnvelopeStore } from "./src/payment-envelope-store.ts";
      const store = new PaymentEnvelopeStore(process.env.ADDRESS, process.env.STATE_ROOT);
      await store.getOrCreate("pay_cross_process", process.env.FINGERPRINT, async () => {
        await appendFile(process.env.MARKER, "called\\n");
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { paymentSignature: process.env.PAYMENT_SIGNATURE,
          receiptId: "receipt-cross-process", validBefore: 1784400300 };
      });
    `;
    const env = environment(stateRoot, marker);

    await Promise.all([
      run(process.execPath, ["--import", "tsx", "--eval", script], {
        cwd: packageDirectory,
        env,
      }),
      run(process.execPath, ["--import", "tsx", "--eval", script], {
        cwd: packageDirectory,
        env,
      }),
    ]);

    expect(await readFile(marker, "utf8")).toBe("called\n");
  });

  it("recovers immediately after a lock holder is killed", async () => {
    const stateRoot = await root();
    const marker = join(stateRoot, "holder-ready");
    const holder = child(holdingScript, stateRoot, marker);
    await waitForFile(marker);
    holder.kill("SIGKILL");
    await exit(holder);

    await expect(
      new PaymentEnvelopeStore(address, stateRoot).getOrCreate(
        "pay_after_crash",
        fingerprint,
        async () => ({
          paymentSignature,
          receiptId: "receipt-after-crash",
          validBefore: 1_784_400_300,
        }),
      ),
    ).resolves.toMatchObject({ created: true });
  });

  it("caps retry sleep to the remaining monotonic deadline", async () => {
    const stateRoot = await root();
    const marker = join(stateRoot, "holder-ready");
    child(holdingScript, stateRoot, marker);
    await waitForFile(marker);
    const started = performance.now();

    await expect(
      new PaymentEnvelopeStore(address, stateRoot, {
        lockRetryDelayMs: 60_000,
        lockTimeoutMs: 40,
      }).find("pay_missing", fingerprint),
    ).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_LOCK_TIMEOUT" });
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("does not acquire after its deadline when the event loop wakes late", async () => {
    const stateRoot = await root();
    const marker = join(stateRoot, "holder-ready");
    child(releasingScript, stateRoot, marker);
    await waitForFile(marker);
    const attempt = new PaymentEnvelopeStore(address, stateRoot, {
      lockRetryDelayMs: 30,
      lockTimeoutMs: 30,
    }).find("pay_missing", fingerprint);
    await new Promise((resolve) => setTimeout(resolve, 10));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);

    await expect(attempt).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_LOCK_TIMEOUT" });
  });

  it("rejects a FIFO lock anchor without blocking", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    await run("mkdir", ["-p", directory]);
    await run("mkfifo", [join(directory, ".payment-envelopes.lock")]);
    const started = performance.now();

    await expect(
      new PaymentEnvelopeStore(address, stateRoot, { lockTimeoutMs: 40 }).find(
        "pay_missing",
        fingerprint,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_ENVELOPE_CORRUPT" });
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("keeps the persistent lock anchor private while held", async () => {
    const stateRoot = await root();
    const directory = agentPaymentStateDirectory(stateRoot, address);
    let mode = 0;
    const store = new PaymentEnvelopeStore(address, stateRoot);

    await store.getOrCreate("pay_mode", fingerprint, async () => {
      mode = (await stat(join(directory, ".payment-envelopes.lock"))).mode & 0o777;
      return { paymentSignature, receiptId: "receipt-mode", validBefore: 1_784_400_300 };
    });

    expect(mode).toBe(0o600);
  });
});
