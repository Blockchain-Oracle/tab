import { describe, expect, it, vi } from "vitest";

import { readLeashFloatBalances, readLeashFundsSnapshot } from "./fund-balances";

const agentAddress = "0x1111111111111111111111111111111111111111";
const particle = {
  PARTICLE_APP_ID: "particle-app",
  PARTICLE_CLIENT_KEY: "particle-client",
  PARTICLE_PROJECT_ID: "particle-project",
};

describe("Leash live fund projection", () => {
  it("returns not-provisioned without inventing an address or balance", async () => {
    const readFloatBalance = vi.fn();
    const createUniversalAccountClient = vi.fn();

    await expect(
      readLeashFundsSnapshot(null, {
        dependencies: {
          createUniversalAccountClient,
          readAccountSnapshot: vi.fn(),
          readFloatBalance,
        },
        env: particle,
      }),
    ).resolves.toEqual({
      agentAddress: null,
      floats: null,
      unified: { state: "not_provisioned" },
    });
    expect(readFloatBalance).not.toHaveBeenCalled();
    expect(createUniversalAccountClient).not.toHaveBeenCalled();
  });

  it("reads only Base and Arbitrum floats and preserves a failed network as unavailable", async () => {
    const readFloatBalance = vi.fn(async ({ network }: { network: string }) => {
      if (network === "eip155:42161") throw new Error("RPC unavailable");
      return BigInt(1_250_000);
    });

    await expect(readLeashFloatBalances(agentAddress, { readFloatBalance })).resolves.toEqual([
      { balanceAtomic: "1250000", label: "Base", network: "eip155:8453" },
      { balanceAtomic: null, label: "Arbitrum", network: "eip155:42161" },
    ]);
    expect(readFloatBalance).toHaveBeenCalledTimes(2);
    expect(readFloatBalance).not.toHaveBeenCalledWith(
      expect.objectContaining({ network: "eip155:137" }),
    );
  });

  it("verifies the stored agent address through the Particle UA V2 snapshot", async () => {
    const account = { getPrimaryAssets: vi.fn(), getSmartAccountOptions: vi.fn() };
    const createUniversalAccountClient = vi.fn(() => account);
    const readAccountSnapshot = vi.fn().mockResolvedValue({
      balanceUsd: 8.5,
      depositAddress: agentAddress,
    });

    const result = await readLeashFundsSnapshot(agentAddress, {
      dependencies: {
        createUniversalAccountClient,
        readAccountSnapshot,
        readFloatBalance: vi.fn().mockResolvedValue(BigInt(0)),
      },
      env: particle,
    });

    expect(createUniversalAccountClient).toHaveBeenCalledWith(
      {
        projectAppUuid: "particle-app",
        projectClientKey: "particle-client",
        projectId: "particle-project",
      },
      agentAddress,
    );
    expect(readAccountSnapshot).toHaveBeenCalledWith(account, agentAddress);
    expect(result.unified).toEqual({
      balanceUsd: 8.5,
      depositAddress: agentAddress,
      state: "available",
    });
  });

  it("returns honest unavailable states for missing config and provider failure", async () => {
    const readFloatBalance = vi.fn().mockResolvedValue(BigInt(0));
    const createUniversalAccountClient = vi.fn(() => ({
      getPrimaryAssets: vi.fn(),
      getSmartAccountOptions: vi.fn(),
    }));
    const readAccountSnapshot = vi.fn().mockRejectedValue(new Error("provider detail"));
    const dependencies = {
      createUniversalAccountClient,
      readAccountSnapshot,
      readFloatBalance,
    };

    await expect(
      readLeashFundsSnapshot(agentAddress, { dependencies, env: {} }),
    ).resolves.toMatchObject({ unified: { state: "configuration_unavailable" } });
    expect(createUniversalAccountClient).not.toHaveBeenCalled();

    await expect(
      readLeashFundsSnapshot(agentAddress, { dependencies, env: particle }),
    ).resolves.toMatchObject({ unified: { state: "read_unavailable" } });
  });
});
