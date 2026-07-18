import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readFloatBalance } from "./float-balance";

const agentAddress = "0x2222222222222222222222222222222222222222";

describe("live USDC float balance through viem", () => {
  let rpcUrl = "";
  let reportedChainId = 8_453;
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({ method: body.method, params: body.params });
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result:
          body.method === "eth_chainId"
            ? `0x${reportedChainId.toString(16)}`
            : `0x${BigInt(50_000).toString(16).padStart(64, "0")}`,
      }),
    );
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
    rpcUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("reads Base native USDC balanceOf from the configured RPC", async () => {
    reportedChainId = 8_453;
    await expect(
      readFloatBalance({ address: agentAddress, network: "eip155:8453", rpcUrl }),
    ).resolves.toBe(BigInt(50_000));
    expect(calls.slice(-2)).toEqual([
      { method: "eth_chainId", params: undefined },
      expect.objectContaining({ method: "eth_call" }),
    ]);
    expect(calls.at(-1)).toMatchObject({
      method: "eth_call",
      params: [
        {
          data: expect.stringMatching(/^0x70a08231/),
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
        "latest",
      ],
    });
  });

  it("reads only Circle USDC on Base Sepolia after verifying chain ID", async () => {
    reportedChainId = 84_532;
    await expect(
      readFloatBalance({ address: agentAddress, network: "eip155:84532", rpcUrl }),
    ).resolves.toBe(BigInt(50_000));
    expect(calls.at(-1)).toMatchObject({
      method: "eth_call",
      params: [
        {
          data: expect.stringMatching(/^0x70a08231/),
          to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        },
        "latest",
      ],
    });
  });

  it("fails closed on a trusted RPC chain mismatch before reading balance", async () => {
    reportedChainId = 1;
    const before = calls.length;
    await expect(
      readFloatBalance({ address: agentAddress, network: "eip155:84532", rpcUrl }),
    ).rejects.toMatchObject({ code: "RPC_CHAIN_MISMATCH" });
    expect(calls.slice(before)).toEqual([{ method: "eth_chainId", params: undefined }]);
  });

  it("rejects unsupported networks before making an RPC call", async () => {
    const before = calls.length;
    await expect(
      readFloatBalance({ address: agentAddress, network: "eip155:137", rpcUrl }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_NETWORK" });
    expect(calls).toHaveLength(before);
  });
});
