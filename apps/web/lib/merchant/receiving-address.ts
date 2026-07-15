import { getAddress, isAddress, zeroAddress } from "viem";

export function normalizeReceivingAddress(value: string) {
  const candidate = value.trim();
  if (!isAddress(candidate)) return undefined;

  const normalized = getAddress(candidate);
  return normalized === zeroAddress ? undefined : normalized;
}
