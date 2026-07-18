import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as jwks } from "./jwks.json/route";
import { GET as discovery } from "./openid-configuration/route";

const variables = [
  "MAGIC_OIDC_AUDIENCE",
  "MAGIC_OIDC_ISSUER",
  "MAGIC_OIDC_KEY_ID",
  "MAGIC_OIDC_PRIVATE_KEY_B64",
] as const;
const original = Object.fromEntries(variables.map((name) => [name, process.env[name]]));

function configure() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  process.env.MAGIC_OIDC_AUDIENCE = "tab-magic-express";
  process.env.MAGIC_OIDC_ISSUER = "https://tab-live.example.test";
  process.env.MAGIC_OIDC_KEY_ID = "tab-oidc-2026-07";
  process.env.MAGIC_OIDC_PRIVATE_KEY_B64 = privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
}

beforeEach(() => {
  for (const name of variables) delete process.env[name];
});

afterEach(() => {
  for (const name of variables) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("public Magic OIDC routes", () => {
  it("fails closed without exposing configuration details", async () => {
    for (const response of [discovery(), jwks()]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "OIDC issuer is unavailable.",
      });
    }
  });

  it("publishes consistent cacheable discovery and JWKS documents", async () => {
    configure();
    const discoveryResponse = discovery();
    const jwksResponse = jwks();

    expect(discoveryResponse.status).toBe(200);
    expect(jwksResponse.status).toBe(200);
    expect(discoveryResponse.headers.get("cache-control")).toBe("public, max-age=300");
    expect(jwksResponse.headers.get("cache-control")).toBe("public, max-age=300");
    await expect(discoveryResponse.json()).resolves.toMatchObject({
      issuer: "https://tab-live.example.test",
      jwks_uri: "https://tab-live.example.test/.well-known/jwks.json",
    });
    await expect(jwksResponse.json()).resolves.toMatchObject({
      keys: [expect.objectContaining({ alg: "RS256", kid: "tab-oidc-2026-07" })],
    });
  });
});
