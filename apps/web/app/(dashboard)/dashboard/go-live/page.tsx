import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { readGoLiveReadiness } from "../../../../lib/dashboard/go-live";
import { getServerDatabase } from "../../../../lib/db/server";
import styles from "../dashboard-page.module.css";
import { GoLivePanel } from "./go-live-panel";

export const metadata: Metadata = {
  title: "Go Live · Tab",
};

export default async function GoLivePage() {
  const merchant = await requireCurrentMerchant();
  const readiness = await readGoLiveReadiness(getServerDatabase().db, merchant.merchantId);

  return (
    <div className={styles.page}>
      <GoLivePanel activated={Boolean(merchant.liveActivatedAt)} readiness={readiness} />
    </div>
  );
}
