import { randomBytes, randomUUID } from "node:crypto";

import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { createDatabase } from "../db/client";
import { provisionMerchant } from "../db/provision-merchant";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for webhook dashboard tests");

export const webhookDashboardConnection = createDatabase(databaseUrl, 3);
export const webhookDashboardEncryptionKey = randomBytes(32);
export const webhookDashboardOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost")
  .origin;

export async function resetWebhookDashboardTests() {
  await webhookDashboardConnection.client`truncate table users cascade`;
}

export async function closeWebhookDashboardTests() {
  await webhookDashboardConnection.client.end();
}

export async function createWebhookDashboardSession(email: string, mode: "live" | "test" = "test") {
  const identity = await provisionMerchant(webhookDashboardConnection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const token = await createSessionToken({ ...identity, email, mode });
  return { ...identity, cookie: `${SESSION_COOKIE_NAME}=${token}`, token };
}

export function webhookDashboardHeaders(cookie?: string, origin = webhookDashboardOrigin) {
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    origin,
  };
}
