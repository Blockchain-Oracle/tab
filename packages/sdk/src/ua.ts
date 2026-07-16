import {
  type IAssetsResponse,
  type ISmartAccountOptions,
  type IUniversalAccountConfig,
  UNIVERSAL_ACCOUNT_VERSION,
  UniversalAccount,
} from "@particle-network/universal-account-sdk";
import { getAddress, isAddress } from "viem";

export type ParticleClientConfig = {
  projectAppUuid: string;
  projectClientKey: string;
  projectId: string;
};

type ReadableUniversalAccount = {
  getPrimaryAssets(): Promise<IAssetsResponse>;
  getSmartAccountOptions(): Promise<ISmartAccountOptions>;
};

export class InvalidUniversalAccountError extends Error {
  constructor() {
    super("The Universal Account response was invalid");
    this.name = "InvalidUniversalAccountError";
  }
}

function accountConfig(config: ParticleClientConfig, ownerAddress: string) {
  if (
    !config.projectId.trim() ||
    !config.projectClientKey.trim() ||
    !config.projectAppUuid.trim() ||
    !isAddress(ownerAddress)
  ) {
    throw new InvalidUniversalAccountError();
  }
  return {
    projectAppUuid: config.projectAppUuid,
    projectClientKey: config.projectClientKey,
    projectId: config.projectId,
    smartAccountOptions: {
      name: "UNIVERSAL",
      ownerAddress: getAddress(ownerAddress),
      useEIP7702: true,
      version: UNIVERSAL_ACCOUNT_VERSION,
    },
    tradeConfig: { slippageBps: 100 },
  } satisfies IUniversalAccountConfig;
}

export function createUniversalAccountClient<T = UniversalAccount>(
  config: ParticleClientConfig,
  ownerAddress: string,
  options: { instantiate?: (config: IUniversalAccountConfig) => T } = {},
) {
  const instantiate = options.instantiate ?? ((value) => new UniversalAccount(value) as T);
  return instantiate(accountConfig(config, ownerAddress));
}

export async function readAccountSnapshot(
  account: ReadableUniversalAccount,
  expectedOwnerAddress: string,
) {
  const expected = isAddress(expectedOwnerAddress) ? getAddress(expectedOwnerAddress) : undefined;
  if (!expected) throw new InvalidUniversalAccountError();

  const [assets, options] = await Promise.all([
    account.getPrimaryAssets(),
    account.getSmartAccountOptions(),
  ]);
  const returnedOwner = isAddress(options.ownerAddress)
    ? getAddress(options.ownerAddress)
    : undefined;
  const returnedSmartAccount =
    typeof options.smartAccountAddress === "string" && isAddress(options.smartAccountAddress)
      ? getAddress(options.smartAccountAddress)
      : undefined;
  if (
    !Number.isFinite(assets.totalAmountInUSD) ||
    assets.totalAmountInUSD < 0 ||
    options.useEIP7702 !== true ||
    returnedOwner !== expected ||
    returnedSmartAccount !== expected
  ) {
    throw new InvalidUniversalAccountError();
  }
  return { balanceUsd: assets.totalAmountInUSD, depositAddress: returnedOwner };
}
