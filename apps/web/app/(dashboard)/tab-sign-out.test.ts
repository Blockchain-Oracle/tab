import { describe, expect, it, vi } from "vitest";

import { signOutOfTab } from "./tab-sign-out";

describe("signOutOfTab", () => {
  it("navigates only after the Tab application session is cleared", async () => {
    let resolveLogout: ((response: { ok: boolean }) => void) | undefined;
    const requestLogout = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const navigate = vi.fn();

    const signOut = signOutOfTab(requestLogout, navigate);

    expect(requestLogout).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    resolveLogout?.({ ok: true });
    await signOut;

    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("does not navigate when the Tab session cannot be cleared", async () => {
    const requestLogout = vi.fn().mockResolvedValue({ ok: false });
    const navigate = vi.fn();

    await expect(signOutOfTab(requestLogout, navigate)).rejects.toThrow("Server logout failed");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate when the Tab logout request rejects", async () => {
    const requestLogout = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const navigate = vi.fn();

    await expect(signOutOfTab(requestLogout, navigate)).rejects.toThrow("network unavailable");
    expect(navigate).not.toHaveBeenCalled();
  });
});
