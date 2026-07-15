import styles from "./settings-page.module.css";

export default function SettingsLoading() {
  return (
    <div className={styles.page}>
      <h1>Settings</h1>
      <div aria-label="Loading merchant settings" className={styles.loadingCard} role="status">
        <span className={styles.loadingLabel} />
        <span className={styles.loadingField} />
        <span className={styles.loadingShortField} />
        <span className={styles.loadingField} />
        <span className={styles.loadingButton} />
      </div>
    </div>
  );
}
