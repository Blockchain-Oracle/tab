import type { readOwnerLeashKey } from "../auth/leash-key";

type KeySummary = NonNullable<Awaited<ReturnType<typeof readOwnerLeashKey>>>;

export type LeashKeyView = Omit<KeySummary, "createdAt" | "lastUsedAt" | "revokedAt"> & {
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function leashKeyView(key: KeySummary): LeashKeyView {
  return {
    ...key,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
