import { describe, expect, it, vi } from "vitest";

import { AuthRequestError, createEmailOtpAuthApi } from "./auth-request";

const ownerApi = () =>
  createEmailOtpAuthApi({
    precheckPath: "/api/agents/auth/precheck",
    verifyPath: "/api/agents/auth/verify",
  });

describe("createEmailOtpAuthApi", () => {
  it("prechecks the email through the configured endpoint", async () => {
    const request = vi.fn(async () => Response.json({ allowed: true }));

    await ownerApi().precheck("Owner@Example.com", { request });

    expect(request).toHaveBeenCalledWith("/api/agents/auth/precheck", {
      body: JSON.stringify({ email: "Owner@Example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("merges extraBody fields into every request", async () => {
    const request = vi.fn(async () => Response.json({ allowed: true }));
    const api = createEmailOtpAuthApi({
      extraBody: { flow: "signup" },
      precheckPath: "/api/auth/precheck",
      verifyPath: "/api/auth/verify",
    });

    await api.precheck("merchant@example.com", { request });

    expect(request).toHaveBeenCalledWith("/api/auth/precheck", {
      body: JSON.stringify({ email: "merchant@example.com", flow: "signup" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("sends the DID to the verifier and accepts only a local redirect", async () => {
    const goodRequest = vi.fn(async () => Response.json({ redirectTo: "/agents" }));
    const badRequest = vi.fn(async () => Response.json({ redirectTo: "//outside.example" }));

    await expect(
      ownerApi().verifyDidToken("persisted.did.token", "owner@example.com", {
        request: goodRequest,
      }),
    ).resolves.toBe("/agents");
    expect(goodRequest).toHaveBeenCalledWith("/api/agents/auth/verify", {
      body: JSON.stringify({ didToken: "persisted.did.token", email: "owner@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(
      ownerApi().verifyDidToken("persisted.did.token", "owner@example.com", {
        request: badRequest,
      }),
    ).rejects.toMatchObject({ code: "INVALID_AUTH_RESPONSE" });
  });

  it("preserves a structured server rejection for truthful UI copy", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "MAGIC_EMAIL_MISMATCH",
            message: "This browser belongs to a different email.",
          },
        },
        { status: 409 },
      ),
    );

    await expect(ownerApi().precheck("owner@example.com", { request })).rejects.toEqual(
      new AuthRequestError(
        "MAGIC_EMAIL_MISMATCH",
        "This browser belongs to a different email.",
        409,
      ),
    );
  });
});
