import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authenticateLeashKey,
  hashLeashKey,
  InvalidLeashKeyError,
} from "../../../../lib/auth/leash-key";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createDatabase } from "../../../../lib/db/client";
import { agents, leashKeys, users } from "../../../../lib/db/schema";
import { GET, PATCH, POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Leash key route tests");

const connection = createDatabase(databaseUrl, 2);
const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

beforeEach(async () => {
  await connection.client`truncate table users cascade`;
});

afterAll(async () => {
  await connection.client.end();
});

async function provision(
  label: string,
  status: "provisioned" | "paused" | "frozen" | "cancelled" | "nuked" = "provisioned",
) {
  const email = `${label}-${randomUUID()}@example.test`;
  const [owner] = await connection.db
    .insert(users)
    .values({ email, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!owner) throw new Error("Expected owner");
  const terminal = status === "cancelled" || status === "nuked";
  const revokedAt = terminal ? new Date() : null;
  const [agent] = await connection.db
    .insert(agents)
    .values({
      credentialDestroyedAt: status === "nuked" ? revokedAt : null,
      createdAt: terminal ? new Date(Date.now() - 1_000) : undefined,
      ownerId: owner.id,
      name: `${label} agent`,
      signerSubject: terminal ? null : `leash:${randomUUID()}`,
      signerSubjectRevokedAt: revokedAt,
      status,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  const token = await createSessionToken({ email, userId: owner.id });
  return { agentId: agent.id, ownerId: owner.id, token };
}

function request(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token?: string,
  body?: unknown,
  origin = appOrigin,
) {
  return new NextRequest(new URL(path, appOrigin), {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin }),
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    method,
  });
}

describe("owner-authenticated Leash key routes", () => {
  it("requires a shared owner session and same-origin mutation", async () => {
    const owner = await provision("auth");
    const unauthorized = await GET(request("GET", `/api/leash/keys?agentId=${owner.agentId}`));
    expect(unauthorized.status).toBe(401);

    const crossOrigin = await POST(
      request(
        "POST",
        "/api/leash/keys",
        owner.token,
        { agentId: owner.agentId },
        "https://attacker.example.test",
      ),
    );
    expect(crossOrigin.status).toBe(403);
  });

  it("issues show-once material and only returns its durable mask afterward", async () => {
    const owner = await provision("issue");
    const response = await POST(
      request("POST", "/api/leash/keys", owner.token, { agentId: owner.agentId }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = await response.json();
    expect(created).toMatchObject({
      key: { agentId: owner.agentId, prefix: "leash_sk_" },
      secret: expect.stringMatching(/^leash_sk_[A-Za-z0-9_-]{43}$/),
    });

    const [stored] = await connection.db
      .select()
      .from(leashKeys)
      .where(eq(leashKeys.id, created.key.id));
    expect(stored).toMatchObject({
      hashedKey: hashLeashKey(created.secret),
      last4: created.secret.slice(-4),
    });
    expect(JSON.stringify(stored)).not.toContain(created.secret);

    const read = await GET(request("GET", `/api/leash/keys?agentId=${owner.agentId}`, owner.token));
    expect(read.status).toBe(200);
    const readBody = await read.json();
    expect(readBody).toEqual({ key: created.key });
    expect(JSON.stringify(readBody)).not.toContain(created.secret);

    const duplicate = await POST(
      request("POST", "/api/leash/keys", owner.token, { agentId: owner.agentId }),
    );
    expect(duplicate.status).toBe(409);
  });

  it("rotates atomically, reveals once, and rejects the old bearer", async () => {
    const owner = await provision("rotate");
    const issued = await POST(
      request("POST", "/api/leash/keys", owner.token, { agentId: owner.agentId }),
    );
    const original = await issued.json();

    const rotated = await PATCH(
      request("PATCH", "/api/leash/keys", owner.token, {
        agentId: owner.agentId,
        keyId: original.key.id,
      }),
    );
    expect(rotated.status).toBe(200);
    const replacement = await rotated.json();
    expect(replacement).toMatchObject({
      key: { agentId: owner.agentId, rotatedFromId: original.key.id },
      secret: expect.stringMatching(/^leash_sk_[A-Za-z0-9_-]{43}$/),
    });
    expect(replacement.secret).not.toBe(original.secret);

    await expect(
      authenticateLeashKey(connection.db, `Bearer ${original.secret}`),
    ).rejects.toBeInstanceOf(InvalidLeashKeyError);
    await expect(
      authenticateLeashKey(connection.db, `Bearer ${replacement.secret}`),
    ).resolves.toMatchObject({ agentId: owner.agentId, leashKeyId: replacement.key.id });
    const active = await connection.db
      .select({ id: leashKeys.id })
      .from(leashKeys)
      .where(and(eq(leashKeys.agentId, owner.agentId), isNull(leashKeys.revokedAt)));
    expect(active).toEqual([{ id: replacement.key.id }]);
  });

  it("does not leak or mutate keys across owner boundaries", async () => {
    const owned = await provision("owned");
    const foreign = await provision("foreign");
    const issued = await POST(
      request("POST", "/api/leash/keys", owned.token, { agentId: owned.agentId }),
    );
    const original = await issued.json();

    for (const response of [
      await GET(request("GET", `/api/leash/keys?agentId=${owned.agentId}`, foreign.token)),
      await POST(request("POST", "/api/leash/keys", foreign.token, { agentId: owned.agentId })),
      await PATCH(
        request("PATCH", "/api/leash/keys", foreign.token, {
          agentId: owned.agentId,
          keyId: original.key.id,
        }),
      ),
    ]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "LEASH_AGENT_NOT_FOUND" },
      });
    }

    const malformed = await PATCH(
      request("PATCH", "/api/leash/keys", owned.token, {
        agentId: owned.agentId,
        extra: true,
        keyId: original.key.id,
      }),
    );
    expect(malformed.status).toBe(400);
  });

  it.each([
    "cancelled",
    "nuked",
  ] as const)("does not issue or rotate key material for a %s agent", async (status) => {
    const issueTarget = await provision(`inactive-issue-${status}`, status);
    const issuedForInactive = await POST(
      request("POST", "/api/leash/keys", issueTarget.token, { agentId: issueTarget.agentId }),
    );
    expect(issuedForInactive.status).toBe(409);
    await expect(issuedForInactive.json()).resolves.toMatchObject({
      error: { code: "LEASH_AGENT_INACTIVE" },
    });
    expect(
      await connection.db
        .select({ id: leashKeys.id })
        .from(leashKeys)
        .where(eq(leashKeys.agentId, issueTarget.agentId)),
    ).toEqual([]);

    const rotateTarget = await provision(`inactive-rotate-${status}`);
    const initialResponse = await POST(
      request("POST", "/api/leash/keys", rotateTarget.token, {
        agentId: rotateTarget.agentId,
      }),
    );
    const initial = await initialResponse.json();
    const revokedAt = new Date();
    await connection.db
      .update(agents)
      .set({
        credentialDestroyedAt: status === "nuked" ? revokedAt : null,
        signerSubject: null,
        signerSubjectRevokedAt: revokedAt,
        status,
      })
      .where(eq(agents.id, rotateTarget.agentId));

    const rotatedForInactive = await PATCH(
      request("PATCH", "/api/leash/keys", rotateTarget.token, {
        agentId: rotateTarget.agentId,
        keyId: initial.key.id,
      }),
    );
    expect(rotatedForInactive.status).toBe(409);
    await expect(rotatedForInactive.json()).resolves.toMatchObject({
      error: { code: "LEASH_AGENT_INACTIVE" },
    });
    expect(
      await connection.db
        .select({ id: leashKeys.id, revokedAt: leashKeys.revokedAt })
        .from(leashKeys)
        .where(eq(leashKeys.agentId, rotateTarget.agentId)),
    ).toEqual([{ id: initial.key.id, revokedAt: null }]);
  });
});
