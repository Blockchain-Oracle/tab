import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import { createDatabase } from "../../../lib/db/client";
import { provisionMerchant } from "../../../lib/db/provision-merchant";
import { POST } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !process.env.SESSION_SECRET) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required for key route tests");
}

export const keyRouteConnection = createDatabase(databaseUrl, 1);
export const keyRouteOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").origin;

export async function keyRouteMerchantSession(email: string, mode: "test" | "live" = "test") {
  const identity = await provisionMerchant(keyRouteConnection.db, {
    email,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x1111111111111111111111111111111111111111",
  });
  const token = await createSessionToken({ ...identity, email, mode });
  return { ...identity, token };
}

export function keyRootRequest(
  method: "GET" | "POST",
  token?: string,
  body?: unknown,
  origin = keyRouteOrigin,
  env?: "live" | "test",
) {
  const url = new URL("/api/keys", keyRouteOrigin);
  if (env) url.searchParams.set("env", env);
  return new NextRequest(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      ...(method === "POST" ? { origin } : {}),
    },
    method,
  });
}

export function keyItemRequest(
  path: string,
  method: "DELETE" | "POST",
  token?: string,
  body?: unknown,
  origin = keyRouteOrigin,
  env?: "live" | "test",
) {
  const url = new URL(path, keyRouteOrigin);
  if (env) url.searchParams.set("env", env);
  return new NextRequest(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      origin,
    },
    method,
  });
}

export async function createKeyThroughRoute(
  token: string,
  permissions: "full" | "read_only" = "full",
) {
  const response = await POST(keyRootRequest("POST", token, { name: "Deploy key", permissions }));
  if (response.status !== 201) throw new Error("Expected API key creation to succeed");
  return response.json() as Promise<{
    key: { id: string; lastUsedAt: string | null; permissions: string };
    secret: string;
  }>;
}
