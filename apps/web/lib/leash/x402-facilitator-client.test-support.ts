import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

export const payer = "0x2000000000000000000000000000000000000002";
export const payee = "0x1000000000000000000000000000000000000001";
export const asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const requirements: PaymentRequirements = {
  amount: "1000",
  asset,
  extra: { name: "USDC", version: "2" },
  maxTimeoutSeconds: 120,
  network: "eip155:84532",
  payTo: payee,
  scheme: "exact",
};

export const payload: PaymentPayload = {
  accepted: requirements,
  payload: {
    authorization: {
      from: payer,
      nonce: `0x${"12".repeat(32)}`,
      to: payee,
      validAfter: "0",
      validBefore: "2000000000",
      value: "1000",
    },
    signature: `0x${"11".repeat(65)}`,
  },
  x402Version: 2,
};

export async function readRequestJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function localFacilitator(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
) {
  const server = createServer((request, response) => void handler(request, response));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local server did not bind.");
  return {
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
    url: `http://127.0.0.1:${address.port}/facilitator`,
  };
}

export function json(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
