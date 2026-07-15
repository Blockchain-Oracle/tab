import Link from "next/link";
import { connection } from "next/server";

import type { AuthFlow } from "./auth-copy";
import styles from "./auth-page.module.css";
import { MerchantAuthCard } from "./merchant-auth-card";

function authConfiguration() {
  const publishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY?.trim() ?? "";
  const missing = [
    !publishableKey ? "NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY" : undefined,
    !process.env.MAGIC_SECRET_KEY?.trim() ? "MAGIC_SECRET_KEY" : undefined,
    !process.env.SESSION_SECRET?.trim() ? "SESSION_SECRET" : undefined,
    !process.env.DATABASE_URL?.trim() ? "DATABASE_URL" : undefined,
  ].filter((name): name is string => Boolean(name));

  return {
    configured: missing.length === 0,
    configurationMessage:
      process.env.NODE_ENV === "development"
        ? `[Authentication blocked — set ${missing.join(" and ")}]`
        : "Authentication is temporarily unavailable.",
    publishableKey,
  };
}

export async function MerchantAuthPage({ flow }: { flow: AuthFlow }) {
  await connection();
  const configuration = authConfiguration();

  return (
    <main className={styles.page}>
      <header className={styles.brandBar}>
        <Link aria-label="Tab home" className={styles.brand} href="/">
          <span className={styles.brandTile} aria-hidden="true">
            T
          </span>
          <span>Tab</span>
        </Link>
      </header>
      <div className={styles.authStack}>
        <section className={styles.card}>
          <MerchantAuthCard flow={flow} {...configuration} />
        </section>
        <p className={styles.footer}>One account per merchant · Test mode by default</p>
      </div>
    </main>
  );
}
