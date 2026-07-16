import type { Metadata } from "next";
import Link from "next/link";

import { requireCurrentMerchant } from "../../../../../lib/auth/current-merchant";
import { listDashboardWebhookDeliveries } from "../../../../../lib/dashboard/webhooks-delivery-log";
import { getServerDatabase } from "../../../../../lib/db/server";
import styles from "./deliveries-page.module.css";
import { DeliveryLog } from "./delivery-log";

export const metadata: Metadata = {
  title: "Webhook delivery log · Tab",
};

export default async function WebhookDeliveriesPage() {
  const merchant = await requireCurrentMerchant();
  const deliveries = await listDashboardWebhookDeliveries(getServerDatabase().db, {
    env: merchant.mode,
    merchantId: merchant.merchantId,
  });

  return (
    <div className={styles.page}>
      <header>
        <div className={styles.breadcrumb}>
          <Link href="/dashboard/webhooks">Webhooks</Link>
          <span>›</span>
          <span>Delivery log</span>
        </div>
        <h1>Webhook delivery log</h1>
      </header>
      <DeliveryLog environment={merchant.mode} initialDeliveries={deliveries} />
    </div>
  );
}
