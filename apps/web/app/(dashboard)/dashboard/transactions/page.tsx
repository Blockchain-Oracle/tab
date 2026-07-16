import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  getDashboardTransaction,
  listDashboardTransactions,
} from "../../../../lib/payments/dashboard-transactions";
import {
  type DashboardTransactionRawSearch,
  parseDashboardTransactionSearch,
} from "../../../../lib/payments/dashboard-transactions-search";
import styles from "../dashboard-page.module.css";
import { TransactionDetail } from "./transaction-detail";
import { TransactionsEmptyState } from "./transactions-empty-state";
import { TransactionsFilters } from "./transactions-filters";
import { TransactionsPagination } from "./transactions-pagination";
import { TransactionsTable } from "./transactions-table";

export const metadata: Metadata = {
  title: "Transactions · Tab",
};

interface TransactionsPageProps {
  searchParams: Promise<DashboardTransactionRawSearch>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const merchant = await requireCurrentMerchant();
  const search = parseDashboardTransactionSearch(await searchParams);
  const principal = {
    env: merchant.mode,
    merchantId: merchant.merchantId,
  } as const;
  const db = getServerDatabase().db;
  const [page, detail] = await Promise.all([
    listDashboardTransactions(db, principal, search),
    search.detail ? getDashboardTransaction(db, principal, search.detail) : Promise.resolve(null),
  ]);
  const filtered = Boolean(search.status || search.payerType || search.webhookResult);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Transactions</h1>
        <TransactionsFilters search={search} />
      </div>

      {page.rows.length === 0 ? (
        <TransactionsEmptyState filtered={filtered} mode={merchant.mode} />
      ) : (
        <>
          <TransactionsTable rows={page.rows} search={search} />
          <TransactionsPagination
            count={page.rows.length}
            nextCursor={page.nextCursor}
            previousCursor={page.previousCursor}
            search={search}
          />
        </>
      )}
      {detail ? <TransactionDetail row={detail} search={search} /> : null}
    </div>
  );
}
