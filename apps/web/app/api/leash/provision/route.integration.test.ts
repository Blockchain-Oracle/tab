import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRevokeRouteHarness } from "../revoke/route-test-support";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for provision guard tests");
const harness = createRevokeRouteHarness(databaseUrl);

beforeEach(async () => harness.reset());
afterAll(async () => harness.close());

describe("POST /api/leash/provision", () => {
  it("requires same-origin owner authentication and returns the exact B-03 guard", async () => {
    const owner = await harness.provision("provision-guard");
    const unauthenticated = await POST(harness.request({}));
    expect(unauthenticated.status).toBe(401);

    const crossOrigin = await POST(
      harness.request({}, owner.token, "https://attacker.example.test"),
    );
    expect(crossOrigin.status).toBe(403);

    const blocked = await POST(harness.request({}, owner.token));
    expect(blocked.status).toBe(503);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    await expect(blocked.json()).resolves.toEqual({
      error: {
        code: "OIDC_ISSUER_NOT_CONFIGURED",
        message: "Magic OIDC provisioning has not passed its live spike.",
      },
    });
  });
});
