import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentMerchant } from "../../lib/auth/current-merchant";
import type { AuthFlow } from "./auth-copy";
import { AuthSplitLayout } from "./auth-split-layout";
import { MerchantAuthCard } from "./merchant-auth-card";

function authConfiguration() {
  const publishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY?.trim() ?? "";
  const missing = [
    !publishableKey ? "NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY" : undefined,
    !process.env.MAGIC_SECRET_KEY?.trim() ? "MAGIC_SECRET_KEY" : undefined,
    !process.env.SESSION_SECRET?.trim() ? "SESSION_SECRET" : undefined,
    !process.env.DATABASE_URL?.trim() ? "DATABASE_URL" : undefined,
  ].filter((name): name is string => Boolean(name));

  return {
    configured: missing.length === 0,
    configurationMessage:
      process.env.NODE_ENV === "development"
        ? `[Authentication blocked — set ${missing.join(" and ")}]`
        : "Authentication is temporarily unavailable.",
    publishableKey,
  };
}

export async function MerchantAuthPage({ flow }: { flow: AuthFlow }) {
  await connection();
  const merchant = await getCurrentMerchant();
  if (merchant) redirect("/dashboard/transactions");
  const configuration = authConfiguration();

  return (
    <AuthSplitLayout brandVariant="merchant" footer="One account per merchant · Testnet by default">
      <MerchantAuthCard flow={flow} {...configuration} />
    </AuthSplitLayout>
  );
}
