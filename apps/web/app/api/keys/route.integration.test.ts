import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashApiKey } from "../../../lib/auth/api-key";
import { authenticateSecretKey } from "../../../lib/auth/sk-auth";
import { apiKeys } from "../../../lib/db/schema";
import { closeServerDatabase } from "../../../lib/db/server";
import { POST as confirmRotation } from "./[id]/rotate/confirm/route";
import { DELETE as revokeKey } from "./[id]/route";
import { GET, POST } from "./route";
import {
  keyRouteOrigin as appOrigin,
  keyRouteConnection as connection,
  createKeyThroughRoute as createKey,
  keyItemRequest as itemRequest,
  keyRouteMerchantSession as merchantSession,
  keyRootRequest as rootRequest,
} from "./route.integration-test-support";

describe("merchant API key routes with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await closeServerDatabase();
    await connection.client.end();
  });

  it("requires a valid session and same-origin mutation", async () => {
    const identity = await merchantSession("route-auth@example.test");

    expect((await GET(rootRequest("GET"))).status).toBe(401);
    expect((await POST(rootRequest("POST", undefined, {}))).status).toBe(401);
    expect(
      (
        await POST(
          rootRequest(
            "POST",
            identity.token,
            { name: "Hostile", permissions: "full" },
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);

    const rows = await connection.db.select().from(apiKeys).where(eq(apiKeys.type, "secret"));
    expect(rows).toHaveLength(0);
  });

  it("validates names and the exact permission values", async () => {
    const identity = await merchantSession("route-validation@example.test");

    for (const body of [
      { name: 7, permissions: "full" },
      { name: "x".repeat(101), permissions: "full" },
      { name: "Deploy", permissions: "sending" },
      { name: "Deploy" },
    ]) {
      const response = await POST(rootRequest("POST", identity.token, body));
      expect(response.status).toBe(400);
    }
  });

  it("creates a one-time secret and lists only signed-tenant, signed-environment rows", async () => {
    const first = await merchantSession("route-first@example.test");
    const second = await merchantSession("route-second@example.test");
    const created = await createKey(first.token, "read_only");

    expect(created.secret).toMatch(/^sk_test_/);
    expect(created.key).toMatchObject({ lastUsedAt: null, permissions: "read_only" });

    const [stored] = await connection.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.key.id));
    expect(stored).toMatchObject({
      publicKey: null,
      secretHash: hashApiKey(created.secret),
    });

    const firstList = await GET(rootRequest("GET", first.token));
    const secondList = await GET(rootRequest("GET", second.token));
    const firstBody = await firstList.json();
    const secondBody = await secondList.json();

    expect(firstList.status).toBe(200);
    expect(firstBody.keys.some((key: { id: string }) => key.id === created.key.id)).toBe(true);
    expect(JSON.stringify(firstBody)).not.toContain(created.secret);
    expect(JSON.stringify(firstBody)).not.toContain("secretHash");
    expect(secondBody.keys.some((key: { id: string }) => key.id === created.key.id)).toBe(false);
  });

  it("keeps test and live key lists separate with no pre-provisioned live secret", async () => {
    const identity = await merchantSession("route-environments@example.test");

    const initialLiveResponse = await GET(
      rootRequest("GET", identity.token, undefined, appOrigin, "live"),
    );
    const initialLive = await initialLiveResponse.json();
    expect(initialLive.keys).toHaveLength(1);
    expect(initialLive.keys[0]).toMatchObject({ env: "live", type: "publishable" });

    const createdResponse = await POST(
      rootRequest(
        "POST",
        identity.token,
        { name: "Live deploy", permissions: "full" },
        appOrigin,
        "live",
      ),
    );
    const created = await createdResponse.json();
    expect(created.secret).toMatch(/^sk_live_/);

    const testBody = await (await GET(rootRequest("GET", identity.token))).json();
    const liveBody = await (
      await GET(rootRequest("GET", identity.token, undefined, appOrigin, "live"))
    ).json();
    expect(testBody.keys.some((key: { id: string }) => key.id === created.key.id)).toBe(false);
    expect(liveBody.keys.some((key: { id: string }) => key.id === created.key.id)).toBe(true);

    const rotatedResponse = await confirmRotation(
      itemRequest(
        `/api/keys/${created.key.id}/rotate/confirm`,
        "POST",
        identity.token,
        { confirm: true },
        appOrigin,
        "live",
      ),
      { params: Promise.resolve({ id: created.key.id }) },
    );
    const rotated = await rotatedResponse.json();
    expect(rotated.secret).toMatch(/^sk_live_/);

    const revoked = await revokeKey(
      itemRequest(
        `/api/keys/${rotated.key.id}`,
        "DELETE",
        identity.token,
        undefined,
        appOrigin,
        "live",
      ),
      { params: Promise.resolve({ id: rotated.key.id }) },
    );
    expect(revoked.status).toBe(200);
  });

  it("returns the real last_used_at stamped by secret-key authentication", async () => {
    const identity = await merchantSession("route-last-used@example.test");
    const created = await createKey(identity.token);

    await authenticateSecretKey(connection.db, `Bearer ${created.secret}`);

    const response = await GET(rootRequest("GET", identity.token));
    const body = await response.json();
    const listed = body.keys.find((key: { id: string }) => key.id === created.key.id);

    expect(listed.lastUsedAt).toEqual(expect.any(String));
    expect(new Date(listed.lastUsedAt).getTime()).not.toBeNaN();
  });

  it("requires explicit confirmation then rotates once within the signed scope", async () => {
    const first = await merchantSession("route-rotate@example.test");
    const second = await merchantSession("route-rotate-other@example.test");
    const created = await createKey(first.token, "read_only");
    const context = { params: Promise.resolve({ id: created.key.id }) };

    const unconfirmed = await confirmRotation(
      itemRequest(`/api/keys/${created.key.id}/rotate/confirm`, "POST", first.token, {
        confirm: false,
      }),
      context,
    );
    expect(unconfirmed.status).toBe(409);

    const wrongTenant = await confirmRotation(
      itemRequest(`/api/keys/${created.key.id}/rotate/confirm`, "POST", second.token, {
        confirm: true,
      }),
      context,
    );
    expect(wrongTenant.status).toBe(404);

    const response = await confirmRotation(
      itemRequest(`/api/keys/${created.key.id}/rotate/confirm`, "POST", first.token, {
        confirm: true,
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.secret).toMatch(/^sk_test_/);
    expect(body.secret).not.toBe(created.secret);
    expect(body.key).toMatchObject({
      permissions: "read_only",
      rotatedFromId: created.key.id,
    });
    await expect(
      authenticateSecretKey(connection.db, `Bearer ${created.secret}`),
    ).rejects.toMatchObject({ code: "INVALID_API_KEY" });
    await expect(
      authenticateSecretKey(connection.db, `Bearer ${body.secret}`),
    ).resolves.toMatchObject({ apiKeyId: body.key.id, permissions: "read_only" });

    const repeated = await confirmRotation(
      itemRequest(`/api/keys/${created.key.id}/rotate/confirm`, "POST", first.token, {
        confirm: true,
      }),
      context,
    );
    expect(repeated.status).toBe(404);
  });

  it("validates ids and same-origin before soft-revoking a secret key", async () => {
    const identity = await merchantSession("route-delete@example.test");
    const created = await createKey(identity.token);
    const context = { params: Promise.resolve({ id: created.key.id }) };

    const invalid = await revokeKey(itemRequest("/api/keys/not-a-uuid", "DELETE", identity.token), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(invalid.status).toBe(400);

    const hostile = await revokeKey(
      itemRequest(
        `/api/keys/${created.key.id}`,
        "DELETE",
        identity.token,
        undefined,
        "https://attacker.example",
      ),
      context,
    );
    expect(hostile.status).toBe(403);

    const response = await revokeKey(
      itemRequest(`/api/keys/${created.key.id}`, "DELETE", identity.token),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revoked: true });
    await expect(
      authenticateSecretKey(connection.db, `Bearer ${created.secret}`),
    ).rejects.toMatchObject({ code: "INVALID_API_KEY" });

    const [stored] = await connection.db
      .select({ revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, created.key.id));
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });
});
