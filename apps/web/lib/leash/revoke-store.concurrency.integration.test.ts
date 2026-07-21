import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "../db/client";
import { revokeOwnerAgent } from "./revoke-store";
import { createRevokeHarness } from "./revoke-store.integration-support";

const harness = createRevokeHarness();
const web = { actorSurface: "web" as const };

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

describe("concurrent Agent revocation with real PostgreSQL", () => {
  it("serializes identical retries into one status change and one audit event", async () => {
    const identity = await harness.provision("same-action");
    const input = {
      ...web,
      action: "pause" as const,
      agentId: identity.id,
      ownerId: identity.ownerId,
    };
    const results = await Promise.all([
      revokeOwnerAgent(harness.connection.db, input),
      revokeOwnerAgent(harness.connection.db, input),
    ]);

    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(await harness.agentState(identity.id)).toMatchObject({ status: "paused" });
    expect(await harness.revocations(identity.id)).toHaveLength(1);
  });

  it("keeps nuclear permanent when it races a reversible action", async () => {
    const identity = await harness.provision("nuclear-race");
    const common = { ...web, agentId: identity.id, ownerId: identity.ownerId };
    const results = await Promise.allSettled([
      revokeOwnerAgent(harness.connection.db, { ...common, action: "pause" }),
      revokeOwnerAgent(harness.connection.db, {
        ...common,
        action: "nuclear",
        confirmation: identity.name,
      }),
    ]);

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await harness.agentState(identity.id)).toMatchObject({ status: "nuked" });
    expect(await harness.keys(identity.id)).toEqual([]);
    const events = await harness.revocations(identity.id);
    expect(events.at(-1)?.metadata.toStatus).toBe("nuked");
    expect(events.filter((event) => event.metadata.action === "nuclear")).toHaveLength(1);
  });

  it("rolls the state and audit event back together", async () => {
    const identity = await harness.provision("rollback");
    await expect(
      harness.connection.db.transaction(async (transaction) => {
        await revokeOwnerAgent(transaction as unknown as Database, {
          ...web,
          action: "freeze",
          agentId: identity.id,
          ownerId: identity.ownerId,
        });
        throw new Error("rollback revocation");
      }),
    ).rejects.toThrow("rollback revocation");

    expect(await harness.agentState(identity.id)).toMatchObject({ status: "provisioned" });
    expect(await harness.revocations(identity.id)).toEqual([]);
  });
});
