import { describe, expect, it } from "vitest";

import { readLeashFloatBalances } from "./fund-balances";

const ownerAddress = process.env.TAB_PARTICLE_READ_OWNER_ADDRESS ?? "";

describe.skipIf(!ownerAddress)("Agent float live reads", () => {
  it("reads native USDC balances from the real Base and Arbitrum RPCs", async () => {
    const balances = await readLeashFloatBalances(ownerAddress, "mainnet");

    expect(balances).toEqual([
      {
        balanceAtomic: expect.stringMatching(/^\d+$/),
        label: "Base",
        network: "eip155:8453",
        testFunds: false,
      },
      {
        balanceAtomic: expect.stringMatching(/^\d+$/),
        label: "Arbitrum",
        network: "eip155:42161",
        testFunds: false,
      },
    ]);
  }, 30_000);
});
