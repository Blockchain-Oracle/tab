"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import type { ApiEnvironment } from "../../../../lib/auth/api-key";
import type { DashboardWebhookDelivery } from "../../../../lib/dashboard/webhooks-delivery-log";
import type { WebhookEndpointView } from "../../../../lib/dashboard/webhooks-endpoints";
import { RecentDeliveries } from "./recent-deliveries";
import { SecretRevealDialog } from "./secret-reveal-dialog";
import dialogStyles from "./webhook-dialog.module.css";
import { webhookHealthView } from "./webhook-health";
import { WebhookVerificationGuide } from "./webhook-verification-guide";
import styles from "./webhooks-page.module.css";

type Props = {
  environment: ApiEnvironment;
  initialEndpoint: WebhookEndpointView | null;
  recentDeliveries: DashboardWebhookDelivery[];
};

type Notice = { kind: "error" | "success"; text: string } | null;

async function jsonMutation(path: string, method: "PATCH" | "POST", body?: unknown) {
  const response = await fetch(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
    method,
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(payload?.error?.message ?? "The request failed.");
  return payload;
}

export function WebhooksPanel(props: Props) {
  return <EnvironmentWebhooksPanel key={props.environment} {...props} />;
}

function EnvironmentWebhooksPanel({ initialEndpoint, recentDeliveries }: Props) {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [url, setUrl] = useState(initialEndpoint?.url ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const health = endpoint ? webhookHealthView(endpoint.health) : null;

  useEffect(() => {
    setEndpoint(initialEndpoint);
    if (!editing) setUrl(initialEndpoint?.url ?? "");
  }, [editing, initialEndpoint]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setNotice(null);
    try {
      const payload = await jsonMutation("/api/webhook-endpoint", endpoint ? "PATCH" : "POST", {
        url,
      });
      setEndpoint(payload.endpoint);
      setEditing(false);
      if (payload.secret) setSecret(payload.secret);
      setNotice({ kind: "success", text: "Webhook URL saved." });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save the webhook URL.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setNotice(null);
    try {
      const payload = await jsonMutation("/api/webhook-endpoint/test", "POST");
      setEndpoint(payload.endpoint);
      const delivered = payload.delivery.result === "delivered";
      setNotice({
        kind: delivered ? "success" : "error",
        text: delivered
          ? `Test webhook delivered (${payload.delivery.statusCode}).`
          : "Test webhook was recorded but the endpoint did not return 2xx.",
      });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Test failed." });
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regenerate");
    setNotice(null);
    try {
      const payload = await jsonMutation("/api/webhook-endpoint/regenerate", "POST");
      setEndpoint(payload.endpoint);
      setSecret(payload.secret);
      setNotice({ kind: "success", text: "Signing secret regenerated." });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not regenerate the secret.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setNotice(null);
    try {
      const response = await fetch("/api/webhook-endpoint", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the webhook endpoint.");
      setEndpoint(null);
      setUrl("");
      setConfirmDelete(false);
      setNotice({ kind: "success", text: "Webhook removed." });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Delete failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.content}>
      {notice ? (
        <p className={notice.kind === "success" ? styles.successNotice : styles.errorNotice}>
          {notice.text}
        </p>
      ) : null}

      <section className={styles.card} aria-busy={busy !== null}>
        {!endpoint ? (
          <form onSubmit={save}>
            <h2>Add a webhook URL to receive payment confirmations.</h2>
            <p>HTTPS only. We’ll generate your signing secret when you save.</p>
            <div className={styles.urlRow}>
              <input
                aria-label="Webhook URL"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-server.com/webhooks/tab"
                required
                type="url"
                value={url}
              />
              <button className={styles.primaryButton} disabled={busy !== null} type="submit">
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className={styles.cardHeading}>
              <h2>Endpoint</h2>
              <div className={styles.actions}>
                <button disabled={busy !== null} onClick={() => void sendTest()} type="button">
                  {busy === "test" ? "Sending…" : "Send test webhook"}
                </button>
                <button disabled={busy !== null} onClick={() => setEditing(true)} type="button">
                  Edit
                </button>
                <button
                  className={styles.dangerButton}
                  disabled={busy !== null}
                  onClick={() => setConfirmDelete(true)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>

            {editing ? (
              <form className={styles.urlRow} onSubmit={save}>
                <input
                  aria-label="Webhook URL"
                  onChange={(event) => setUrl(event.target.value)}
                  required
                  type="url"
                  value={url}
                />
                <button className={styles.primaryButton} disabled={busy !== null} type="submit">
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => {
                    setEditing(false);
                    setUrl(endpoint.url);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className={styles.endpointField}>
                <code>{endpoint.url}</code>
                <span className={health ? styles[health.className] : styles.awaiting}>
                  <i aria-hidden="true" />
                  {health?.label ?? "Awaiting a successful delivery"}
                </span>
              </div>
            )}

            <div className={styles.secretRow}>
              <div>
                <h2>Signing secret</h2>
                <p>
                  <code>whsec_••••••••{endpoint.secretLast4}</code>
                  <span>HMAC-SHA256 · shown once</span>
                </p>
              </div>
              <button disabled={busy !== null} onClick={() => void regenerate()} type="button">
                {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </>
        )}
        <p className={styles.retryNote}>
          Failed deliveries make exactly 3 total attempts: immediately, after 1 minute, then after 4
          minutes.
        </p>
      </section>

      <WebhookVerificationGuide />

      {endpoint ? (
        <section className={styles.recentCard}>
          <header>
            <h2>Recent deliveries</h2>
            <Link href="/dashboard/webhooks/deliveries">View full log</Link>
          </header>
          <RecentDeliveries deliveries={recentDeliveries} />
        </section>
      ) : null}

      {secret ? <SecretRevealDialog onClose={() => setSecret(null)} secret={secret} /> : null}
      {confirmDelete ? (
        <div className={dialogStyles.overlay} role="presentation">
          <div aria-modal="true" className={dialogStyles.dialog} role="dialog">
            <h2>Remove this webhook URL?</h2>
            <p>
              Tab will stop delivering notifications until you add a new endpoint. The signing
              secret will be discarded.
            </p>
            <div className={dialogStyles.dialogActions}>
              <button onClick={() => setConfirmDelete(false)} type="button">
                Cancel
              </button>
              <button
                className={dialogStyles.removeButton}
                onClick={() => void remove()}
                type="button"
              >
                {busy === "delete" ? "Removing…" : "Remove webhook"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
