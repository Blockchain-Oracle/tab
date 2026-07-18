import "server-only";

import { createPrivateKey, createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";

import { SignJWT } from "jose";

const MAX_JWT_LIFETIME_SECONDS = 300;
const JWT_CLOCK_SKEW_SECONDS = 5;
const OPAQUE_SUBJECT = /^agent_[A-Za-z0-9_-]{32,80}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;

type Environment = Readonly<Record<string, string | undefined>>;

export class MagicOidcConfigurationError extends Error {
  constructor() {
    super("Magic OIDC is not configured safely.");
    this.name = "MagicOidcConfigurationError";
  }
}

export class InvalidMagicOidcSubjectError extends Error {
  constructor() {
    super("The Magic OIDC subject is invalid.");
    this.name = "InvalidMagicOidcSubjectError";
  }
}

function required(environment: Environment, name: string) {
  const value = environment[name];
  if (!value || value.trim() !== value) throw new MagicOidcConfigurationError();
  return value;
}

function issuer(environment: Environment) {
  const value = required(environment, "MAGIC_OIDC_ISSUER");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MagicOidcConfigurationError();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new MagicOidcConfigurationError();
  }
  return url.origin;
}

function privateKey(environment: Environment) {
  const encoded = required(environment, "MAGIC_OIDC_PRIVATE_KEY_B64");
  if (encoded.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new MagicOidcConfigurationError();
  }
  let key: KeyObject;
  try {
    key = createPrivateKey({
      format: "der",
      key: Buffer.from(encoded, "base64"),
      type: "pkcs8",
    });
  } catch {
    throw new MagicOidcConfigurationError();
  }
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2_048) {
    throw new MagicOidcConfigurationError();
  }
  return key;
}

function configuration(environment: Environment) {
  const audience = required(environment, "MAGIC_OIDC_AUDIENCE");
  const keyId = required(environment, "MAGIC_OIDC_KEY_ID");
  if (audience.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(audience) || !KEY_ID.test(keyId)) {
    throw new MagicOidcConfigurationError();
  }
  return { audience, issuer: issuer(environment), key: privateKey(environment), keyId };
}

export function magicOidcDiscovery(environment: Environment = process.env) {
  const config = configuration(environment);
  return {
    id_token_signing_alg_values_supported: ["RS256"],
    issuer: config.issuer,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
  };
}

export function magicOidcJwks(environment: Environment = process.env) {
  const config = configuration(environment);
  const publicKey = createPublicKey(config.key).export({ format: "jwk" }) as JsonWebKey;
  if (!publicKey.e || !publicKey.n || publicKey.kty !== "RSA") {
    throw new MagicOidcConfigurationError();
  }
  return {
    keys: [
      {
        alg: "RS256",
        e: publicKey.e,
        kid: config.keyId,
        kty: "RSA",
        n: publicKey.n,
        use: "sig",
      },
    ],
  };
}

export async function mintMagicAgentJwt(
  subject: string,
  options: { environment?: Environment; nowSeconds?: number } = {},
) {
  if (!OPAQUE_SUBJECT.test(subject)) throw new InvalidMagicOidcSubjectError();
  const config = configuration(options.environment ?? process.env);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new MagicOidcConfigurationError();
  }
  const issuedAt = Math.max(0, nowSeconds - JWT_CLOCK_SKEW_SECONDS);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: config.keyId, typ: "JWT" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + MAX_JWT_LIFETIME_SECONDS)
    .sign(config.key);
}
