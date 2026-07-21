import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "../db/client";
import {
  type ReceiptEmailInput,
  receiptEmailHtml,
  receiptEmailText,
  sendSettledReceiptEmail,
  usd,
} from "./receipt-email";

const untouchableDb = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be touched when email is unconfigured");
    },
  },
) as Database;

function input(overrides: Partial<ReceiptEmailInput> = {}): ReceiptEmailInput {
  return {
    amountUsd: "1.000000",
    explorerTxUrl: null,
    merchantName: "Museum Shop",
    mode: "sandbox",
    networkName: "Base Sepolia",
    refCode: "TAB-7K2M9",
    settledAtIso: "2026-07-19T12:00:00.000Z",
    txHash: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("receipt email", () => {
  it("reports unavailable without config — before any database read", async () => {
    vi.stubEnv("EMAIL_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(
      await sendSettledReceiptEmail(untouchableDb, "11111111-1111-4111-8111-111111111111"),
    ).toEqual({ state: "unavailable" });
  });

  it("labels sandbox payments honestly and never labels live ones", () => {
    const sandbox = receiptEmailHtml(input());
    expect(sandbox).toContain("SANDBOX");
    expect(sandbox).toContain("no real value");
    expect(sandbox).toContain("no on-chain transaction exists");
    expect(sandbox).toContain("$1.00");
    expect(sandbox).toContain("Museum Shop");

    const live = receiptEmailHtml(input({ mode: "live", networkName: "Arbitrum One" }));
    expect(live).not.toContain("SANDBOX");
    expect(live).not.toContain("no real value");
  });

  it("links a real on-chain settlement and never invents one", () => {
    const hash = `0x${"5f".repeat(32)}`;
    const linked = receiptEmailHtml(
      input({
        explorerTxUrl: `https://arbiscan.io/tx/${hash}`,
        mode: "live",
        networkName: "Arbitrum One",
        txHash: hash,
      }),
    );
    expect(linked).toContain(`https://arbiscan.io/tx/${hash}`);
    expect(linked).toContain("0x5f5f5f5f5f");

    const simulated = receiptEmailHtml(input());
    expect(simulated).not.toContain("/tx/");
  });

  it("carries the same truth in the plain-text part", () => {
    const text = receiptEmailText(input());
    expect(text).toContain("$1.00 paid to Museum Shop");
    expect(text).toContain("no on-chain transaction exists");
    expect(text).toContain("sandbox");
  });

  it("formats amounts as currency without trusting bad input", () => {
    expect(usd("1.000000")).toBe("$1.00");
    expect(usd("broken")).toBe("$broken");
  });
});
