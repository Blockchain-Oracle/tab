import type { Metadata } from "next";

import styles from "../dashboard-page.module.css";

export const metadata: Metadata = {
  title: "Quickstart · Tab",
};

export default function QuickstartPage() {
  return (
    <div className={styles.page}>
      <section className={styles.narrowContent}>
        <header>
          <h1>Quickstart</h1>
          <p className={styles.subtitle}>
            From install to your first settled payment. One action per step.
          </p>
        </header>

        <div className={styles.developmentCard}>
          <div className={styles.developmentIcon} aria-hidden="true">
            &lt;/&gt;
          </div>
          <div>
            <span className={styles.developmentLabel}>DEVELOPMENT STATE</span>
            <h2>Integration workflow not connected yet</h2>
            <p>
              Your merchant account and signed dashboard session are real. Setup progress will
              appear only after the API-key, SDK, webhook, and payment checkpoints have real backing
              services.
            </p>
            <p className={styles.integrityNote}>No completion progress is being inferred.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
