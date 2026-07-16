"use client";

import type { DashboardApiKey } from "../../../../lib/dashboard/api-keys";
import styles from "./api-key-table.module.css";

interface ApiKeysTableProps {
  busyKeyId: string | null;
  keys: DashboardApiKey[];
  onDelete: (key: DashboardApiKey) => void;
  onRotate: (key: DashboardApiKey) => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

function permissionLabel(key: DashboardApiKey) {
  if (key.permissions === "full") return "Full access";
  if (key.permissions === "read_only") return "Read-only — list and read payments";
  return "—";
}

function timestamp(value: Date | null) {
  if (!value) return <span>Never</span>;
  const iso = value.toISOString();
  return (
    <time dateTime={iso} title={iso}>
      {dateFormatter.format(value)}
    </time>
  );
}

export function ApiKeysTable({ busyKeyId, keys, onDelete, onRotate }: ApiKeysTableProps) {
  if (keys.length === 0) {
    return (
      <section className={styles.emptyCard}>
        <div className={styles.keyIcon} aria-hidden="true">
          <span />
        </div>
        <h2>No API keys</h2>
        <p>Create your first secret key to start integrating.</p>
      </section>
    );
  }

  return (
    <section className={styles.tableCard} aria-label="API keys for the selected mode">
      <div className={styles.scrollArea}>
        <table className={styles.table}>
          <caption>Active API keys for the selected account mode</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Token</th>
              <th scope="col">Type</th>
              <th scope="col">Permissions</th>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
              <th aria-label="Actions" scope="col" />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const busy = busyKeyId === key.id;
              return (
                <tr key={key.id}>
                  <td className={styles.nameCell}>{key.name}</td>
                  <td className={styles.tokenCell}>
                    {key.prefix}••••••••{key.last4}
                  </td>
                  <td>{key.type === "secret" ? "Secret" : "Publishable"}</td>
                  <td>{permissionLabel(key)}</td>
                  <td>{timestamp(key.createdAt)}</td>
                  <td>{timestamp(key.lastUsedAt)}</td>
                  <td>
                    {key.type === "secret" ? (
                      <div className={styles.rowActions}>
                        <button disabled={busy} onClick={() => onRotate(key)} type="button">
                          Rotate
                        </button>
                        <button
                          className={styles.dangerAction}
                          disabled={busy}
                          onClick={() => onDelete(key)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className={styles.tableFooter}>
        Secret keys can’t be revealed after creation — rotate to replace one.
      </footer>
    </section>
  );
}
