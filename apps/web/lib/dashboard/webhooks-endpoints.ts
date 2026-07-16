import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookDeliveries, webhookEndpoints } from "../db/schema";
import { parseWebhookEndpointUrl } from "../webhooks/endpoint-url";
import {
  createWebhookSecret,
  encryptWebhookSecret,
  resolveWebhookEncryptionKey,
} from "../webhooks/secret-crypto";
import { WebhookDashboardError } from "./webhooks-http";

export interface WebhookDashboardPrincipal {
  env: "live" | "test";
  merchantId: string;
}

export interface WebhookEndpointOptions {
  allowLocalHttp?: boolean;
}

type SelectDatabase = Pick<Database, "select">;

function activeScope(principal: WebhookDashboardPrincipal) {
  return and(
    eq(webhookEndpoints.merchantId, principal.merchantId),
    eq(webhookEndpoints.env, principal.env),
    isNull(webhookEndpoints.deletedAt),
  );
}

export async function loadActiveWebhookEndpoint(
  db: SelectDatabase,
  principal: WebhookDashboardPrincipal,
) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(activeScope(principal))
    .limit(1);
  return endpoint ?? null;
}

async function endpointHealth(db: Database, endpoint: typeof webhookEndpoints.$inferSelect) {
  const currentScope = and(
    eq(webhookDeliveries.endpointId, endpoint.id),
    eq(webhookDeliveries.merchantId, endpoint.merchantId),
    eq(webhookDeliveries.env, endpoint.env),
    gte(webhookDeliveries.createdAt, endpoint.updatedAt),
  );
  const [latestRows, deliveredRows] = await Promise.all([
    db
      .select({ result: webhookDeliveries.result })
      .from(webhookDeliveries)
      .where(currentScope)
      .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
      .limit(1),
    db
      .select({ completedAt: webhookDeliveries.completedAt })
      .from(webhookDeliveries)
      .where(and(currentScope, eq(webhookDeliveries.result, "delivered")))
      .orderBy(desc(webhookDeliveries.completedAt))
      .limit(1),
  ]);
  const result = latestRows[0]?.result;
  const health =
    result === "delivered"
      ? "listening"
      : result === "failed" || result === "timeout" || result === "gave_up"
        ? "failing"
        : "awaiting";
  return {
    health,
    lastDeliveredAt: deliveredRows[0]?.completedAt ?? null,
    listening: health === "listening",
  } as const;
}

export async function webhookEndpointView(
  db: Database,
  endpoint: typeof webhookEndpoints.$inferSelect,
) {
  const health = await endpointHealth(db, endpoint);
  return {
    createdAt: endpoint.createdAt,
    env: endpoint.env,
    id: endpoint.id,
    ...health,
    secretLast4: endpoint.secretLast4,
    updatedAt: endpoint.updatedAt,
    url: endpoint.url,
    verifiedAt: endpoint.verifiedAt,
  };
}

export type WebhookEndpointView = Awaited<ReturnType<typeof webhookEndpointView>>;

export async function readWebhookEndpoint(db: Database, principal: WebhookDashboardPrincipal) {
  const endpoint = await loadActiveWebhookEndpoint(db, principal);
  return endpoint ? webhookEndpointView(db, endpoint) : null;
}

function envelope(endpointId: string, principal: WebhookDashboardPrincipal, secret: string) {
  const keyVersion = 1;
  return encryptWebhookSecret(
    secret,
    { endpointId, keyVersion, ...principal },
    resolveWebhookEncryptionKey(keyVersion),
  );
}

function conflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && conflict(error.cause);
}

export async function createWebhookEndpoint(
  db: Database,
  principal: WebhookDashboardPrincipal,
  value: string,
  options: WebhookEndpointOptions = {},
) {
  const url = parseWebhookEndpointUrl(value, principal.env, options);
  const id = randomUUID();
  const secret = createWebhookSecret();
  const encrypted = envelope(id, principal, secret);
  let endpoint: typeof webhookEndpoints.$inferSelect | undefined;
  try {
    [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        env: principal.env,
        id,
        merchantId: principal.merchantId,
        secretAuthTag: encrypted.authTag,
        secretCiphertext: encrypted.ciphertext,
        secretKeyVersion: encrypted.keyVersion,
        secretLast4: secret.slice(-4),
        secretNonce: encrypted.nonce,
        url,
      })
      .returning();
  } catch (error) {
    if (conflict(error)) {
      throw new WebhookDashboardError(
        "WEBHOOK_ENDPOINT_EXISTS",
        "This environment already has an active webhook endpoint.",
        409,
      );
    }
    throw error;
  }
  if (!endpoint) throw new Error("Webhook endpoint insertion failed");
  return { endpoint: await webhookEndpointView(db, endpoint), secret };
}

function endpointRequired(endpoint: typeof webhookEndpoints.$inferSelect | null) {
  if (!endpoint) {
    throw new WebhookDashboardError(
      "WEBHOOK_ENDPOINT_NOT_FOUND",
      "No active webhook endpoint exists in this environment.",
      404,
    );
  }
  return endpoint;
}

export async function updateWebhookEndpoint(
  db: Database,
  principal: WebhookDashboardPrincipal,
  value: string,
  options: WebhookEndpointOptions = {},
) {
  const endpoint = endpointRequired(await loadActiveWebhookEndpoint(db, principal));
  const url = parseWebhookEndpointUrl(value, principal.env, options);
  if (url === endpoint.url) return webhookEndpointView(db, endpoint);
  const [updated] = await db
    .update(webhookEndpoints)
    .set({ updatedAt: new Date(), url, verifiedAt: null })
    .where(and(eq(webhookEndpoints.id, endpoint.id), activeScope(principal)))
    .returning();
  return webhookEndpointView(db, endpointRequired(updated ?? null));
}

export async function regenerateWebhookSecret(db: Database, principal: WebhookDashboardPrincipal) {
  const endpoint = endpointRequired(await loadActiveWebhookEndpoint(db, principal));
  const secret = createWebhookSecret();
  const encrypted = envelope(endpoint.id, principal, secret);
  const [updated] = await db
    .update(webhookEndpoints)
    .set({
      secretAuthTag: encrypted.authTag,
      secretCiphertext: encrypted.ciphertext,
      secretKeyVersion: encrypted.keyVersion,
      secretLast4: secret.slice(-4),
      secretNonce: encrypted.nonce,
      updatedAt: new Date(),
      verifiedAt: null,
    })
    .where(and(eq(webhookEndpoints.id, endpoint.id), activeScope(principal)))
    .returning();
  return { endpoint: await webhookEndpointView(db, endpointRequired(updated ?? null)), secret };
}

export async function deleteWebhookEndpoint(db: Database, principal: WebhookDashboardPrincipal) {
  const endpoint = endpointRequired(await loadActiveWebhookEndpoint(db, principal));
  const [deleted] = await db
    .update(webhookEndpoints)
    .set({
      deletedAt: new Date(),
      secretAuthTag: null,
      secretCiphertext: null,
      secretKeyVersion: null,
      secretNonce: null,
      updatedAt: new Date(),
    })
    .where(and(eq(webhookEndpoints.id, endpoint.id), activeScope(principal)))
    .returning({ id: webhookEndpoints.id });
  if (!deleted) throw new Error("Webhook endpoint deletion lost its active row");
}
