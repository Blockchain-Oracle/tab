import { createPublicClient, http, isAddress } from "viem";
import { arbitrum, base, baseSepolia } from "viem/chains";

import { paymentNetworkConfiguration } from "./payment-profile";

const FLOATS = {
  "eip155:42161": {
    chain: arbitrum,
  },
  "eip155:8453": {
    chain: base,
  },
  "eip155:84532": { chain: baseSepolia },
} as const;

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export class FloatBalanceError extends Error {
  constructor(
    readonly code: "INVALID_AGENT_ADDRESS" | "RPC_CHAIN_MISMATCH" | "UNSUPPORTED_NETWORK",
  ) {
    super(
      code === "UNSUPPORTED_NETWORK"
        ? "The float network is unsupported."
        : code === "RPC_CHAIN_MISMATCH"
          ? "The float RPC returned the wrong chain."
          : "The agent address is invalid.",
    );
    this.name = "FloatBalanceError";
  }
}

export async function readFloatBalance(options: {
  address: string;
  network: string;
  rpcUrl?: string;
}) {
  if (!isAddress(options.address)) throw new FloatBalanceError("INVALID_AGENT_ADDRESS");
  const float = FLOATS[options.network as keyof typeof FLOATS];
  if (!float) throw new FloatBalanceError("UNSUPPORTED_NETWORK");
  const configuration = paymentNetworkConfiguration(options.network);
  const rpcUrl =
    options.rpcUrl ??
    process.env[configuration.rpcEnvironmentName] ??
    float.chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: float.chain, transport: http(rpcUrl) });
  if ((await client.getChainId()) !== configuration.chainId) {
    throw new FloatBalanceError("RPC_CHAIN_MISMATCH");
  }
  return client.readContract({
    abi: BALANCE_OF_ABI,
    address: configuration.asset,
    args: [options.address],
    functionName: "balanceOf",
  });
}
