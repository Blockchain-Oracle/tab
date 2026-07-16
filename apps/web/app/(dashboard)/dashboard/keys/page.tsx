import type { Metadata } from "next";

import { requireCurrentMerchant } from "../../../../lib/auth/current-merchant";
import { listApiKeys } from "../../../../lib/dashboard/api-keys";
import { getServerDatabase } from "../../../../lib/db/server";
import { ApiKeysClient } from "./api-keys-client";

export const metadata: Metadata = {
  title: "API keys · Tab",
};

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ env?: string }>;
}) {
  const merchant = await requireCurrentMerchant();
  const requested = (await searchParams).env;
  const env = requested === "live" || requested === "test" ? requested : merchant.mode;
  const keys = await listApiKeys(getServerDatabase().db, {
    env,
    merchantId: merchant.merchantId,
  });

  return <ApiKeysClient initialKeys={keys} mode={env} />;
}
