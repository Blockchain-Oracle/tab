import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { agentEvents, agents, leashKeys, users } from "../db/schema";
import {
  ActiveLeashKeyExistsError,
  ActiveLeashKeyNotFoundError,
  authenticateLeashKey,
  hashLeashKey,
  InvalidLeashKeyError,
  issueLeashKey,
  rotateLeashKey,
} from "./leash-key";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Leash key integration tests");

const connection = createDatabase(databaseUrl, 4);

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provisionAgent(label: string) {
  const [user] = await connection.db
    .insert(users)
    .values({
      email: `${label}-${randomUUID()}@example.test`,
      magicIssuer: `did:ethr:${randomUUID()}`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("PostgreSQL did not return the Leash owner");

  const [agent] = await connection.db
    .insert(agents)
    .values({
      name: `${label} agent`,
      ownerId: user.id,
      signerSubject: `leash:${randomUUID()}`,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("PostgreSQL did not return the Leash agent");
  return agent;
}

describe("Leash key lifecycle with real PostgreSQL", () => {
  it("issues show-once material while persisting only its SHA-256 hash and mask", async () => {
    const agent = await provisionAgent("issue");

    const created = await issueLeashKey(connection.db, { agentId: agent.id });
    const [stored] = await connection.db
      .select()
      .from(leashKeys)
      .where(eq(leashKeys.id, created.key.id));

    expect(created).toEqual({
      key: expect.objectContaining({
        agentId: agent.id,
        last4: created.secret.slice(-4),
        prefix: "leash_sk_",
        rotatedFromId: null,
      }),
      secret: expect.stringMatching(/^leash_sk_[A-Za-z0-9_-]{43}$/),
    });
    expect(stored).toMatchObject({
      agentId: agent.id,
      hashedKey: hashLeashKey(created.secret),
      last4: created.secret.slice(-4),
      prefix: "leash_sk_",
    });
    expect(JSON.stringify(stored)).not.toContain(created.secret);
  });

  it("serializes concurrent issuance and leaves exactly one active key", async () => {
    const agent = await provisionAgent("concurrent-issue");

    const results = await Promise.allSettled([
      issueLeashKey(connection.db, { agentId: agent.id }),
      issueLeashKey(connection.db, { agentId: agent.id }),
    ]);
    const active = await connection.db
      .select({ id: leashKeys.id })
      .from(leashKeys)
      .where(and(eq(leashKeys.agentId, agent.id), isNull(leashKeys.revokedAt)));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      reason: expect.any(ActiveLeashKeyExistsError),
      status: "rejected",
    });
    expect(active).toHaveLength(1);
  });

  it("authenticates only an exact active bearer and atomically stamps lastUsedAt", async () => {
    const agent = await provisionAgent("authenticate");
    const created = await issueLeashKey(connection.db, { agentId: agent.id });

    await expect(authenticateLeashKey(connection.db, `Bearer ${created.secret}`)).resolves.toEqual({
      agentId: agent.id,
      leashKeyId: created.key.id,
    });

    const [stored] = await connection.db
      .select({ lastUsedAt: leashKeys.lastUsedAt })
      .from(leashKeys)
      .where(eq(leashKeys.id, created.key.id));
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("returns one generic rejection for missing, malformed, unknown, and revoked keys", async () => {
    const agent = await provisionAgent("invalid");
    const created = await issueLeashKey(connection.db, { agentId: agent.id });
    await connection.db
      .update(leashKeys)
      .set({ revokedAt: new Date() })
      .where(eq(leashKeys.id, created.key.id));

    const unknown = `leash_sk_${"z".repeat(43)}`;
    for (const header of [null, created.secret, `Bearer ${unknown}`, `Bearer ${created.secret}`]) {
      await expect(authenticateLeashKey(connection.db, header)).rejects.toEqual(
        expect.objectContaining({
          code: "INVALID_LEASH_KEY",
          message: "The Leash key is invalid or revoked.",
          name: "InvalidLeashKeyError",
        }),
      );
    }
    const [revoked] = await connection.db
      .select({ lastUsedAt: leashKeys.lastUsedAt })
      .from(leashKeys)
      .where(eq(leashKeys.id, created.key.id));
    expect(revoked?.lastUsedAt).toBeNull();
  });

  it("revokes the old key and links the one-time replacement in one transaction", async () => {
    const agent = await provisionAgent("rotate");
    const original = await issueLeashKey(connection.db, { agentId: agent.id });

    const replacement = await rotateLeashKey(connection.db, {
      agentId: agent.id,
      keyId: original.key.id,
    });
    const rows = await connection.db
      .select()
      .from(leashKeys)
      .where(eq(leashKeys.agentId, agent.id));
    const events = await connection.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.agentId, agent.id));
    const oldRow = rows.find((row) => row.id === original.key.id);
    const newRow = rows.find((row) => row.id === replacement.key.id);

    expect(oldRow?.revokedAt).toBeInstanceOf(Date);
    expect(newRow).toMatchObject({
      hashedKey: hashLeashKey(replacement.secret),
      revokedAt: null,
      rotatedFromId: original.key.id,
    });
    expect(JSON.stringify(rows)).not.toContain(original.secret);
    expect(JSON.stringify(rows)).not.toContain(replacement.secret);
    expect(events).toEqual([
      expect.objectContaining({
        actorSurface: "web",
        agentId: agent.id,
        metadata: {
          reason: "key_rotation",
          replacementKeyId: replacement.key.id,
          revokedKeyId: original.key.id,
        },
        type: "revoke",
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain(original.secret);
    expect(JSON.stringify(events)).not.toContain(replacement.secret);
    expect(JSON.stringify(events)).not.toContain(hashLeashKey(original.secret));
    expect(JSON.stringify(events)).not.toContain(hashLeashKey(replacement.secret));
    await expect(
      authenticateLeashKey(connection.db, `Bearer ${original.secret}`),
    ).rejects.toBeInstanceOf(InvalidLeashKeyError);
    await expect(
      authenticateLeashKey(connection.db, `Bearer ${replacement.secret}`),
    ).resolves.toMatchObject({ agentId: agent.id, leashKeyId: replacement.key.id });
  });

  it("allows only one concurrent rotation of the same active key", async () => {
    const agent = await provisionAgent("concurrent-rotate");
    const original = await issueLeashKey(connection.db, { agentId: agent.id });
    const target = { agentId: agent.id, keyId: original.key.id };

    const results = await Promise.allSettled([
      rotateLeashKey(connection.db, target),
      rotateLeashKey(connection.db, target),
    ]);
    const active = await connection.db
      .select({ id: leashKeys.id })
      .from(leashKeys)
      .where(and(eq(leashKeys.agentId, agent.id), isNull(leashKeys.revokedAt)));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      reason: expect.any(ActiveLeashKeyNotFoundError),
      status: "rejected",
    });
    expect(active).toHaveLength(1);
  });
});
