import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, it } from "vitest";

import { sendWebhookHttpRequest } from "./http-client";

it("denies merchant test-mode loopback unless the process enables the test seam", async () => {
  const server = createServer((_request, response) => response.writeHead(204).end());
  let connections = 0;
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await expect(
      sendWebhookHttpRequest({
        body: "{}",
        endpointUrl: `http://127.0.0.1:${port}/blocked`,
        environment: "test",
        headers: {},
      }),
    ).rejects.toMatchObject({ kind: "config" });
    expect(connections).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
