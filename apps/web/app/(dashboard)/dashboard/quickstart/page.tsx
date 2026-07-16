import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { readQuickstart } from "../../../../lib/dashboard/quickstart";
import { getServerDatabase } from "../../../../lib/db/server";
import styles from "../dashboard-page.module.css";
import { QuickstartList } from "./quickstart-list";

export const metadata: Metadata = {
  title: "Quickstart · Tab",
};

export default async function QuickstartPage() {
  const merchant = await requireCurrentMerchant();
  const state = await readQuickstart(getServerDatabase().db, merchant.merchantId);

  return (
    <div className={styles.page}>
      <section className={styles.narrowContent}>
        <QuickstartList
          appUrl={process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://your-tab-domain.example"}
          state={state}
        />
      </section>
    </div>
  );
}
