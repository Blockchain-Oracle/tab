import Link from "next/link";

import styles from "./overview-notifications.module.css";

export type NotificationPreview = {
  createdAt: Date;
  id: string;
  metadata: Record<string, unknown>;
  resourceHost: string | null;
  tier: "2" | "3";
  type: string;
};

function notificationTitle(type: string) {
  const titles: Record<string, string> = {
    cap_75: "Cap is 75% used",
    cap_blocked: "Payment blocked at cap",
    cap_lowered_halt: "Cap lowered below current spend",
    float_empty: "Agent float is empty",
    float_low: "Agent float is low",
    unusual_domain: "First payment to a new destination",
  };
  return titles[type] ?? "Leash notification";
}

function notificationDestination(notification: NotificationPreview) {
  const resourceUrl = notification.metadata.resourceUrl;
  if (typeof resourceUrl === "string" && resourceUrl.startsWith("mcp:")) return resourceUrl;
  return notification.resourceHost ?? "Cap policy event";
}

export function OverviewNotifications({
  agentId,
  notifications,
  unreadCount,
}: {
  agentId: string;
  notifications: NotificationPreview[];
  unreadCount: number;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span>Notifications</span>
          <b>{unreadCount} unread</b>
        </div>
        <Link href={`/leash/notifications?agentId=${encodeURIComponent(agentId)}`}>View all →</Link>
      </div>
      {notifications.length === 0 ? (
        <p className={styles.empty}>No real alert or action-required event has fired.</p>
      ) : (
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id}>
              <span className={notification.tier === "3" ? styles.tier3 : styles.tier2}>
                {notification.tier === "3" ? "ACTION REQUIRED" : "ALERT"}
              </span>
              <div>
                <strong>{notificationTitle(notification.type)}</strong>
                <p>{notificationDestination(notification)}</p>
              </div>
              <time dateTime={notification.createdAt.toISOString()}>
                {notification.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
