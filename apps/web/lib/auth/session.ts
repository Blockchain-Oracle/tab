import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "tab_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

const sessionIssuer = "tab";
const sessionAudience = "tab-web";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MerchantSession {
  email: string;
  merchantId: string;
  mode: "test" | "live";
  userId: string;
}

export class InvalidSessionTokenError extends Error {
  constructor(message = "The merchant session token is invalid", options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidSessionTokenError";
  }
}

function sessionKey(secret: string) {
  const key = new TextEncoder().encode(secret);

  if (key.byteLength < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes");
  }

  return key;
}

function configuredSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }

  return secret;
}

export function sessionSigningConfigured() {
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && new TextEncoder().encode(secret).byteLength >= 32);
}

function validatedClaims(payload: Record<string, unknown>): MerchantSession {
  const { email, merchantId, mode, sub: userId } = payload;

  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof merchantId !== "string" ||
    !uuid.test(merchantId) ||
    (mode !== "test" && mode !== "live") ||
    typeof userId !== "string" ||
    !uuid.test(userId)
  ) {
    throw new Error("Session claims are invalid");
  }

  return { email, merchantId, mode, userId };
}

export async function createSessionToken(claims: MerchantSession, secret = configuredSecret()) {
  return new SignJWT({
    email: claims.email,
    merchantId: claims.merchantId,
    mode: claims.mode,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey(secret));
}

export async function readSessionToken(token: string, secret = configuredSecret()) {
  const key = sessionKey(secret);

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      audience: sessionAudience,
      issuer: sessionIssuer,
      maxTokenAge: SESSION_TTL_SECONDS,
      requiredClaims: ["exp", "iat", "sub"],
    });

    return validatedClaims(payload);
  } catch (error) {
    throw new InvalidSessionTokenError(error instanceof Error ? error.message : undefined, {
      cause: error,
    });
  }
}

export function sessionCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: isProduction,
  };
}
