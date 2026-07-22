import { randomBytes } from "node:crypto";

import type { TestTransferVerifier } from "./verify-test";

/** A syntactically valid Base Sepolia transaction hash for tests. */
export function fakeTxHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

/** Verifier stub: every reported transfer verifies with canonical evidence. */
export const verifiedTestTransfer: TestTransferVerifier = async (input) => ({
  outcome: "verified",
  tokenChanges: [
    {
      amountAtomic: input.amountAtomic,
      chainId: 84532,
      receiver: input.receiver,
      tokenAddress: input.tokenAddress,
    },
  ],
  txHash: input.transactionId,
});

/**
 * Local Base Sepolia RPC stub for route-level tests: serves a successful
 * eth_getTransactionReceipt containing exactly one matching USDC Transfer.
 * Point BASE_SEPOLIA_RPC_URL at the returned url.
 */
export async function startReceiptStub(transfer: {
  from: string;
  to: string;
  token: string;
  value: bigint;
}) {
  const { createServer } = await import("node:http");
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const pad = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw) as { id: number; method: string; params: [string] };
      if (body.method !== "eth_getTransactionReceipt") {
        response.end(JSON.stringify({ id: body.id, jsonrpc: "2.0", result: null }));
        return;
      }
      const hash = body.params[0];
      const result = {
        blockHash: `0x${"1".repeat(64)}`,
        blockNumber: "0x1",
        contractAddress: null,
        cumulativeGasUsed: "0x0",
        effectiveGasPrice: "0x0",
        from: transfer.from,
        gasUsed: "0x0",
        logs: [
          {
            address: transfer.token,
            blockHash: `0x${"1".repeat(64)}`,
            blockNumber: "0x1",
            data: `0x${transfer.value.toString(16).padStart(64, "0")}`,
            logIndex: "0x0",
            removed: false,
            topics: [TRANSFER_TOPIC, pad(transfer.from), pad(transfer.to)],
            transactionHash: hash,
            transactionIndex: "0x0",
          },
        ],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        to: transfer.token,
        transactionHash: hash,
        transactionIndex: "0x0",
        type: "0x2",
      };
      response.end(JSON.stringify({ id: body.id, jsonrpc: "2.0", result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("stub address");
  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    url: `http://127.0.0.1:${address.port}`,
  };
}
