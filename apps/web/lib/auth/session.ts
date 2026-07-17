import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "tab_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

const sessionIssuer = "tab";
const sessionAudience = "tab-web";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UserSession {
  email: string;
  userId: string;
}

export interface MerchantSession extends UserSession {
  merchantId: string;
  mode: "test" | "live";
}

export type Session = UserSession | MerchantSession;

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

function validatedClaims(payload: Record<string, unknown>): Session {
  const { email, merchantId, mode, sub: userId } = payload;

  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof userId !== "string" ||
    !uuid.test(userId)
  ) {
    throw new Error("Session claims are invalid");
  }

  const hasMerchantId = merchantId !== undefined;
  const hasMode = mode !== undefined;
  if (hasMerchantId !== hasMode) throw new Error("Session claims are invalid");
  if (!hasMerchantId) return { email, userId };
  if (
    typeof merchantId !== "string" ||
    !uuid.test(merchantId) ||
    (mode !== "test" && mode !== "live")
  ) {
    throw new Error("Session claims are invalid");
  }

  return { email, merchantId, mode, userId };
}

export function isMerchantSession(session: Session): session is MerchantSession {
  return "merchantId" in session;
}

function merchantClaims(claims: Session) {
  const hasMerchantId = "merchantId" in claims;
  const hasMode = "mode" in claims;
  if (hasMerchantId !== hasMode) throw new Error("Merchant session claims must be complete");
  return hasMerchantId ? { merchantId: claims.merchantId, mode: claims.mode } : {};
}

export async function createSessionToken(claims: Session, secret = configuredSecret()) {
  return new SignJWT({
    email: claims.email,
    ...merchantClaims(claims),
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
