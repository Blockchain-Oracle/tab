import { describe, expect, it, vi } from "vitest";

import { registerMobileServiceWorker } from "./pwa-registration";

describe("mobile service worker registration", () => {
  it("registers the same-origin worker with the narrow mobile scope", async () => {
    const register = vi.fn().mockResolvedValue({ scope: "/mobile/" });

    await registerMobileServiceWorker({ register });

    expect(register).toHaveBeenCalledWith("/mobile/sw.js", {
      scope: "/mobile/",
      updateViaCache: "none",
    });
  });

  it("does nothing when service workers are unavailable", async () => {
    await expect(registerMobileServiceWorker(undefined)).resolves.toBeUndefined();
  });
});
