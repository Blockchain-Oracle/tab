import { describe, expect, it, vi } from "vitest";

import { getPersistedMagicDidToken } from "./magic-session";

describe("getPersistedMagicDidToken", () => {
  it("returns no token without an existing Magic session", async () => {
    const getIdToken = vi.fn();

    await expect(
      getPersistedMagicDidToken({
        getIdToken,
        isLoggedIn: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toBeUndefined();
    expect(getIdToken).not.toHaveBeenCalled();
  });

  it("gets a fresh DID token from an existing Magic session", async () => {
    await expect(
      getPersistedMagicDidToken({
        getIdToken: vi.fn().mockResolvedValue("fresh.did.token"),
        isLoggedIn: vi.fn().mockResolvedValue(true),
      }),
    ).resolves.toBe("fresh.did.token");
  });

  it("fails closed when a logged-in Magic session yields no DID token", async () => {
    await expect(
      getPersistedMagicDidToken({
        getIdToken: vi.fn().mockResolvedValue(null),
        isLoggedIn: vi.fn().mockResolvedValue(true),
      }),
    ).rejects.toThrow("Magic did not return a DID token");
  });
});
