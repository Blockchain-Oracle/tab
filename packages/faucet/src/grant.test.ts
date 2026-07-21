import { describe, expect, it, vi } from "vitest";

import type { FaucetFunder } from "./funder";
import { executeGrant } from "./grant";
import { GRANT_GAS_WEI, GRANT_USDC_ATOMIC, TEST_FUNDS_LABEL } from "./policy";

const RECIPIENT = "0x1111111111111111111111111111111111111111";

function stubFunder(overrides: Partial<FaucetFunder> = {}): FaucetFunder {
  return {
    address: "0x2222222222222222222222222222222222222222",
    preflight: vi.fn().mockResolvedValue({
      funded: true,
      gasWei: GRANT_GAS_WEI * 10n,
      usdcAtomic: GRANT_USDC_ATOMIC * 10n,
    }),
    readBalances: vi.fn().mockResolvedValue({ gasWei: 0n, usdcAtomic: 0n }),
    sendGas: vi.fn().mockResolvedValue("0xgas"),
    sendUsdc: vi.fn().mockResolvedValue("0xusdc"),
    ...overrides,
  } as FaucetFunder;
}

describe("executeGrant", () => {
  it("funds both legs with real transaction evidence and the test-funds label", async () => {
    const funder = stubFunder();
    const report = await executeGrant(funder, RECIPIENT);

    expect(report.state).toBe("funded");
    expect(report.label).toBe(TEST_FUNDS_LABEL);
    expect(report.legs).toHaveLength(2);
    expect(report.legs[0]).toMatchObject({ asset: "gas", state: "funded", txHash: "0xgas" });
    expect(report.legs[1]).toMatchObject({ asset: "usdc", state: "funded", txHash: "0xusdc" });
    expect(report.legs[1]?.explorerTxUrl).toContain("sepolia.basescan.org/tx/0xusdc");
  });

  it("skips legs that are already funded without spending", async () => {
    const funder = stubFunder({
      readBalances: vi
        .fn()
        .mockResolvedValue({ gasWei: GRANT_GAS_WEI, usdcAtomic: GRANT_USDC_ATOMIC }),
    });
    const report = await executeGrant(funder, RECIPIENT);

    expect(report.state).toBe("funded");
    expect(report.legs.every((leg) => leg.state === "already-funded")).toBe(true);
    expect(funder.sendGas).not.toHaveBeenCalled();
    expect(funder.sendUsdc).not.toHaveBeenCalled();
  });

  it("reports unavailable — not fake success — when the treasury is low", async () => {
    const funder = stubFunder({
      preflight: vi.fn().mockResolvedValue({ funded: false, gasWei: 0n, usdcAtomic: 0n }),
    });
    const report = await executeGrant(funder, RECIPIENT);

    expect(report.state).toBe("unavailable");
    expect(report.legs.every((leg) => leg.state === "unavailable")).toBe(true);
    expect(report.legs[0]?.blocker).toContain("treasury is low");
    expect(funder.sendGas).not.toHaveBeenCalled();
  });

  it("marks a leg failed when its transfer does not confirm, keeping the other truthful", async () => {
    const funder = stubFunder({
      sendGas: vi.fn().mockRejectedValue(new Error("nope")),
    });
    const report = await executeGrant(funder, RECIPIENT);

    expect(report.state).toBe("partial");
    expect(report.legs[0]).toMatchObject({ asset: "gas", state: "failed" });
    expect(report.legs[1]).toMatchObject({ asset: "usdc", state: "funded" });
  });
});
