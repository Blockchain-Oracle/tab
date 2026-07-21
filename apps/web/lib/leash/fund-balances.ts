import {
  createUniversalAccountClient,
  type ParticleClientConfig,
  readAccountSnapshot,
} from "@runtab/sdk/ua";

import { readFloatBalance } from "./float-balance";
import {
  BASE_SEPOLIA_INTEGRATION_PROFILE,
  type LeashPaymentNetwork,
  networksForPaymentProfile,
  type PaymentProfile,
} from "./payment-profile";

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
  label: string;
  network: LeashPaymentNetwork;
  testFunds: boolean;
};

export type LeashUnifiedBalanceRead =
  | { state: "not_provisioned" }
  | { state: "configuration_unavailable" }
  | { state: "not_applicable_testnet" }
  | { state: "read_unavailable" }
  | { balanceUsd: number; depositAddress: string; state: "available" };

export type LeashFundsSnapshot = {
  agentAddress: string | null;
  floats: LeashFloatBalanceRead[] | null;
  paymentProfile: PaymentProfile;
  unified: LeashUnifiedBalanceRead;
};

export async function readLeashFloatBalances(
  agentAddress: string | null,
  paymentProfile: PaymentProfile,
  dependencies: Pick<Dependencies, "readFloatBalance"> = productionDependencies,
) {
  const networks = networksForPaymentProfile(paymentProfile);
  if (!agentAddress) return null;
  return Promise.all(
    networks.map(async ({ label, network, testFunds }) => {
      try {
        const balance = await dependencies.readFloatBalance({ address: agentAddress, network });
        return { balanceAtomic: balance.toString(), label, network, testFunds };
      } catch {
        return { balanceAtomic: null, label, network, testFunds };
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
  paymentProfile: PaymentProfile,
  env: ParticleEnvironment,
  dependencies: Dependencies,
): Promise<LeashUnifiedBalanceRead> {
  if (!agentAddress) return { state: "not_provisioned" };
  if (paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE) {
    return { state: "not_applicable_testnet" };
  }
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
  paymentProfile: PaymentProfile,
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
    readLeashFloatBalances(agentAddress, paymentProfile, dependencies),
    readUnifiedBalance(agentAddress, paymentProfile, env, dependencies),
  ]);
  return { agentAddress, floats, paymentProfile, unified };
}
