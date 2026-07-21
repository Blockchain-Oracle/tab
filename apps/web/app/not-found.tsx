import Link from "next/link";

import styles from "./error-panel.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section aria-labelledby="not-found-title" className={styles.panel}>
        <p aria-hidden="true" className={styles.mark}>
          404
        </p>
        <h1 className={styles.title} id="not-found-title">
          Page not found
        </h1>
        <p className={styles.detail}>The page you requested does not exist or has moved.</p>
        <div className={styles.actions}>
          <Link className={styles.home} href="/">
            Go to home
          </Link>
        </div>
      </section>
    </main>
  );
}
