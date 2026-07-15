export type MerchantSettingsSnapshot = {
  businessName: string;
  logoEtag: string | null;
  logoUrl: string | null;
  receivingAddress: string;
  receivingAddressSource: "custom" | "magic_default";
};

type MerchantSettingsPayload = {
  merchant: Omit<MerchantSettingsSnapshot, "businessName"> & { businessName: string | null };
};

export function normalizeMerchantSettings(payload: MerchantSettingsPayload) {
  return {
    ...payload.merchant,
    businessName: payload.merchant.businessName ?? "",
  };
}

export async function readAuthoritativeMerchantSettings() {
  try {
    const response = await fetch("/api/merchant", { cache: "no-store" });
    if (!response.ok) return undefined;
    return normalizeMerchantSettings((await response.json()) as MerchantSettingsPayload);
  } catch {
    return undefined;
  }
}
