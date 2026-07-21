import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { FAUCET_CHAIN_ID, FAUCET_NETWORK, GRANT_GAS_WEI, GRANT_USDC_ATOMIC } from "./policy";

if (baseSepolia.id !== FAUCET_CHAIN_ID) {
  throw new Error("Faucet chain binding drifted from Base Sepolia.");
}

export interface FaucetFunderConfig {
  funderPrivateKey: string;
  rpcUrl: string;
}

export class FaucetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaucetConfigError";
  }
}

function guardRpcUrl(rpcUrl: string) {
  const rpc = new URL(rpcUrl);
  const loopback = rpc.hostname === "localhost" || rpc.hostname === "127.0.0.1";
  if (rpc.protocol !== "https:" && !loopback) {
    throw new FaucetConfigError("The faucet RPC must use HTTPS.");
  }
}

/**
 * Read-only Base Sepolia balances at an address — no key material needed.
 * Used by test-mode checkout to show the buyer's REAL test-rail balance.
 */
export async function readTestBalances(rpcUrl: string, target: string) {
  guardRpcUrl(rpcUrl);
  if (!isAddress(target)) throw new FaucetConfigError("The recipient address is invalid.");
  const recipient = getAddress(target);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, { retryCount: 1, timeout: 5_000 }),
  });
  const [gasWei, usdcAtomic] = await Promise.all([
    publicClient.getBalance({ address: recipient }),
    publicClient.readContract({
      abi: erc20Abi,
      address: getAddress(FAUCET_NETWORK.circleUsdc.address),
      args: [recipient],
      functionName: "balanceOf",
    }),
  ]);
  return { gasWei, usdcAtomic };
}

export function createFaucetFunder(config: FaucetFunderConfig) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.funderPrivateKey)) {
    throw new FaucetConfigError("FAUCET_FUNDER_PRIVATE_KEY must be a 32-byte hex key.");
  }
  guardRpcUrl(config.rpcUrl);

  const account = privateKeyToAccount(config.funderPrivateKey as `0x${string}`);
  const transport = http(config.rpcUrl, { retryCount: 1 });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });
  const usdcAddress = getAddress(FAUCET_NETWORK.circleUsdc.address);

  return {
    address: account.address,

    async readBalances(target: string) {
      if (!isAddress(target)) throw new FaucetConfigError("The recipient address is invalid.");
      const recipient = getAddress(target);
      const [gasWei, usdcAtomic] = await Promise.all([
        publicClient.getBalance({ address: recipient }),
        publicClient.readContract({
          abi: erc20Abi,
          address: usdcAddress,
          args: [recipient],
          functionName: "balanceOf",
        }),
      ]);
      return { gasWei, usdcAtomic };
    },

    /** The funder must cover one full grant, or the faucet is unavailable. */
    async preflight() {
      const { gasWei, usdcAtomic } = await this.readBalances(account.address);
      return {
        funded: gasWei >= GRANT_GAS_WEI * 2n && usdcAtomic >= GRANT_USDC_ATOMIC,
        gasWei,
        usdcAtomic,
      };
    },

    async sendGas(target: string) {
      const hash = await walletClient.sendTransaction({
        to: getAddress(target),
        value: GRANT_GAS_WEI,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // A mined-but-reverted transfer also has a receipt — funded means
      // status success, never merely "observed on-chain".
      if (receipt.status !== "success") throw new Error(`Gas transfer reverted (${hash})`);
      return hash;
    },

    async sendUsdc(target: string) {
      const hash = await walletClient.writeContract({
        abi: erc20Abi,
        address: usdcAddress,
        args: [getAddress(target), GRANT_USDC_ATOMIC],
        functionName: "transfer",
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`USDC transfer reverted (${hash})`);
      return hash;
    },
  };
}

export type FaucetFunder = ReturnType<typeof createFaucetFunder>;
