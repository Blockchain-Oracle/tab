import { getAddress, isAddress } from "viem";

import type { MagicSigningPort } from "./magic-signer";

export { createMagicPaymentSigner } from "./magic-signer";

export type BuyerWalletSession = {
  didToken: string;
  email: string;
  ownerAddress: string;
};

type MagicUserPort = {
  getIdToken(): PromiseLike<string | null>;
  getInfo(): PromiseLike<unknown>;
  isLoggedIn(): PromiseLike<boolean>;
};

type EmailOtpFlowPort = PromiseLike<string | null> & {
  emit(event: string, value?: string): unknown;
  on(event: string, listener: () => void): EmailOtpFlowPort;
};

export type MagicClientPort = {
  auth: {
    loginWithEmailOTP(input: {
      deviceCheckUI: false;
      email: string;
      showUI: false;
    }): EmailOtpFlowPort;
  };
  user: MagicUserPort;
};

export type MagicBrowserClientPort = MagicClientPort & MagicSigningPort;

export type OtpCallbacks = {
  onDeviceApproval?: () => void;
  onExpired?: () => void;
  onInvalid?: () => void;
  onOtpSent?: () => void;
  onRateLimited?: () => void;
  onUnsupported?: () => void;
};

export class InvalidMagicSessionError extends Error {
  constructor() {
    super("Magic returned an invalid buyer session");
    this.name = "InvalidMagicSessionError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new InvalidMagicSessionError();
  }
  return normalized;
}

async function sessionFromIdentity(
  user: MagicUserPort,
  didToken: string | null,
  expectedEmail?: string,
) {
  const info = record(await user.getInfo());
  const wallets = record(info?.wallets);
  const ethereum = record(wallets?.ethereum);
  const email = typeof info?.email === "string" ? normalizeEmail(info.email) : undefined;
  const owner = ethereum?.publicAddress;
  if (
    !didToken ||
    didToken.length < 8 ||
    !email ||
    typeof owner !== "string" ||
    !isAddress(owner)
  ) {
    throw new InvalidMagicSessionError();
  }
  if (expectedEmail && email !== normalizeEmail(expectedEmail)) {
    throw new InvalidMagicSessionError();
  }
  return { didToken, email, ownerAddress: getAddress(owner) } satisfies BuyerWalletSession;
}

export async function restoreMagicSession(client: Pick<MagicClientPort, "user">) {
  if (!(await client.user.isLoggedIn())) return undefined;
  const [didToken, info] = await Promise.all([client.user.getIdToken(), client.user.getInfo()]);
  const user = { ...client.user, getInfo: () => Promise.resolve(info) };
  return sessionFromIdentity(user, didToken);
}

function bind(flow: EmailOtpFlowPort, event: string, callback?: () => void) {
  if (callback) flow.on(event, callback);
}

export function startMagicEmailOtp(
  client: MagicClientPort,
  rawEmail: string,
  callbacks: OtpCallbacks = {},
) {
  const email = normalizeEmail(rawEmail);
  const flow = client.auth.loginWithEmailOTP({ deviceCheckUI: false, email, showUI: false });
  bind(flow, "email-otp-sent", callbacks.onOtpSent);
  bind(flow, "invalid-email-otp", callbacks.onInvalid);
  bind(flow, "expired-email-otp", callbacks.onExpired);
  bind(flow, "login-throttled", callbacks.onRateLimited);
  bind(flow, "max-attempts-reached", callbacks.onRateLimited);
  bind(flow, "device-needs-approval", callbacks.onDeviceApproval);
  bind(flow, "device-verification-email-sent", callbacks.onDeviceApproval);
  for (const event of [
    "mfa-sent-handle",
    "invalid-mfa-otp",
    "recovery-code-sent-handle",
    "invalid-recovery-code",
  ]) {
    bind(flow, event, callbacks.onUnsupported);
  }

  return {
    cancel() {
      flow.emit("cancel");
    },
    result: Promise.resolve(flow).then((didToken) =>
      sessionFromIdentity(client.user, didToken, email),
    ),
    verify(otp: string) {
      if (!/^\d{6}$/.test(otp)) throw new InvalidMagicSessionError();
      flow.emit("verify-email-otp", otp);
    },
  };
}

let cachedClient: { client: MagicBrowserClientPort; publishableKey: string } | undefined;

export async function getMagicClient(publishableKey: string) {
  const key = publishableKey.trim();
  if (typeof window === "undefined" || !key) throw new InvalidMagicSessionError();
  if (!cachedClient || cachedClient.publishableKey !== key) {
    const { Magic } = await import("magic-sdk");
    cachedClient = {
      client: new Magic(key) as unknown as MagicBrowserClientPort,
      publishableKey: key,
    };
  }
  return cachedClient.client;
}
