import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, it } from "vitest";

import { sendWebhookHttpRequest } from "./http-client";

it("rejects an out-of-ledger HTTP status as a network failure", async () => {
  const server = createServer((_request, response) => response.writeHead(700).end("invalid"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await expect(
      sendWebhookHttpRequest({
        allowLocalHttp: true,
        body: "{}",
        endpointUrl: `http://127.0.0.1:${port}/invalid-status`,
        environment: "test",
        headers: {},
      }),
    ).rejects.toMatchObject({ kind: "network" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
