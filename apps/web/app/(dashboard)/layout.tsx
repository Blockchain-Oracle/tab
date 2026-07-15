import type { ReactNode } from "react";

import { requireCurrentMerchant } from "../../lib/auth/current-merchant";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const merchant = await requireCurrentMerchant();

  return (
    <DashboardShell
      businessName={merchant.businessName}
      email={merchant.email}
      liveActivated={Boolean(merchant.liveActivatedAt)}
      mode={merchant.mode}
      publishableKey={process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY?.trim() ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
