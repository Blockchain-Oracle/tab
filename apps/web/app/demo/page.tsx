export const metadata = { title: "Test storefront" };

import { TabMark } from "@tab/ui";
import Image from "next/image";
import Link from "next/link";

import { requireCurrentMerchant } from "../../lib/auth/current-merchant";
import { getServerDatabase } from "../../lib/db/server";
import { DEMO_TEST_AMOUNT_USD, DEMO_TEST_ITEM_NAME } from "../../lib/demo/config";
import { readMerchantDemo } from "../../lib/demo/merchant-demo";
import styles from "./demo.module.css";
import { DemoCheckout } from "./demo-checkout";

export default async function DemoPage() {
  const principal = await requireCurrentMerchant();
  const merchant = await readMerchantDemo(getServerDatabase().db, principal.merchantId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/dashboard/quickstart">
          <TabMark size={18} />
          <span className={styles.brandWord}>tab</span>
          <span className={styles.brandNote}>test storefront</span>
        </Link>
        <Link href="/dashboard/transactions">Back to dashboard</Link>
      </header>

      <section className={styles.storefront}>
        <div className={styles.merchant}>
          {merchant.logoUrl ? (
            <Image alt="" height={40} src={merchant.logoUrl} width={40} />
          ) : (
            <span aria-hidden="true">{merchant.businessName?.trim().charAt(0) || "T"}</span>
          )}
          <div>
            <small>MERCHANT TEST PAGE</small>
            <h1>{merchant.businessName?.trim() || "Your store"}</h1>
          </div>
        </div>

        <div className={styles.product}>
          <div className={styles.productVisual} aria-hidden="true">
            <span>TESTNET</span>
          </div>
          <div className={styles.productDetails}>
            <span className={styles.testBadge}>TEST PAYMENT</span>
            <h2>{DEMO_TEST_ITEM_NAME}</h2>
            <p>
              This page uses your account, publishable key, signed intent, checkout component, and
              webhook configuration. Test payments are simulated and do not move real funds.
            </p>
            <div className={styles.price}>${Number(DEMO_TEST_AMOUNT_USD).toFixed(2)}</div>
            <DemoCheckout apiBaseUrl={appUrl} publishableKey={merchant.publishableKey} />
            <code>wired via onSuccess(transactionId, tokenChanges)</code>
          </div>
        </div>
      </section>
    </main>
  );
}
