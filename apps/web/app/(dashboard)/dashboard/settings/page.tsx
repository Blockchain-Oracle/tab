import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { MerchantSettingsForm } from "./merchant-settings-form";
import styles from "./settings-page.module.css";

export const metadata: Metadata = {
  title: "Settings · Tab",
};

export default async function SettingsPage() {
  const merchant = await requireCurrentMerchant();
  const businessName = merchant.businessName?.trim() ?? "";

  return (
    <div className={styles.page}>
      <h1>Settings</h1>
      <MerchantSettingsForm
        businessName={businessName}
        email={merchant.email}
        logoEtag={merchant.logoEtag}
        logoPathPrefix={`merchant-logos/${merchant.merchantId}`}
        logoUploadEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())}
        logoUrl={merchant.logoUrl}
        receivingAddress={merchant.receivingAddress}
        receivingAddressSource={merchant.receivingAddressSource}
      />
    </div>
  );
}
