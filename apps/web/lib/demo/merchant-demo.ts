import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client";
import { apiKeys, merchants } from "../db/schema";

export async function readMerchantDemo(db: Database, merchantId: string) {
  const [row] = await db
    .select({
      businessName: merchants.businessName,
      logoUrl: merchants.logoUrl,
      publishableKey: apiKeys.publicKey,
    })
    .from(merchants)
    .innerJoin(
      apiKeys,
      and(
        eq(apiKeys.merchantId, merchants.id),
        eq(apiKeys.env, "test"),
        eq(apiKeys.type, "publishable"),
        isNull(apiKeys.revokedAt),
      ),
    )
    .where(eq(merchants.id, merchantId))
    .limit(1);
  if (!row?.publishableKey) throw new Error("Merchant demo is not configured");
  return { ...row, publishableKey: row.publishableKey };
}
