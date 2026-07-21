import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentOwner } from "../../../lib/auth/current-owner";
import styles from "../../(auth)/auth-page.module.css";
import { LeashAuthCard } from "./leash-auth-card";

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

export async function LeashAuthPage() {
  await connection();
  const owner = await getCurrentOwner();
  if (owner) redirect("/leash");

  return (
    <main className={styles.page}>
      <header className={styles.brandBar}>
        <Link aria-label="Tab home" className={styles.brand} href="/">
          <span className={styles.brandTile} aria-hidden="true">
            T
          </span>
          <span>Tab · Leash</span>
        </Link>
      </header>
      <div className={styles.authStack}>
        <section className={styles.card}>
          <LeashAuthCard {...authConfiguration()} />
        </section>
        <p className={styles.footer}>One owner session · No wallet extension required</p>
      </div>
    </main>
  );
}
