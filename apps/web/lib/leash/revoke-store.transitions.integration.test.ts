import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

function revoke(
  identity: Awaited<ReturnType<typeof harness.provision>>,
  action: "pause" | "resume" | "freeze" | "unfreeze",
) {
  return revokeOwnerAgent(harness.connection.db, {
    ...web,
    action,
    agentId: identity.id,
    ownerId: identity.ownerId,
  });
}

describe("reversible Agent revocation transitions with real PostgreSQL", () => {
  it("pauses and resumes without touching the subject or either key", async () => {
    const identity = await harness.provision("pause");
    const keysBefore = await harness.keys(identity.id);

    await revoke(identity, "pause");
    expect(await harness.agentState(identity.id)).toMatchObject({
      signer_subject: identity.signerSubject,
      status: "paused",
    });
    expect(await harness.keys(identity.id)).toEqual(keysBefore);
    expect(await harness.revocations(identity.id)).toEqual([
      {
        actorSurface: "web",
        metadata: { action: "pause", fromStatus: "provisioned", toStatus: "paused" },
      },
    ]);

    await revoke(identity, "pause");
    expect(await harness.revocations(identity.id)).toHaveLength(1);

    await revoke(identity, "resume");
    await revoke(identity, "resume");
    expect(await harness.agentState(identity.id)).toMatchObject({
      signer_subject: identity.signerSubject,
      status: "provisioned",
    });
    expect(await harness.keys(identity.id)).toEqual(keysBefore);
    expect(await harness.revocations(identity.id)).toEqual([
      {
        actorSurface: "web",
        metadata: { action: "pause", fromStatus: "provisioned", toStatus: "paused" },
      },
      {
        actorSurface: "web",
        metadata: { action: "resume", fromStatus: "paused", toStatus: "provisioned" },
      },
    ]);
  });

  it("freezes from provisioned or paused and unfreezes without changing credentials", async () => {
    const direct = await harness.provision("direct-freeze");
    const directKeys = await harness.keys(direct.id);
    await revoke(direct, "freeze");
    await revoke(direct, "freeze");
    await revoke(direct, "unfreeze");
    await revoke(direct, "unfreeze");
    expect(await harness.agentState(direct.id)).toMatchObject({
      signer_subject: direct.signerSubject,
      status: "provisioned",
    });
    expect(await harness.keys(direct.id)).toEqual(directKeys);
    expect(await harness.revocations(direct.id)).toHaveLength(2);

    const escalated = await harness.provision("escalated-freeze");
    const escalatedKeys = await harness.keys(escalated.id);
    await revoke(escalated, "pause");
    await revoke(escalated, "freeze");
    expect(await harness.agentState(escalated.id)).toMatchObject({
      signer_subject: escalated.signerSubject,
      status: "frozen",
    });
    expect(await harness.keys(escalated.id)).toEqual(escalatedKeys);
    expect(await harness.revocations(escalated.id)).toEqual([
      {
        actorSurface: "web",
        metadata: { action: "pause", fromStatus: "provisioned", toStatus: "paused" },
      },
      {
        actorSurface: "web",
        metadata: { action: "freeze", fromStatus: "paused", toStatus: "frozen" },
      },
    ]);
  });

  it("rejects cross-state resume actions and preserves owner isolation", async () => {
    const frozen = await harness.provision("invalid-frozen");
    const paused = await harness.provision("invalid-paused");
    const foreign = await harness.provision("foreign-owner");
    await revoke(frozen, "freeze");
    await revoke(paused, "pause");

    await expect(revoke(frozen, "resume")).rejects.toMatchObject({
      name: "InvalidAgentTransitionError",
    });
    await expect(revoke(paused, "unfreeze")).rejects.toMatchObject({
      name: "InvalidAgentTransitionError",
    });
    await expect(
      revokeOwnerAgent(harness.connection.db, {
        ...web,
        action: "pause",
        agentId: paused.id,
        ownerId: foreign.ownerId,
      }),
    ).rejects.toMatchObject({ name: "LeashAgentNotFoundError" });

    expect(await harness.agentState(frozen.id)).toMatchObject({ status: "frozen" });
    expect(await harness.agentState(paused.id)).toMatchObject({ status: "paused" });
    expect(await harness.revocations(frozen.id)).toHaveLength(1);
    expect(await harness.revocations(paused.id)).toHaveLength(1);
  });
});
