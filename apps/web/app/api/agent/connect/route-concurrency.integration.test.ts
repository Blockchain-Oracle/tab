import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "./route";
import {
  agentRow,
  closeConnectDatabase,
  eventsFor,
  provisionAgent,
  request,
  resetConnectDatabase,
} from "./route.integration-support";

describe("POST /api/agent/connect concurrency", () => {
  beforeEach(() => resetConnectDatabase());
  afterAll(() => closeConnectDatabase());

  it("serializes concurrent reports without losing counts or audit events", async () => {
    const provisioned = await provisionAgent("concurrent");
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        POST(
          request(
            {
              clientInfo: { name: `client-${index}`, version: `${index}` },
              transport: index % 2 === 0 ? "mcp" : "http",
            },
            provisioned.secret,
          ),
        ),
      ),
    );
    const counts = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200);
        return (await response.json()).client.connectionCount as number;
      }),
    );

    expect(counts.toSorted((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const stored = await agentRow(provisioned.agentId);
    expect(stored?.connectionCount).toBe(8);
    expect(stored?.firstSeenAt).toBeInstanceOf(Date);
    expect(stored?.lastSeenAt).toBeInstanceOf(Date);
    await expect(eventsFor(provisioned.agentId)).resolves.toHaveLength(8);
  });
});
