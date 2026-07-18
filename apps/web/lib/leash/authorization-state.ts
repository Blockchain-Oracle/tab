import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  isAddress,
} from "viem";
import { arbitrum, base, baseSepolia } from "viem/chains";

import { paymentNetworkConfiguration } from "./payment-profile";

const CHAINS = {
  "eip155:42161": arbitrum,
  "eip155:8453": base,
  "eip155:84532": baseSepolia,
} as const;

const AUTHORIZATION_STATE_ABI = [
  {
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    name: "authorizationState",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MAX_RPC_RESPONSE_BYTES = 65_536;

export class AuthorizationStateError extends Error {
  constructor(
    readonly code:
      | "FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE"
      | "INVALID_AUTHORIZATION_IDENTITY"
      | "RPC_CHAIN_MISMATCH"
      | "UNSUPPORTED_NETWORK",
  ) {
    super("The authorization state could not be read safely.");
    this.name = "AuthorizationStateError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBoundedJson(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) {
    throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
    rejectAbort?.(new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RPC_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export async function readFinalizedAuthorizationUsed(options: {
  fetch?: typeof globalThis.fetch;
  network: string;
  nonce: string;
  payer: string;
  rpcUrl?: string;
  signal?: AbortSignal;
  validBeforeSeconds: number;
}) {
  try {
    if (
      !isAddress(options.payer) ||
      !/^0x[0-9a-fA-F]{64}$/.test(options.nonce) ||
      !Number.isSafeInteger(options.validBeforeSeconds) ||
      options.validBeforeSeconds < 0
    ) {
      throw new AuthorizationStateError("INVALID_AUTHORIZATION_IDENTITY");
    }
    const chain = CHAINS[options.network as keyof typeof CHAINS];
    if (!chain) throw new AuthorizationStateError("UNSUPPORTED_NETWORK");
    const configuration = paymentNetworkConfiguration(options.network);
    const rpcUrl =
      options.rpcUrl ??
      process.env[configuration.rpcEnvironmentName] ??
      chain.rpcUrls.default.http[0];
    const timeout = AbortSignal.timeout(5_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const fetch_ = options.fetch ?? globalThis.fetch;
    const request = async (body: unknown) =>
      readBoundedJson(
        await fetch_(rpcUrl, {
          body: JSON.stringify(body),
          headers: { accept: "application/json", "content-type": "application/json" },
          method: "POST",
          redirect: "error",
          signal,
        }),
        signal,
      );
    const head = await request([
      { id: 1, jsonrpc: "2.0", method: "eth_chainId", params: [] },
      {
        id: 2,
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["finalized", false],
      },
    ]);
    if (!Array.isArray(head)) {
      throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
    }
    const chainResult = head.find((entry) => record(entry) && entry.id === 1);
    const blockResult = head.find((entry) => record(entry) && entry.id === 2);
    const block =
      record(blockResult) && record(blockResult.result) ? blockResult.result : undefined;
    if (
      !record(chainResult) ||
      chainResult.result !== `0x${configuration.chainId.toString(16)}` ||
      !block ||
      typeof block.hash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
      typeof block.number !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(block.number) ||
      typeof block.timestamp !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(block.timestamp) ||
      BigInt(block.timestamp) < BigInt(options.validBeforeSeconds)
    ) {
      throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
    }
    const state = await request({
      id: 3,
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          data: encodeFunctionData({
            abi: AUTHORIZATION_STATE_ABI,
            args: [options.payer as `0x${string}`, options.nonce as `0x${string}`],
            functionName: "authorizationState",
          }),
          to: configuration.asset,
        },
        { blockHash: block.hash, requireCanonical: true },
      ],
    });
    if (
      !record(state) ||
      state.id !== 3 ||
      typeof state.result !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(state.result)
    ) {
      throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
    }
    return decodeFunctionResult({
      abi: AUTHORIZATION_STATE_ABI,
      data: state.result as `0x${string}`,
      functionName: "authorizationState",
    });
  } catch (error) {
    if (error instanceof AuthorizationStateError) throw error;
    throw new AuthorizationStateError("FINALIZED_AUTHORIZATION_STATE_UNAVAILABLE");
  }
}

export async function readAuthorizationUsed(options: {
  network: string;
  nonce: string;
  payer: string;
  rpcUrl?: string;
}) {
  if (!isAddress(options.payer) || !/^0x[0-9a-fA-F]{64}$/.test(options.nonce)) {
    throw new AuthorizationStateError("INVALID_AUTHORIZATION_IDENTITY");
  }
  const chain = CHAINS[options.network as keyof typeof CHAINS];
  if (!chain) throw new AuthorizationStateError("UNSUPPORTED_NETWORK");
  const configuration = paymentNetworkConfiguration(options.network);
  const rpcUrl =
    options.rpcUrl ??
    process.env[configuration.rpcEnvironmentName] ??
    chain.rpcUrls.default.http[0];
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 0, timeout: 5_000 }),
  });
  if ((await client.getChainId()) !== configuration.chainId) {
    throw new AuthorizationStateError("RPC_CHAIN_MISMATCH");
  }
  return client.readContract({
    abi: AUTHORIZATION_STATE_ABI,
    address: configuration.asset,
    args: [options.payer as `0x${string}`, options.nonce as `0x${string}`],
    functionName: "authorizationState",
  });
}
