import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { agentEvents } from "../db/schema";
import { revokeOwnerAgent } from "./revoke-store";
import { type AgentStatus, createRevokeHarness } from "./revoke-store.integration-support";

const harness = createRevokeHarness();
const web = { actorSurface: "web" as const };

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

async function prepare(
  identity: Awaited<ReturnType<typeof harness.provision>>,
  status: AgentStatus,
) {
  if (status === "provisioned") return;
  const input = { ...web, agentId: identity.id, ownerId: identity.ownerId };
  if (status === "paused" || status === "frozen") {
    await revokeOwnerAgent(harness.connection.db, {
      ...input,
      action: status === "paused" ? "pause" : "freeze",
    });
    return;
  }
  await revokeOwnerAgent(harness.connection.db, {
    ...input,
    action: "cancel",
    confirmation: "CANCEL",
  });
}

describe("destructive Leash revocation transitions with real PostgreSQL", () => {
  it("cancels from a resumable state, revokes every key, and removes the OIDC subject", async () => {
    const identity = await harness.provision("cancel");
    await revokeOwnerAgent(harness.connection.db, {
      ...web,
      action: "freeze",
      agentId: identity.id,
      ownerId: identity.ownerId,
    });
    await revokeOwnerAgent(harness.connection.db, {
      ...web,
      action: "cancel",
      agentId: identity.id,
      confirmation: "CANCEL",
      ownerId: identity.ownerId,
    });

    const cancelled = await harness.agentState(identity.id);
    expect(cancelled).toMatchObject({
      agent_address: identity.agentAddress,
      credential_destroyed_at: null,
      signer_subject: null,
      status: "cancelled",
    });
    expect(cancelled.signer_subject_revoked_at).toBeInstanceOf(Date);
    expect(await harness.keys(identity.id)).toEqual([
      expect.objectContaining({ revokedAt: expect.any(Date) }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    ]);
    expect(await harness.revocations(identity.id)).toEqual([
      {
        actorSurface: "web",
        metadata: { action: "freeze", fromStatus: "provisioned", toStatus: "frozen" },
      },
      {
        actorSurface: "web",
        metadata: { action: "cancel", fromStatus: "frozen", toStatus: "cancelled" },
      },
    ]);

    await revokeOwnerAgent(harness.connection.db, {
      ...web,
      action: "cancel",
      agentId: identity.id,
      confirmation: "CANCEL",
      ownerId: identity.ownerId,
    });
    expect(await harness.agentState(identity.id)).toEqual(cancelled);
    expect(await harness.revocations(identity.id)).toHaveLength(2);
  });

  it.each([
    "provisioned",
    "paused",
    "frozen",
    "cancelled",
  ] as const)("nukes from %s, deletes all key material, and retains address and history", async (startingStatus) => {
    const identity = await harness.provision(`nuclear-${startingStatus}`);
    await prepare(identity, startingStatus);
    const before = await harness.agentState(identity.id);
    const eventCountBefore = (await harness.revocations(identity.id)).length;

    const input = {
      ...web,
      action: "nuclear" as const,
      agentId: identity.id,
      confirmation: identity.name,
      ownerId: identity.ownerId,
    };
    await revokeOwnerAgent(harness.connection.db, input);

    const nuked = await harness.agentState(identity.id);
    expect(nuked).toMatchObject({
      agent_address: identity.agentAddress,
      signer_subject: null,
      status: "nuked",
    });
    expect(nuked.signer_subject_revoked_at).toBeInstanceOf(Date);
    expect(nuked.credential_destroyed_at).toBeInstanceOf(Date);
    expect(await harness.keys(identity.id)).toEqual([]);
    const storedHistory = await harness.connection.db
      .select({ id: agentEvents.id })
      .from(agentEvents);
    expect(storedHistory).toContainEqual({ id: identity.historyId });
    expect(await harness.revocations(identity.id)).toContainEqual({
      actorSurface: "web",
      metadata: { action: "nuclear", fromStatus: before.status, toStatus: "nuked" },
    });

    await revokeOwnerAgent(harness.connection.db, input);
    expect(await harness.agentState(identity.id)).toEqual(nuked);
    expect(await harness.revocations(identity.id)).toHaveLength(eventCountBefore + 1);
  });

  it("requires the exact current agent name and makes the nuked tombstone permanent", async () => {
    const identity = await harness.provision("Exact-Name");
    const input = { ...web, agentId: identity.id, ownerId: identity.ownerId };

    for (const confirmation of [identity.name.toLowerCase(), `${identity.name} `, "other agent"]) {
      await expect(
        revokeOwnerAgent(harness.connection.db, { ...input, action: "nuclear", confirmation }),
      ).rejects.toMatchObject({ name: "InvalidNuclearConfirmationError" });
    }
    expect(await harness.agentState(identity.id)).toMatchObject({ status: "provisioned" });
    expect(await harness.revocations(identity.id)).toEqual([]);

    await revokeOwnerAgent(harness.connection.db, {
      ...input,
      action: "nuclear",
      confirmation: identity.name,
    });
    for (const action of ["pause", "resume", "freeze", "unfreeze", "cancel"] as const) {
      await expect(
        revokeOwnerAgent(harness.connection.db, {
          ...input,
          action,
          ...(action === "cancel" ? { confirmation: "CANCEL" as const } : {}),
        }),
      ).rejects.toMatchObject({ name: "InvalidAgentTransitionError" });
    }
    expect(await harness.agentState(identity.id)).toMatchObject({ status: "nuked" });
    expect(await harness.revocations(identity.id)).toHaveLength(1);
  });
});
