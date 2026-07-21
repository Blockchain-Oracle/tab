import { TabMark } from "@tab/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthBrandPanel } from "./auth-brand-panel";
import styles from "./auth-split.module.css";

type Props = {
  brandVariant: "agents" | "merchant";
  children: ReactNode;
  footer: string;
};

/** The Ledger Gate: dark brand canvas left, themed form panel right. */
export function AuthSplitLayout({ brandVariant, children, footer }: Props) {
  const home = brandVariant === "agents" ? "/agents" : "/";
  return (
    <main className={styles.split}>
      <section aria-hidden="true" className={styles.brandPanel}>
        <Link aria-label="Tab home" className={styles.brandHome} href={home}>
          <TabMark size={20} />
          <span className={styles.brandName}>tab</span>
          {brandVariant === "agents" ? <span className={styles.brandScope}>agents</span> : null}
        </Link>
        <AuthBrandPanel />
        <p className={styles.brandFoot}>402 → 200</p>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCol}>
          <p className={styles.formBrand}>
            <TabMark size={22} />
            <span className={styles.brandName}>tab</span>
          </p>
          <section className={styles.card}>{children}</section>
          <p className={styles.footer}>{footer}</p>
        </div>
      </section>
    </main>
  );
}
