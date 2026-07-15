import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { webhookEndpoints } from "../db/schema";
import {
  armWebhookDelivery,
  claimWebhookDelivery,
  finalizeWebhookDelivery,
  type WebhookDeliveryOutcome,
} from "./delivery-store";
import { sendWebhookHttpRequest, WebhookHttpClientError } from "./http-client";
import { nextWebhookRetryAt } from "./retry";
import { decryptWebhookSecret, resolveWebhookEncryptionKey } from "./secret-crypto";
import { signWebhookPayload } from "./signature";

type ClaimedDelivery = NonNullable<Awaited<ReturnType<typeof claimWebhookDelivery>>>;
type DeliveryFailure =
  | { failureKind: "http"; statusCode: number }
  | { failureKind: "network" | "timeout"; statusCode: null };

export interface WebhookDispatchOptions {
  allowLocalHttp?: boolean;
}

function failureOutcome(
  delivery: ClaimedDelivery,
  failure: DeliveryFailure,
  signatureHeader: string,
  completedAt: Date,
  responseTimeMs: number,
  responseBodySnippet: string | null,
): WebhookDeliveryOutcome {
  const common = {
    completedAt,
    responseBodySnippet,
    responseTimeMs,
    signatureHeader,
    ...failure,
  };
  if (delivery.attempt === 3) return { ...common, result: "gave_up" };
  const nextRetryAt = nextWebhookRetryAt(delivery.attempt, completedAt);
  if (!nextRetryAt) throw new Error("Retryable webhook attempt has no retry time");
  return { ...common, nextRetryAt, result: "retrying" };
}

async function activeEndpoint(db: Database, delivery: ClaimedDelivery) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, delivery.endpointId),
        eq(webhookEndpoints.merchantId, delivery.merchantId),
        eq(webhookEndpoints.env, delivery.env),
        isNull(webhookEndpoints.deletedAt),
      ),
    )
    .limit(1);
  return endpoint ?? null;
}

async function configurationFailure(db: Database, delivery: ClaimedDelivery, leaseToken: string) {
  return finalizeWebhookDelivery(db, delivery.id, leaseToken, {
    completedAt: new Date(),
    result: "configuration",
  });
}

function endpointSecret(endpoint: NonNullable<Awaited<ReturnType<typeof activeEndpoint>>>) {
  if (
    endpoint.secretAuthTag === null ||
    endpoint.secretCiphertext === null ||
    endpoint.secretKeyVersion === null ||
    endpoint.secretNonce === null
  ) {
    throw new Error("Webhook endpoint secret is unavailable");
  }
  const context = {
    endpointId: endpoint.id,
    env: endpoint.env,
    keyVersion: endpoint.secretKeyVersion,
    merchantId: endpoint.merchantId,
  };
  return decryptWebhookSecret(
    {
      authTag: endpoint.secretAuthTag,
      ciphertext: endpoint.secretCiphertext,
      keyVersion: endpoint.secretKeyVersion,
      nonce: endpoint.secretNonce,
    },
    context,
    resolveWebhookEncryptionKey(endpoint.secretKeyVersion),
  );
}

export async function dispatchWebhookDeliveryById(
  db: Database,
  id: string,
  options: WebhookDispatchOptions = {},
) {
  const delivery = await claimWebhookDelivery(db, id);
  if (!delivery?.leaseToken) return { claimed: false, finalized: false };
  const leaseToken = delivery.leaseToken;
  const endpoint = await activeEndpoint(db, delivery);
  let secret: string;
  try {
    if (!endpoint) throw new Error("Webhook endpoint is unavailable");
    secret = endpointSecret(endpoint);
  } catch {
    return {
      claimed: true,
      finalized: await configurationFailure(db, delivery, leaseToken),
    };
  }

  const timestamp = Math.floor(Date.now() / 1_000);
  const signatureHeader = signWebhookPayload(delivery.requestBody, secret, timestamp);
  const armed = await armWebhookDelivery(db, delivery.id, leaseToken, signatureHeader);
  if (!armed) return { claimed: true, finalized: false };
  const startedAt = Date.now();
  let outcome: WebhookDeliveryOutcome;
  try {
    const response = await sendWebhookHttpRequest({
      ...(options.allowLocalHttp === undefined ? {} : { allowLocalHttp: options.allowLocalHttp }),
      body: delivery.requestBody,
      endpointUrl: endpoint.url,
      environment: delivery.env,
      headers: { "content-type": "application/json", "x-tab-signature": signatureHeader },
    });
    const completedAt = new Date();
    if (response.statusCode >= 200 && response.statusCode <= 299) {
      outcome = {
        completedAt,
        responseBodySnippet: response.responseSnippet,
        responseTimeMs: response.durationMs,
        result: "delivered",
        signatureHeader,
        statusCode: response.statusCode,
      };
    } else {
      outcome = failureOutcome(
        delivery,
        { failureKind: "http", statusCode: response.statusCode },
        signatureHeader,
        completedAt,
        response.durationMs,
        response.responseSnippet,
      );
    }
  } catch (error) {
    if (error instanceof WebhookHttpClientError && error.kind === "config") {
      return { claimed: true, finalized: await configurationFailure(db, delivery, leaseToken) };
    }
    const failureKind =
      error instanceof WebhookHttpClientError && error.kind === "timeout" ? "timeout" : "network";
    outcome = failureOutcome(
      delivery,
      { failureKind, statusCode: null },
      signatureHeader,
      new Date(),
      Math.max(0, Date.now() - startedAt),
      null,
    );
  }
  return {
    claimed: true,
    finalized: await finalizeWebhookDelivery(db, delivery.id, leaseToken, outcome),
  };
}

export async function dispatchWebhookAfterSettlement(db: Database, deliveryId: string | null) {
  if (!deliveryId) return;
  try {
    await dispatchWebhookDeliveryById(db, deliveryId);
  } catch {
    console.error("Webhook dispatch failed after settlement", { deliveryId });
  }
}
