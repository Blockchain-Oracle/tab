import { decodeFunctionResult, encodeFunctionData } from "viem";

import { validatePaymentTarget } from "./payment-target-policy.js";
import { ARBITRUM_NETWORK, BASE_NETWORK, BASE_SEPOLIA_NETWORK } from "./routing.js";

export const AUTHORIZATION_STATE_ABI = [
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

const NETWORKS = {
  [ARBITRUM_NETWORK]: { chainId: 42_161, rpcUrl: "https://arb1.arbitrum.io/rpc" },
  [BASE_NETWORK]: { chainId: 8_453, rpcUrl: "https://mainnet.base.org" },
  [BASE_SEPOLIA_NETWORK]: { chainId: 84_532, rpcUrl: "https://sepolia.base.org" },
} as const;
const MAX_RPC_RESPONSE_BYTES = 65_536;

interface PaymentAuthorizationIdentity {
  asset: `0x${string}`;
  from: `0x${string}`;
  network: keyof typeof NETWORKS;
  nonce: `0x${string}`;
  validBefore: number;
}

interface AuthorizationStateOptions {
  fetch?: typeof globalThis.fetch;
  rpcUrl?: string;
  signal?: AbortSignal;
}

export class PaymentReconciliationUnavailableError extends Error {
  readonly code = "PAYMENT_RECONCILIATION_UNAVAILABLE";

  constructor() {
    super("Independent payment authorization state is unavailable.");
    this.name = "PaymentReconciliationUnavailableError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) throw new PaymentReconciliationUnavailableError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
    rejectAbort?.(signal.reason);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (true) {
      const read = await Promise.race([reader.read(), aborted]);
      if (read.done) break;
      length += read.value.byteLength;
      if (length > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PaymentReconciliationUnavailableError();
      }
      chunks.push(read.value);
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

export async function readPaymentAuthorizationState(
  identity: PaymentAuthorizationIdentity,
  options: AuthorizationStateOptions = {},
): Promise<"unused" | "used"> {
  try {
    const network = NETWORKS[identity.network];
    if (!network) throw new PaymentReconciliationUnavailableError();
    const rpcUrl = validatePaymentTarget(options.rpcUrl ?? network.rpcUrl);
    const timeout = AbortSignal.timeout(10_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const fetch_ = options.fetch ?? globalThis.fetch;
    const request = async (body: unknown) =>
      boundedJson(
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
    if (!Array.isArray(head)) throw new PaymentReconciliationUnavailableError();
    const chain = head.find((entry) => record(entry) && entry.id === 1);
    const block = head.find((entry) => record(entry) && entry.id === 2);
    const finalized = record(block) && record(block.result) ? block.result : undefined;
    if (
      !record(chain) ||
      chain.result !== `0x${network.chainId.toString(16)}` ||
      !finalized ||
      typeof finalized.hash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(finalized.hash) ||
      typeof finalized.number !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(finalized.number) ||
      typeof finalized.timestamp !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(finalized.timestamp) ||
      BigInt(finalized.timestamp) < BigInt(identity.validBefore)
    ) {
      throw new PaymentReconciliationUnavailableError();
    }
    const state = await request({
      id: 3,
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          data: encodeFunctionData({
            abi: AUTHORIZATION_STATE_ABI,
            args: [identity.from, identity.nonce],
            functionName: "authorizationState",
          }),
          to: identity.asset,
        },
        { blockHash: finalized.hash, requireCanonical: true },
      ],
    });
    if (
      !record(state) ||
      state.id !== 3 ||
      typeof state.result !== "string" ||
      !/^0x[0-9a-fA-F]+$/.test(state.result)
    ) {
      throw new PaymentReconciliationUnavailableError();
    }
    const used = decodeFunctionResult({
      abi: AUTHORIZATION_STATE_ABI,
      data: state.result as `0x${string}`,
      functionName: "authorizationState",
    });
    return used ? "used" : "unused";
  } catch (error) {
    if (error instanceof PaymentReconciliationUnavailableError) throw error;
    throw new PaymentReconciliationUnavailableError();
  }
}
