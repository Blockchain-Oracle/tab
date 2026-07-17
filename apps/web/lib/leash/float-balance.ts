import { createPublicClient, http, isAddress } from "viem";
import { arbitrum, base } from "viem/chains";

const FLOATS = {
  "eip155:42161": {
    chain: arbitrum,
    env: "ARBITRUM_RPC_URL",
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  "eip155:8453": {
    chain: base,
    env: "BASE_RPC_URL",
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
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
  constructor(readonly code: "INVALID_AGENT_ADDRESS" | "UNSUPPORTED_NETWORK") {
    super(
      code === "UNSUPPORTED_NETWORK"
        ? "The float network is unsupported."
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
  const rpcUrl = options.rpcUrl ?? process.env[float.env] ?? float.chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: float.chain, transport: http(rpcUrl) });
  return client.readContract({
    abi: BALANCE_OF_ABI,
    address: float.token,
    args: [options.address],
    functionName: "balanceOf",
  });
}
