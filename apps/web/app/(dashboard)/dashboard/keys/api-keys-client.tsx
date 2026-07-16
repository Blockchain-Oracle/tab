"use client";

import { useState } from "react";

import type { ApiEnvironment, ApiKeyPermissions } from "../../../../lib/auth/api-key";
import type { DashboardApiKey } from "../../../../lib/dashboard/api-keys";
import {
  ApiKeysTable,
  CreateKeyDialog,
  DeleteConfirmDialog,
  RotationConfirmDialog,
  SecretRevealDialog,
} from "./api-key-components";
import styles from "./api-keys.module.css";

interface ApiKeysClientProps {
  initialKeys: DashboardApiKey[];
  mode: ApiEnvironment;
}

interface RevealState {
  keyName: string;
  permissions: ApiKeyPermissions;
  secret: string;
}

interface KeyResponse {
  key: DashboardApiKey;
  secret: string;
}

function hydrateKey(key: DashboardApiKey) {
  return {
    ...key,
    createdAt: new Date(key.createdAt),
    lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
  };
}

async function responseBody(response: Response) {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { message?: string } }
    | undefined;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? "The API key operation failed. Try again.");
  }
  return body;
}

export function ApiKeysClient(props: ApiKeysClientProps) {
  return <EnvironmentApiKeysClient key={props.mode} {...props} />;
}

function EnvironmentApiKeysClient({ initialKeys, mode }: ApiKeysClientProps) {
  const [keys, setKeys] = useState(() => initialKeys.map(hydrateKey));
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createPermissions, setCreatePermissions] = useState<ApiKeyPermissions>("full");
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [rotateTarget, setRotateTarget] = useState<DashboardApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardApiKey | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const environmentQuery = `?env=${mode}`;

  function openCreate() {
    setCreateError(null);
    setCreateName("");
    setCreatePermissions("full");
    setCreateOpen(true);
  }

  async function createKey() {
    setCreateError(null);
    setBusyKeyId("create");
    try {
      const response = await fetch(`/api/keys${environmentQuery}`, {
        body: JSON.stringify({ name: createName, permissions: createPermissions }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await responseBody(response)) as KeyResponse;
      const key = hydrateKey(body.key);
      setKeys((current) => [key, ...current]);
      setCreateOpen(false);
      setReveal({ keyName: key.name, permissions: createPermissions, secret: body.secret });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create key. Try again.");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function rotateKey() {
    if (!rotateTarget?.permissions) return;
    setPageError(null);
    setBusyKeyId(rotateTarget.id);
    try {
      const response = await fetch(
        `/api/keys/${rotateTarget.id}/rotate/confirm${environmentQuery}`,
        {
          body: JSON.stringify({ confirm: true }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await responseBody(response)) as KeyResponse;
      const key = hydrateKey(body.key);
      setKeys((current) => [key, ...current.filter((row) => row.id !== rotateTarget.id)]);
      setRotateTarget(null);
      setReveal({ keyName: key.name, permissions: rotateTarget.permissions, secret: body.secret });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to rotate key. Try again.");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function deleteKey() {
    if (!deleteTarget) return;
    setPageError(null);
    setBusyKeyId(deleteTarget.id);
    try {
      const response = await fetch(`/api/keys/${deleteTarget.id}${environmentQuery}`, {
        method: "DELETE",
      });
      await responseBody(response);
      setKeys((current) => current.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to delete key. Try again.");
    } finally {
      setBusyKeyId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>API keys</h1>
          <p>Publishable keys can be used in browser code. Secret keys stay on your server.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={mode === "test" ? styles.testBadge : styles.liveBadge}>{mode}</span>
          <button className={styles.createButton} onClick={openCreate} type="button">
            Create key
          </button>
        </div>
      </header>

      {pageError ? (
        <p className={styles.pageError} role="alert">
          {pageError}
        </p>
      ) : null}
      <ApiKeysTable
        busyKeyId={busyKeyId}
        keys={keys}
        onDelete={setDeleteTarget}
        onRotate={setRotateTarget}
      />

      {createOpen ? (
        <CreateKeyDialog
          error={createError}
          isSubmitting={busyKeyId === "create"}
          name={createName}
          onClose={() => setCreateOpen(false)}
          onNameChange={setCreateName}
          onPermissionChange={setCreatePermissions}
          onSubmit={createKey}
          permissions={createPermissions}
        />
      ) : null}
      {rotateTarget ? (
        <RotationConfirmDialog
          isSubmitting={busyKeyId === rotateTarget.id}
          keyName={rotateTarget.name}
          onClose={() => setRotateTarget(null)}
          onConfirm={rotateKey}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteConfirmDialog
          isSubmitting={busyKeyId === deleteTarget.id}
          keyName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={deleteKey}
        />
      ) : null}
      {reveal ? (
        <SecretRevealDialog
          keyName={reveal.keyName}
          onClose={() => setReveal(null)}
          permissions={reveal.permissions}
          secret={reveal.secret}
        />
      ) : null}
    </div>
  );
}
