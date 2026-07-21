import styles from "./loading.module.css";

export default function LeashControlLoading() {
  return (
    <main
      aria-busy="true"
      role="status"
      aria-label="Loading Agent control data"
      className={styles.page}
    >
      <div className={styles.heading} />
      <div className={styles.banner} />
      <div className={styles.wideCard} />
      <section className={styles.cards}>
        <div />
        <div />
        <div />
        <div />
      </section>
      <span className={styles.srOnly}>Loading live Agent data…</span>
    </main>
  );
}
