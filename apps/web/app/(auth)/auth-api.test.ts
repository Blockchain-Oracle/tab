import { describe, expect, it, vi } from "vitest";

import { AuthRequestError, precheckEmail, verifyDidToken } from "./auth-api";

describe("merchant auth API client", () => {
  it("sends a flow-aware email precheck", async () => {
    const request = vi.fn(async () => Response.json({ allowed: true }));

    await precheckEmail("Merchant@Example.com", "signup", { request });

    expect(request).toHaveBeenCalledWith("/api/auth/precheck", {
      body: JSON.stringify({ email: "Merchant@Example.com", flow: "signup" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("preserves structured server errors for truthful inline copy", async () => {
    const request = vi.fn(async () =>
      Response.json(
        { error: { code: "EMAIL_ALREADY_REGISTERED", message: "Already registered." } },
        { status: 409 },
      ),
    );

    await expect(precheckEmail("merchant@example.com", "signup", { request })).rejects.toEqual(
      new AuthRequestError("EMAIL_ALREADY_REGISTERED", "Already registered.", 409),
    );
  });

  it("maps a rejected request to a truthful network error", async () => {
    const request = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });

    await expect(precheckEmail("merchant@example.com", "login", { request })).rejects.toMatchObject(
      {
        code: "NETWORK_ERROR",
        message: "Tab could not reach the authentication service.",
        status: 0,
      },
    );
  });

  it("accepts only a local redirect after server DID verification", async () => {
    const goodRequest = vi.fn(async () => Response.json({ redirectTo: "/dashboard/quickstart" }));
    const badRequest = vi.fn(async () => Response.json({ redirectTo: "//outside.example" }));

    await expect(
      verifyDidToken("did-token", "merchant@example.com", "signup", { request: goodRequest }),
    ).resolves.toBe("/dashboard/quickstart");
    expect(goodRequest).toHaveBeenCalledWith("/api/auth/verify", {
      body: JSON.stringify({
        didToken: "did-token",
        email: "merchant@example.com",
        flow: "signup",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(
      verifyDidToken("did-token", "merchant@example.com", "signup", { request: badRequest }),
    ).rejects.toMatchObject({
      code: "INVALID_AUTH_RESPONSE",
    });
  });
});
