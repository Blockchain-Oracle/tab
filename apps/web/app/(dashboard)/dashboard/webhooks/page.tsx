import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { listDashboardWebhookDeliveries } from "../../../../lib/dashboard/webhooks-delivery-log";
import { readWebhookEndpoint } from "../../../../lib/dashboard/webhooks-endpoints";
import { getServerDatabase } from "../../../../lib/db/server";
import styles from "./webhooks-page.module.css";
import { WebhooksPanel } from "./webhooks-panel";

export const metadata: Metadata = {
  title: "Webhooks · Tab",
};

export default async function WebhooksPage() {
  const merchant = await requireCurrentMerchant();
  const principal = { env: merchant.mode, merchantId: merchant.merchantId } as const;
  const [endpoint, deliveries] = await Promise.all([
    readWebhookEndpoint(getServerDatabase().db, principal),
    listDashboardWebhookDeliveries(getServerDatabase().db, principal),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Webhooks</h1>
        <p>
          Your canonical fulfillment signal. Every verified settlement is signed with{" "}
          <code>X-Tab-Signature</code> and POSTed to your endpoint.
        </p>
      </header>
      <WebhooksPanel
        environment={merchant.mode}
        initialEndpoint={endpoint}
        recentDeliveries={deliveries.slice(0, 4)}
      />
    </div>
  );
}
