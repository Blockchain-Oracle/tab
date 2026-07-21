import type { ReactNode } from "react";

import { requireCurrentMerchant } from "../../lib/auth/current-merchant";
import { getServerDatabase } from "../../lib/db/server";
import { countFailedWebhookDeliveries } from "../../lib/webhooks/failed-count";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const merchant = await requireCurrentMerchant();
  const webhookAlerts = await countFailedWebhookDeliveries(
    getServerDatabase().db,
    merchant.merchantId,
    merchant.mode,
  );

  return (
    <DashboardShell
      businessName={merchant.businessName}
      email={merchant.email}
      liveActivated={Boolean(merchant.liveActivatedAt)}
      mode={merchant.mode}
      webhookAlerts={webhookAlerts}
    >
      {children}
    </DashboardShell>
  );
}
