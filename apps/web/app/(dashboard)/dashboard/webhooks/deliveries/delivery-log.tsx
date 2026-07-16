"use client";

import { useState } from "react";

import type { ApiEnvironment } from "../../../../../lib/auth/api-key";
import type { DashboardWebhookDelivery } from "../../../../../lib/dashboard/webhooks-delivery-log";
import {
  compactEvidence,
  deliveryCode,
  deliverySubject,
  deliveryTone,
  mayResend,
} from "../webhooks-view";
import styles from "./deliveries-page.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

interface DeliveryLogProps {
  environment: ApiEnvironment;
  initialDeliveries: DashboardWebhookDelivery[];
}

function dateValue(value: unknown, nullable: false): Date;
function dateValue(value: unknown, nullable: true): Date | null;
function dateValue(value: unknown, nullable: boolean) {
  if (nullable && value === null) return null;
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) {
    throw new Error("The delivery response contained an invalid timestamp.");
  }
  return date;
}

function hydrateDelivery(value: unknown): DashboardWebhookDelivery {
  if (!value || typeof value !== "object") {
    throw new Error("The delivery response was invalid.");
  }
  const delivery = value as DashboardWebhookDelivery;
  return {
    ...delivery,
    completedAt: dateValue(delivery.completedAt, true),
    createdAt: dateValue(delivery.createdAt, false),
    nextRetryAt: dateValue(delivery.nextRetryAt, true),
    startedAt: dateValue(delivery.startedAt, true),
  };
}

export function DeliveryLog(props: DeliveryLogProps) {
  return <EnvironmentDeliveryLog key={props.environment} {...props} />;
}

function EnvironmentDeliveryLog({ initialDeliveries }: DeliveryLogProps) {
  const [deliveries, setDeliveries] = useState(() => initialDeliveries.map(hydrateDelivery));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend(id: string) {
    setResending(id);
    setError(null);
    try {
      const response = await fetch(`/api/webhook-deliveries/${id}/resend`, { method: "POST" });
      const payload = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Resend failed.");
      const delivery = hydrateDelivery(payload?.delivery);
      setDeliveries((current) => [delivery, ...current]);
      setExpanded(delivery.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Resend failed.");
    } finally {
      setResending(null);
    }
  }

  if (deliveries.length === 0) {
    return (
      <section className={styles.empty}>
        <span aria-hidden="true">⌁</span>
        <h2>No webhook deliveries yet</h2>
        <p>Successful tests and settlement delivery attempts will appear here.</p>
      </section>
    );
  }

  return (
    <section className={styles.log} aria-label="Webhook delivery attempts">
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.heading}>
        <span>Status</span>
        <span>Result</span>
        <span>Event</span>
        <span>Attempt</span>
        <span>When</span>
      </div>
      {deliveries.map((delivery) => {
        const state = deliveryTone(delivery);
        const isExpanded = expanded === delivery.id;
        return (
          <div className={styles.delivery} key={delivery.id}>
            <button
              aria-expanded={isExpanded}
              className={styles.row}
              onClick={() => setExpanded(isExpanded ? null : delivery.id)}
              type="button"
            >
              <code>{deliveryCode(delivery)}</code>
              <span className={styles[state.tone]}>{state.label}</span>
              <code title={deliverySubject(delivery)}>
                {compactEvidence(deliverySubject(delivery))}
              </code>
              <span>
                Attempt {delivery.attempt} of 3{delivery.trigger === "manual" ? " · manual" : ""}
              </span>
              <time dateTime={delivery.createdAt.toISOString()}>
                {dateFormatter.format(delivery.createdAt)}
              </time>
            </button>
            {isExpanded ? (
              <div className={styles.evidence}>
                <div>
                  <h3>Request payload</h3>
                  <pre>{prettyJson(delivery.request.body)}</pre>
                </div>
                <div className={styles.responseEvidence}>
                  <div>
                    <h3>
                      Response body <small>(first 500 characters)</small>
                    </h3>
                    <pre>{delivery.response.bodySnippet ?? "No response body recorded."}</pre>
                  </div>
                  <div>
                    <h3>Request headers</h3>
                    <pre>{`Content-Type: application/json\nX-Tab-Signature: ${delivery.request.signature ?? "Not signed"}`}</pre>
                  </div>
                  <footer>
                    <span>
                      Response time: <code>{delivery.response.timeMs ?? "—"}ms</code>
                    </span>
                    <button
                      disabled={!mayResend(delivery.result) || resending !== null}
                      onClick={() => void resend(delivery.id)}
                      type="button"
                    >
                      {resending === delivery.id ? "Resending…" : "Resend delivery"}
                    </button>
                  </footer>
                  {delivery.parentDeliveryId ? (
                    <small>Manual resend of delivery {delivery.parentDeliveryId}</small>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <footer className={styles.footer}>
        {deliveries.length} {deliveries.length === 1 ? "attempt" : "attempts"} · immutable delivery
        ledger
      </footer>
    </section>
  );
}
