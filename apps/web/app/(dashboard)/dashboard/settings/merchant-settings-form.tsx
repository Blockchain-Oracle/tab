"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { LogoUploader } from "./logo-uploader";
import {
  type MerchantSettingsSnapshot,
  normalizeMerchantSettings,
  readAuthoritativeMerchantSettings,
} from "./merchant-settings-client";
import { ReceivingAddressDialog } from "./receiving-address-dialog";
import { ReceivingAddressField } from "./receiving-address-field";
import styles from "./settings-form.module.css";

type MerchantSettingsFormProps = {
  businessName: string;
  email: string;
  logoEtag: string | null;
  logoPathPrefix: string;
  logoUploadEnabled: boolean;
  logoUrl: string | null;
  receivingAddress: string;
  receivingAddressSource: "custom" | "magic_default";
};

type SavedSettings = Omit<MerchantSettingsSnapshot, "logoEtag" | "logoUrl">;
type Status = "error" | "idle" | "reconciled" | "saved" | "saving" | "uncertain";

export function MerchantSettingsForm(props: MerchantSettingsFormProps) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(props.businessName);
  const [receivingAddress, setReceivingAddress] = useState(props.receivingAddress);
  const [saved, setSaved] = useState<SavedSettings>(props);
  const [confirmAddress, setConfirmAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const normalizedBusinessName = businessName.trim();
  const addressChanged = receivingAddress.toLowerCase() !== saved.receivingAddress.toLowerCase();
  const dirty = normalizedBusinessName !== saved.businessName || addressChanged;
  const initial = (normalizedBusinessName || props.email).charAt(0).toUpperCase();

  function changeBusinessName(value: string) {
    setBusinessName(value);
    setStatus("idle");
  }

  function changeReceivingAddress(value: string) {
    setReceivingAddress(value);
    setStatus("idle");
  }

  function applySettings(nextSettings: SavedSettings) {
    setBusinessName(nextSettings.businessName);
    setReceivingAddress(nextSettings.receivingAddress);
    setSaved(nextSettings);
    setEditingAddress(false);
  }

  async function reconcileSettings(attemptedName: string, attemptedAddress: string) {
    const authoritative = await readAuthoritativeMerchantSettings();
    if (!authoritative) {
      setStatus("uncertain");
      return;
    }

    applySettings(authoritative);
    const applied =
      authoritative.businessName === attemptedName &&
      authoritative.receivingAddress.toLowerCase() === attemptedAddress.toLowerCase();
    setStatus(applied ? "saved" : "reconciled");
    router.refresh();
  }

  async function persist(confirmReceivingAddressChange: boolean) {
    setConfirmAddress(false);
    setStatus("saving");
    const attemptedName = businessName.trim();
    const attemptedAddress = receivingAddress.trim();

    try {
      const response = await fetch("/api/merchant", {
        body: JSON.stringify({
          businessName,
          confirmReceivingAddressChange,
          receivingAddress,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        if (response.status === 409 || response.status >= 500) {
          await reconcileSettings(attemptedName, attemptedAddress);
        } else setStatus("error");
        return;
      }

      const nextSettings = normalizeMerchantSettings(await response.json());
      applySettings(nextSettings);
      setStatus("saved");
      router.refresh();
    } catch {
      await reconcileSettings(attemptedName, attemptedAddress);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || status === "saving") return;
    if (addressChanged) {
      setConfirmAddress(true);
      return;
    }
    void persist(false);
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        {status === "error" ? (
          <p className={styles.errorBanner} role="alert">
            Couldn’t save settings. Review the fields and try again.
          </p>
        ) : null}
        {status === "reconciled" ? (
          <p className={styles.errorBanner} role="alert">
            Settings were not saved. The current values have been reloaded.
          </p>
        ) : null}
        {status === "uncertain" ? (
          <div className={styles.errorBanner} role="alert">
            We couldn’t confirm whether settings were saved. Reload before accepting payments.
            <button onClick={() => window.location.reload()} type="button">
              Reload settings
            </button>
          </div>
        ) : null}
        {status === "saved" ? (
          <p className={styles.savedBanner} role="status">
            Settings saved.
          </p>
        ) : null}

        <fieldset
          className={styles.card}
          aria-busy={status === "saving"}
          disabled={status === "saving"}
        >
          <label className={styles.field}>
            <span>Business name</span>
            <input
              maxLength={100}
              onChange={(event) => changeBusinessName(event.target.value)}
              placeholder="Your business name"
              value={businessName}
            />
            <small>Shown to buyers in the checkout panel.</small>
          </label>

          <LogoUploader
            enabled={props.logoUploadEnabled}
            initial={initial}
            logoEtag={props.logoEtag}
            logoUrl={props.logoUrl}
            pathPrefix={props.logoPathPrefix}
          />

          <ReceivingAddressField
            editing={editingAddress}
            onCancel={() => {
              setReceivingAddress(saved.receivingAddress);
              setEditingAddress(false);
            }}
            onChange={changeReceivingAddress}
            onEdit={() => setEditingAddress(true)}
            receivingAddress={receivingAddress}
            source={saved.receivingAddressSource}
          />

          <div className={styles.field}>
            <span>Settlement token</span>
            <div className={styles.lockedField}>
              <span>USDC on Arbitrum One</span>
              <span aria-hidden="true">🔒</span>
            </div>
            <small>Fixed by Tab — shown for transparency. Not configurable.</small>
          </div>

          <div className={styles.formActions}>
            <button disabled={!dirty || status === "saving"} type="submit">
              {status === "saving" ? "Saving…" : "Save settings"}
            </button>
          </div>
        </fieldset>
      </form>

      {confirmAddress ? (
        <ReceivingAddressDialog
          address={receivingAddress}
          onCancel={() => setConfirmAddress(false)}
          onConfirm={() => void persist(true)}
        />
      ) : null}
    </>
  );
}
