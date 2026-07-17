import { describe, expect, it, vi } from "vitest";

import { AuthRequestError } from "../../(auth)/auth-api";
import { precheckLeashEmail, verifyLeashDidToken } from "./leash-auth-api";

describe("Leash owner auth API client", () => {
  it("prechecks the email through the dedicated owner endpoint", async () => {
    const request = vi.fn(async () => Response.json({ allowed: true }));

    await precheckLeashEmail("Owner@Example.com", { request });

    expect(request).toHaveBeenCalledWith("/api/leash/auth/precheck", {
      body: JSON.stringify({ email: "Owner@Example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("sends the DID to the owner verifier and accepts only a local redirect", async () => {
    const goodRequest = vi.fn(async () => Response.json({ redirectTo: "/leash" }));
    const badRequest = vi.fn(async () => Response.json({ redirectTo: "//outside.example" }));

    await expect(
      verifyLeashDidToken("persisted.did.token", "owner@example.com", { request: goodRequest }),
    ).resolves.toBe("/leash");
    expect(goodRequest).toHaveBeenCalledWith("/api/leash/auth/verify", {
      body: JSON.stringify({ didToken: "persisted.did.token", email: "owner@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(
      verifyLeashDidToken("persisted.did.token", "owner@example.com", { request: badRequest }),
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

    await expect(precheckLeashEmail("owner@example.com", { request })).rejects.toEqual(
      new AuthRequestError(
        "MAGIC_EMAIL_MISMATCH",
        "This browser belongs to a different email.",
        409,
      ),
    );
  });
});
