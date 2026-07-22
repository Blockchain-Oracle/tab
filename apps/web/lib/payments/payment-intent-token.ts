import { jwtVerify, SignJWT } from "jose";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC_ADDRESS,
  parseIntentAuditUrl,
  parsePaymentAddress,
  parseUsdAmount,
  paymentTokenForEnv,
} from "./payment-intent";

const AUDIENCE = "tab-checkout";
const CLOCK_TOLERANCE_SECONDS = 5;
const ISSUER = "tab";
const TOKEN_TTL_SECONDS = 5 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaymentEnvironment = "live" | "test";

export interface PaymentIntentTokenClaims {
  amountUsd: string;
  env: PaymentEnvironment;
  intentUrl: string;
  jti: string;
  merchantId: string;
  receiver: string;
}

export interface VerifiedPaymentIntentToken extends PaymentIntentTokenClaims {
  currency: "USD";
  expiresAt: Date;
  tokenAddress: string;
  tokenChainId: number;
}

interface PaymentIntentTokenOptions {
  now?: Date;
  secret?: string;
}

export class InvalidPaymentIntentTokenError extends Error {
  readonly code = "INVALID_PAYMENT_INTENT_TOKEN";

  constructor() {
    super("The payment intent token is invalid or expired");
    this.name = "InvalidPaymentIntentTokenError";
  }
}

export class PaymentIntentConfigurationError extends Error {
  readonly code = "PAYMENT_INTENT_CONFIGURATION_ERROR";

  constructor() {
    super("Payment intent signing is not configured");
    this.name = "PaymentIntentConfigurationError";
  }
}

function signingKey(secret = process.env.PAYMENT_INTENT_SIGNING_SECRET) {
  if (typeof secret !== "string") throw new PaymentIntentConfigurationError();
  const key = new TextEncoder().encode(secret);
  if (key.byteLength < 32) throw new PaymentIntentConfigurationError();
  return key;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function signPaymentIntentToken(
  claims: PaymentIntentTokenClaims,
  options: PaymentIntentTokenOptions = {},
) {
  const key = signingKey(options.secret);
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  let amountUsd: string;
  let intentUrl: string;
  const receiver = parsePaymentAddress(claims.receiver);
  try {
    amountUsd = parseUsdAmount(claims.amountUsd);
    intentUrl = parseIntentAuditUrl(claims.intentUrl);
  } catch {
    throw new InvalidPaymentIntentTokenError();
  }
  if (
    !validUuid(claims.jti) ||
    !validUuid(claims.merchantId) ||
    (claims.env !== "test" && claims.env !== "live") ||
    !receiver
  ) {
    throw new InvalidPaymentIntentTokenError();
  }

  return new SignJWT({
    amountUsd,
    currency: "USD",
    env: claims.env,
    intentUrl,
    receiver,
    ...paymentTokenForEnv(claims.env),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.merchantId)
    .setJti(claims.jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyPaymentIntentToken(
  token: string,
  options: PaymentIntentTokenOptions = {},
): Promise<VerifiedPaymentIntentToken> {
  const key = signingKey(options.secret);

  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      audience: AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: options.now ?? new Date(),
      issuer: ISSUER,
      requiredClaims: ["exp", "iat", "jti", "sub"],
    });
    const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
    const env = payload.env;
    if (
      protectedHeader.typ !== "JWT" ||
      !validUuid(payload.jti) ||
      !validUuid(payload.sub) ||
      (env !== "test" && env !== "live") ||
      payload.currency !== "USD" ||
      payload.tokenChainId !== paymentTokenForEnv(env).tokenChainId ||
      payload.tokenAddress !== paymentTokenForEnv(env).tokenAddress ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      !Number.isFinite(payload.exp) ||
      !Number.isFinite(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.iat) ||
      payload.exp - payload.iat !== TOKEN_TTL_SECONDS ||
      payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS
    ) {
      throw new InvalidPaymentIntentTokenError();
    }

    const amountUsd = parseUsdAmount(payload.amountUsd);
    const intentUrl = parseIntentAuditUrl(payload.intentUrl);
    const receiver = parsePaymentAddress(payload.receiver);
    if (!receiver) throw new InvalidPaymentIntentTokenError();

    return {
      amountUsd,
      currency: "USD" as const,
      env,
      expiresAt: new Date(payload.exp * 1_000),
      intentUrl,
      jti: payload.jti,
      merchantId: payload.sub,
      receiver,
      ...paymentTokenForEnv(env),
    };
  } catch {
    throw new InvalidPaymentIntentTokenError();
  }
}
