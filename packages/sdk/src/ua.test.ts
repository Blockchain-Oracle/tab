import { describe, expect, it, vi } from "vitest";

import {
  createUniversalAccountClient,
  InvalidUniversalAccountError,
  readAccountSnapshot,
} from "./ua";

const ownerAddress = "0x1111111111111111111111111111111111111111";

describe("Particle Universal Account adapter", () => {
  it("uses only the installed V2 nested EIP-7702 initializer", () => {
    const universalAccount = { marker: "real-constructor-result" };
    const instantiate = vi.fn(() => universalAccount);

    expect(
      createUniversalAccountClient(
        {
          projectAppUuid: "particle-app-id",
          projectClientKey: "particle-client-key",
          projectId: "particle-project-id",
        },
        ownerAddress,
        { instantiate },
      ),
    ).toBe(universalAccount);

    expect(instantiate).toHaveBeenCalledWith({
      projectAppUuid: "particle-app-id",
      projectClientKey: "particle-client-key",
      projectId: "particle-project-id",
      smartAccountOptions: {
        name: "UNIVERSAL",
        ownerAddress,
        useEIP7702: true,
        version: "2.0.1",
      },
      tradeConfig: { slippageBps: 100 },
    });
  });

  it("reads the balance and deposit address from the live account object", async () => {
    const getPrimaryAssets = vi.fn().mockResolvedValue({ assets: [], totalAmountInUSD: 8.5 });
    const getSmartAccountOptions = vi.fn().mockResolvedValue({
      name: "UNIVERSAL",
      ownerAddress,
      smartAccountAddress: ownerAddress,
      useEIP7702: true,
      version: "2.0.1",
    });

    await expect(
      readAccountSnapshot({ getPrimaryAssets, getSmartAccountOptions }, ownerAddress),
    ).resolves.toEqual({ balanceUsd: 8.5, depositAddress: ownerAddress });
    expect(getPrimaryAssets).toHaveBeenCalledOnce();
    expect(getSmartAccountOptions).toHaveBeenCalledOnce();
  });

  it("rejects an account response whose 7702 address is not the authenticated owner", async () => {
    await expect(
      readAccountSnapshot(
        {
          getPrimaryAssets: vi.fn().mockResolvedValue({ assets: [], totalAmountInUSD: 8.5 }),
          getSmartAccountOptions: vi.fn().mockResolvedValue({
            name: "UNIVERSAL",
            ownerAddress,
            smartAccountAddress: "0x2222222222222222222222222222222222222222",
            useEIP7702: true,
            version: "2.0.1",
          }),
        },
        ownerAddress,
      ),
    ).rejects.toBeInstanceOf(InvalidUniversalAccountError);
  });
});
