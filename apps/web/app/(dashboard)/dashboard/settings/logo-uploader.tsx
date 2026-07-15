"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import styles from "./logo-uploader.module.css";
import { readAuthoritativeMerchantSettings } from "./merchant-settings-client";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const logoTypes = new Set(["image/jpeg", "image/png"]);

type LogoUploaderProps = {
  enabled: boolean;
  initial: string;
  logoEtag: string | null;
  logoUrl: string | null;
  pathPrefix: string;
};

function versionedLogoUrl(url: string, etag: string | null) {
  if (!etag) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(etag)}`;
}

export function LogoUploader({
  enabled,
  initial,
  logoEtag,
  logoUrl,
  pathPrefix,
}: LogoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentEtag, setCurrentEtag] = useState(logoEtag);
  const [currentUrl, setCurrentUrl] = useState(logoUrl);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function uploadLogo(file: File) {
    if (!logoTypes.has(file.type) || file.size > MAX_LOGO_BYTES) {
      setError("Choose a JPG or PNG under 2MB.");
      return;
    }

    setError(undefined);
    setNotice(undefined);
    setProgress(0);
    setUploading(true);

    let uploaded: { etag: string; url: string } | undefined;
    try {
      const blob = await upload(`${pathPrefix}/logo`, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/merchant/logo",
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      uploaded = { etag: blob.etag, url: blob.url };
      const response = await fetch("/api/merchant/logo", {
        body: JSON.stringify(uploaded),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) throw new Error("Logo finalization failed");

      setCurrentEtag(blob.etag);
      setCurrentUrl(blob.url);
      setProgress(100);
      setNotice("Logo uploaded.");
      router.refresh();
    } catch {
      if (!uploaded) {
        setError(
          "We couldn’t confirm whether the logo upload completed. Reload settings to verify.",
        );
      } else {
        const authoritative = await readAuthoritativeMerchantSettings();
        if (authoritative?.logoEtag === uploaded.etag) {
          setCurrentEtag(uploaded.etag);
          setCurrentUrl(uploaded.url);
          setNotice("Logo uploaded.");
          router.refresh();
        } else if (authoritative) {
          setCurrentEtag(authoritative.logoEtag);
          setCurrentUrl(authoritative.logoUrl);
          setError("The upload finished, but this logo was not made active.");
        } else {
          setError("We couldn’t confirm whether the logo was saved. Reload settings to verify.");
        }
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.field}>
      <span>Business logo</span>
      <div className={styles.logoRow}>
        <div className={styles.logoPreview}>
          {currentUrl ? (
            <Image
              alt=""
              height={48}
              src={versionedLogoUrl(currentUrl, currentEtag)}
              unoptimized
              width={48}
            />
          ) : (
            initial
          )}
        </div>
        <div className={styles.logoControls}>
          {enabled ? (
            <>
              <input
                accept="image/jpeg,image/png"
                aria-label="Choose business logo"
                className={styles.fileInput}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                  event.target.value = "";
                }}
                ref={inputRef}
                tabIndex={-1}
                type="file"
              />
              {uploading ? (
                <div className={styles.uploadProgress}>
                  <progress aria-label="Logo upload progress" max="100" value={progress} />
                  <output>{progress}%</output>
                </div>
              ) : (
                <button onClick={() => inputRef.current?.click()} type="button">
                  Upload logo
                </button>
              )}
              <small>JPG or PNG, up to 2MB. Optional.</small>
            </>
          ) : (
            <small>Buyers see your business initial while logo storage is unavailable.</small>
          )}
          {error ? (
            <small className={styles.inlineError} role="alert">
              {error}
            </small>
          ) : null}
          {notice ? (
            <small className={styles.inlineSuccess} role="status">
              {notice}
            </small>
          ) : null}
        </div>
      </div>
    </div>
  );
}
