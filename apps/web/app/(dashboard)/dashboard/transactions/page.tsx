import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { getServerDatabase } from "../../../../lib/db/server";
import { listDashboardTransactions } from "../../../../lib/payments/dashboard-transactions";
import styles from "../dashboard-page.module.css";
import { TransactionsEmptyState } from "./transactions-empty-state";
import { TransactionsTable } from "./transactions-table";

export const metadata: Metadata = {
  title: "Transactions · Tab",
};

export default async function TransactionsPage() {
  const merchant = await requireCurrentMerchant();
  const page = await listDashboardTransactions(getServerDatabase().db, {
    env: merchant.mode,
    merchantId: merchant.merchantId,
  });

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Transactions</h1>
      </div>

      {page.rows.length === 0 ? (
        <TransactionsEmptyState mode={merchant.mode} />
      ) : (
        <TransactionsTable hasMore={page.hasMore} rows={page.rows} />
      )}
    </div>
  );
}
