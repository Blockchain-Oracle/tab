import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";

import { importJWK, jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  InvalidMagicOidcSubjectError,
  MagicOidcConfigurationError,
  magicOidcDiscovery,
  magicOidcJwks,
  mintMagicAgentJwt,
} from "./magic-oidc";

function fixtureEnvironment() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  return {
    MAGIC_OIDC_AUDIENCE: "tab-magic-express",
    MAGIC_OIDC_ISSUER: "https://tab-live.example.test",
    MAGIC_OIDC_KEY_ID: "tab-oidc-2026-07",
    MAGIC_OIDC_PRIVATE_KEY_B64: der.toString("base64"),
  };
}

describe("Tab Magic OIDC issuer", () => {
  it("publishes matching discovery and a public-only RS256 JWKS", async () => {
    const environment = fixtureEnvironment();
    const discovery = magicOidcDiscovery(environment);
    const jwks = magicOidcJwks(environment);

    expect(discovery).toEqual({
      id_token_signing_alg_values_supported: ["RS256"],
      issuer: environment.MAGIC_OIDC_ISSUER,
      jwks_uri: `${environment.MAGIC_OIDC_ISSUER}/.well-known/jwks.json`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
    });
    expect(jwks.keys).toEqual([
      expect.objectContaining({
        alg: "RS256",
        e: expect.any(String),
        kid: environment.MAGIC_OIDC_KEY_ID,
        kty: "RSA",
        n: expect.any(String),
        use: "sig",
      }),
    ]);
    expect(jwks.keys[0]).not.toHaveProperty("d");
    expect(JSON.stringify(jwks)).not.toContain(environment.MAGIC_OIDC_PRIVATE_KEY_B64);
  });

  it("mints a five-minute-or-shorter JWT for an opaque persisted subject", async () => {
    const environment = fixtureEnvironment();
    const subject = "agent_Fm6px8kY5c_UZLHdt8b6NWhjZv8gL4gG";
    const token = await mintMagicAgentJwt(subject, {
      environment,
      nowSeconds: 1_784_358_000,
    });
    const [key] = magicOidcJwks(environment).keys;
    if (!key) throw new Error("Expected public JWK");
    const verified = await jwtVerify(token, await importJWK(key, "RS256"), {
      audience: environment.MAGIC_OIDC_AUDIENCE,
      currentDate: new Date(1_784_358_000 * 1_000),
      issuer: environment.MAGIC_OIDC_ISSUER,
    });

    expect(verified.protectedHeader).toEqual({
      alg: "RS256",
      kid: environment.MAGIC_OIDC_KEY_ID,
      typ: "JWT",
    });
    expect(verified.payload).toMatchObject({
      aud: environment.MAGIC_OIDC_AUDIENCE,
      exp: 1_784_358_295,
      iat: 1_784_357_995,
      iss: environment.MAGIC_OIDC_ISSUER,
      sub: subject,
    });
    if (verified.payload.exp === undefined || verified.payload.iat === undefined) {
      throw new Error("Expected bounded JWT timestamps");
    }
    expect(verified.payload.exp - verified.payload.iat).toBeLessThanOrEqual(300);
    expect(token).not.toContain(subject);
  });

  it("rejects unsafe issuers, invalid key material, and identifying subjects", async () => {
    const valid = fixtureEnvironment();
    expect(() =>
      magicOidcDiscovery({ ...valid, MAGIC_OIDC_ISSUER: "http://tab.example.test" }),
    ).toThrow(MagicOidcConfigurationError);
    expect(() => magicOidcJwks({ ...valid, MAGIC_OIDC_PRIVATE_KEY_B64: "not-a-key" })).toThrow(
      MagicOidcConfigurationError,
    );
    await expect(
      mintMagicAgentJwt("AbubakrJimoh16488@gmail.com", {
        environment: valid,
        nowSeconds: 1_784_358_000,
      }),
    ).rejects.toBeInstanceOf(InvalidMagicOidcSubjectError);
  });

  it("derives the published public key from the configured private key", () => {
    const environment = fixtureEnvironment();
    const configured = createPrivateKey({
      format: "der",
      key: Buffer.from(environment.MAGIC_OIDC_PRIVATE_KEY_B64, "base64"),
      type: "pkcs8",
    });
    const expected = createPublicKey(configured).export({ format: "jwk" });

    expect(magicOidcJwks(environment).keys[0]).toMatchObject({ e: expected.e, n: expected.n });
  });
});
