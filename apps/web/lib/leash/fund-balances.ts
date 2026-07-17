import {
  createUniversalAccountClient,
  type ParticleClientConfig,
  readAccountSnapshot,
} from "@tab/sdk/ua";

import { readFloatBalance } from "./float-balance";

const FLOAT_NETWORKS = [
  { label: "Base", network: "eip155:8453" },
  { label: "Arbitrum", network: "eip155:42161" },
] as const;

type ParticleEnvironment = Partial<
  Record<"PARTICLE_APP_ID" | "PARTICLE_CLIENT_KEY" | "PARTICLE_PROJECT_ID", string | undefined>
>;
type UniversalAccountReader = Parameters<typeof readAccountSnapshot>[0];
type Dependencies = {
  createUniversalAccountClient: (
    config: ParticleClientConfig,
    ownerAddress: string,
  ) => UniversalAccountReader;
  readAccountSnapshot: typeof readAccountSnapshot;
  readFloatBalance: typeof readFloatBalance;
};

const productionDependencies: Dependencies = {
  createUniversalAccountClient,
  readAccountSnapshot,
  readFloatBalance,
};

export type LeashFloatBalanceRead = {
  balanceAtomic: string | null;
  label: (typeof FLOAT_NETWORKS)[number]["label"];
  network: (typeof FLOAT_NETWORKS)[number]["network"];
};

export type LeashUnifiedBalanceRead =
  | { state: "not_provisioned" }
  | { state: "configuration_unavailable" }
  | { state: "read_unavailable" }
  | { balanceUsd: number; depositAddress: string; state: "available" };

export type LeashFundsSnapshot = {
  agentAddress: string | null;
  floats: LeashFloatBalanceRead[] | null;
  unified: LeashUnifiedBalanceRead;
};

export async function readLeashFloatBalances(
  agentAddress: string | null,
  dependencies: Pick<Dependencies, "readFloatBalance"> = productionDependencies,
) {
  if (!agentAddress) return null;
  return Promise.all(
    FLOAT_NETWORKS.map(async ({ label, network }) => {
      try {
        const balance = await dependencies.readFloatBalance({ address: agentAddress, network });
        return { balanceAtomic: balance.toString(), label, network };
      } catch {
        return { balanceAtomic: null, label, network };
      }
    }),
  );
}

function particleConfig(env: ParticleEnvironment): ParticleClientConfig | null {
  const projectAppUuid = env.PARTICLE_APP_ID?.trim();
  const projectClientKey = env.PARTICLE_CLIENT_KEY?.trim();
  const projectId = env.PARTICLE_PROJECT_ID?.trim();
  return projectAppUuid && projectClientKey && projectId
    ? { projectAppUuid, projectClientKey, projectId }
    : null;
}

async function readUnifiedBalance(
  agentAddress: string | null,
  env: ParticleEnvironment,
  dependencies: Dependencies,
): Promise<LeashUnifiedBalanceRead> {
  if (!agentAddress) return { state: "not_provisioned" };
  const config = particleConfig(env);
  if (!config) return { state: "configuration_unavailable" };
  try {
    const account = dependencies.createUniversalAccountClient(config, agentAddress);
    const snapshot = await dependencies.readAccountSnapshot(account, agentAddress);
    return { ...snapshot, state: "available" };
  } catch {
    return { state: "read_unavailable" };
  }
}

export async function readLeashFundsSnapshot(
  agentAddress: string | null,
  options: {
    dependencies?: Dependencies;
    env?: ParticleEnvironment;
  } = {},
): Promise<LeashFundsSnapshot> {
  const dependencies = options.dependencies ?? productionDependencies;
  const env = options.env ?? {
    PARTICLE_APP_ID: process.env.PARTICLE_APP_ID,
    PARTICLE_CLIENT_KEY: process.env.PARTICLE_CLIENT_KEY,
    PARTICLE_PROJECT_ID: process.env.PARTICLE_PROJECT_ID,
  };
  const [floats, unified] = await Promise.all([
    readLeashFloatBalances(agentAddress, dependencies),
    readUnifiedBalance(agentAddress, env, dependencies),
  ]);
  return { agentAddress, floats, unified };
}
