import type { DashboardWebhookDelivery } from "../../../../lib/dashboard/webhooks-delivery-log";
import styles from "./recent-deliveries.module.css";
import { compactEvidence, deliveryCode, deliverySubject, deliveryTone } from "./webhooks-view";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function RecentDeliveries({ deliveries }: { deliveries: DashboardWebhookDelivery[] }) {
  if (deliveries.length === 0) {
    return <p className={styles.noDeliveries}>No deliveries recorded in this environment yet.</p>;
  }

  return (
    <div className={styles.recentRows}>
      {deliveries.map((delivery) => {
        const state = deliveryTone(delivery);
        return (
          <div className={styles.recentRow} key={delivery.id}>
            <code>{deliveryCode(delivery)}</code>
            <span className={styles[state.tone]}>{state.label}</span>
            <code title={deliverySubject(delivery)}>
              {compactEvidence(deliverySubject(delivery))}
            </code>
            <span>
              Attempt {delivery.attempt} of 3
              {delivery.response.timeMs === null ? "" : ` · ${delivery.response.timeMs}ms`}
            </span>
            <time dateTime={delivery.createdAt.toISOString()}>
              {dateFormatter.format(delivery.createdAt)}
            </time>
          </div>
        );
      })}
    </div>
  );
}
