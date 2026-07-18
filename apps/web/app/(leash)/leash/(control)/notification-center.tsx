"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatUsdAtomic } from "../../../../lib/leash/leash-format";
import type {
  NotificationItemView,
  NotificationResultView,
} from "../../../../lib/leash/notification-view";
import { TEST_FUNDS_LABEL } from "../../../../lib/leash/test-funds";
import styles from "./notification-center.module.css";
import {
  loadAndCommitNotificationFilters,
  loadNotificationResult,
  markNotificationsRead,
  type NotificationFilters,
} from "./notification-center-actions";

type TierFilter = NotificationFilters["tier"];
type ReadFilter = NotificationFilters["read"];
type ResolutionFilter = NotificationFilters["resolution"];

const copy = {
  cap_75: ["Cap is 75% used", "Current-cycle committed spend crossed the alert threshold."],
  cap_blocked: ["Payment blocked at the cap", "The attempt was stopped before signing."],
  cap_lowered_halt: [
    "Cap lowered below current spend",
    "Payments remain halted until remediation.",
  ],
  float_empty: ["Agent float is empty", "The payment could not proceed on its requested network."],
  float_low: ["Agent float is low", "The available native USDC float needs attention."],
  unusual_domain: [
    "First payment to a new destination",
    "Review this destination if you do not recognize it.",
  ],
} as const;

function stringMetadata(item: NotificationItemView, key: string) {
  const value = item.metadata[key];
  return typeof value === "string" ? value : undefined;
}

function detail(item: NotificationItemView) {
  if (item.type === "float_empty" && item.metadata.testFundsLabel === TEST_FUNDS_LABEL) {
    return `${copy[item.type][1]} ${TEST_FUNDS_LABEL}.`;
  }
  if (item.type === "cap_blocked") {
    const attempted = stringMetadata(item, "attemptedAtomic");
    return attempted
      ? `A ${formatUsdAtomic(attempted)} payment was blocked before signing.`
      : copy[item.type][1];
  }
  if (item.type === "unusual_domain") {
    const resourceUrl = stringMetadata(item, "resourceUrl");
    const destination = resourceUrl?.startsWith("mcp:") ? resourceUrl : item.resourceHost;
    return destination ? `First recorded payment attempt to ${destination}.` : copy[item.type][1];
  }
  return copy[item.type][1];
}

export function NotificationCenter({
  agentId,
  initialResult,
}: {
  agentId: string;
  initialResult: NotificationResultView;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [read, setRead] = useState<ReadFilter>("all");
  const [resolution, setResolution] = useState<ResolutionFilter>("all");
  const [result, setResult] = useState(initialResult);
  const [tier, setTier] = useState<TierFilter>("all");

  async function applyFilters(next: NotificationFilters) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await loadAndCommitNotificationFilters({
        commit: (filters, nextResult) => {
          setRead(filters.read);
          setResolution(filters.resolution);
          setResult(nextResult);
          setTier(filters.tier);
        },
        filters: next,
        load: (filters) => loadNotificationResult({ agentId, filters }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(notificationId?: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const nextResult = await markNotificationsRead({
        agentId,
        filters: { read, resolution, tier },
        notificationId,
        onServerStateChanged: router.refresh,
      });
      setResult(nextResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The notification state was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder() {
    if (busy || !result.nextCursor) return;
    setBusy(true);
    setError(undefined);
    try {
      const older = await loadNotificationResult({
        agentId,
        cursor: result.nextCursor,
        filters: { read, resolution, tier },
      });
      setResult((current) => ({
        ...older,
        notifications: [...current.notifications, ...older.notifications],
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>WATCHED EVENTS</p>
          <h1>Notifications</h1>
          <span className={styles.headerSubtitle}>
            Tier 2 alerts inform. Tier 3 events require a real owner action.
          </span>
        </div>
        <div className={styles.headerActions}>
          <b>{result.unreadCount} unread</b>
          <button
            disabled={busy || result.unreadCount === 0}
            onClick={() => void markRead()}
            type="button"
          >
            Mark all read
          </button>
        </div>
      </header>

      <section aria-label="Notification filters" className={styles.filters}>
        <div>
          {(["all", "2", "3"] as const).map((value) => (
            <button
              aria-pressed={tier === value}
              disabled={busy}
              key={value}
              onClick={() => void applyFilters({ read, resolution, tier: value })}
              type="button"
            >
              {value === "all" ? "All" : value === "2" ? "Alerts" : "Action required"}
            </button>
          ))}
        </div>
        <label>
          <span>Read state</span>
          <select
            disabled={busy}
            onChange={(event) =>
              void applyFilters({ read: event.target.value as ReadFilter, resolution, tier })
            }
            value={read}
          >
            <option value="all">Read &amp; unread</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </label>
        <label>
          <span>Resolution</span>
          <select
            disabled={busy}
            onChange={(event) =>
              void applyFilters({ read, resolution: event.target.value as ResolutionFilter, tier })
            }
            value={resolution}
          >
            <option value="all">Active &amp; resolved</option>
            <option value="active">Active only</option>
            <option value="resolved">Resolved only</option>
          </select>
        </label>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {result.notifications.length === 0 ? (
        <section className={styles.empty}>
          <h2>No notifications match this view</h2>
          <p>Real cap, destination, and float events appear here when they occur.</p>
        </section>
      ) : (
        <ol className={styles.list}>
          {result.notifications.map((item) => (
            <li
              className={item.sticky && !item.resolvedAt ? styles.stickyItem : styles.item}
              key={item.id}
            >
              <div className={styles.itemTopline}>
                <span className={item.tier === "3" ? styles.tier3 : styles.tier2}>
                  {item.tier === "3" ? "Action required" : "Alert"}
                </span>
                {!item.readAt ? <i>Unread</i> : null}
                {item.resolvedAt ? <i className={styles.resolved}>Resolved</i> : null}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                </time>
              </div>
              <h2>{copy[item.type][0]}</h2>
              <p>{detail(item)}</p>
              <div className={styles.itemActions}>
                {item.cta ? <Link href={item.cta.href}>{item.cta.label}</Link> : null}
                {!item.readAt ? (
                  <button disabled={busy} onClick={() => void markRead(item.id)} type="button">
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {result.nextCursor ? (
        <div className={styles.loadMore}>
          <button disabled={busy} onClick={() => void loadOlder()} type="button">
            {busy ? "Loading…" : "Load older"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
