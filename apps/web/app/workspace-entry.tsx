import { ArbitrumMark, BaseMark, TabMark, UsdcMark } from "@tab/ui";
import Link from "next/link";

import styles from "./workspace-entry.module.css";

type Props = { siteUrl?: string | undefined };

/** Anonymous workspace entry: the motto, the streak, and two doors. */
export function WorkspaceEntry({ siteUrl }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.brandBar}>
        <span className={styles.brand}>
          <TabMark size={22} />
          tab
        </span>
      </header>

      <div className={styles.center}>
        <section aria-labelledby="entry-title" className={styles.hero}>
          <p className={styles.kicker}>One rail. Two payers.</p>
          <h1 className={styles.title} id="entry-title">
            Invisible payments — <em>for you, and for your AI.</em>
          </h1>
          <span aria-hidden="true" className={styles.streak} />
        </section>

        <nav aria-label="Choose a workspace" className={styles.doors}>
          <Link className={styles.door} href="/login">
            <span className={styles.doorKicker}>Merchant workspace</span>
            <span className={styles.doorHead}>Accept USDC from people and agents</span>
            <span className={styles.doorBody}>
              Checkout with &lt;PayButton&gt;, transactions, receipts, go-live.
            </span>
            <span aria-hidden="true" className={styles.doorMarks}>
              <UsdcMark size={18} />
              <BaseMark size={18} />
              <ArbitrumMark size={18} />
            </span>
            <span className={styles.doorCta}>
              Sign in{" "}
              <span aria-hidden="true" className={styles.arrow}>
                →
              </span>
            </span>
          </Link>

          <Link className={styles.door} href="/agents/login">
            <span className={styles.doorKicker}>Agent workspace</span>
            <span className={styles.doorHead}>Put your AI on a spending cap</span>
            <span className={styles.doorBody}>
              x402 auto-pay, per-agent caps, live payment feed, one-tap revoke.
            </span>
            <span aria-hidden="true" className={styles.doorMarks}>
              <UsdcMark size={18} />
              <BaseMark size={18} />
              <ArbitrumMark size={18} />
            </span>
            <span className={styles.doorCta}>
              Sign in{" "}
              <span aria-hidden="true" className={styles.arrow}>
                →
              </span>
            </span>
          </Link>
        </nav>
      </div>

      <footer className={styles.footer}>
        <p className={styles.footerLine}>
          New to Tab?{" "}
          <Link className={styles.footerLink} href="/signup">
            Create a merchant account
          </Link>
          {siteUrl ? (
            <>
              {" "}
              ·{" "}
              <a className={styles.footerLink} href={siteUrl}>
                What is Tab?
              </a>
            </>
          ) : null}
        </p>
        <p className={styles.footerMeta}>Sessions persist · No wallet extension required</p>
      </footer>
    </main>
  );
}
