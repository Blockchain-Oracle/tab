import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "./client";
import { merchants } from "./schema";

type MerchantSettingsUpdate = {
  businessName: string | null;
  expectedBusinessName: string | null;
  expectedReceivingAddress: string;
  merchantId: string;
  receivingAddress: string;
  receivingAddressSource: "custom" | "magic_default";
};

export async function updateMerchantSettings(db: Database, update: MerchantSettingsUpdate) {
  const businessNameIsCurrent =
    update.expectedBusinessName === null
      ? isNull(merchants.businessName)
      : eq(merchants.businessName, update.expectedBusinessName);
  const [updated] = await db
    .update(merchants)
    .set({
      businessName: update.businessName,
      receivingAddress: update.receivingAddress,
      receivingAddressSource: update.receivingAddressSource,
    })
    .where(
      and(
        eq(merchants.id, update.merchantId),
        businessNameIsCurrent,
        eq(merchants.receivingAddress, update.expectedReceivingAddress),
      ),
    )
    .returning({
      businessName: merchants.businessName,
      receivingAddress: merchants.receivingAddress,
      receivingAddressSource: merchants.receivingAddressSource,
    });

  return updated;
}
