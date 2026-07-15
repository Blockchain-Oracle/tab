import { Magic } from "magic-sdk";

export type EmailOtpFlow = ReturnType<Magic["auth"]["loginWithEmailOTP"]>;

let cachedClient: { client: Magic; publishableKey: string } | undefined;

export function getMagicClient(publishableKey: string) {
  const key = publishableKey.trim();

  if (typeof window === "undefined" || !key) {
    throw new Error("Magic client authentication is not configured");
  }

  if (!cachedClient || cachedClient.publishableKey !== key) {
    cachedClient = { client: new Magic(key), publishableKey: key };
  }

  return cachedClient.client;
}
