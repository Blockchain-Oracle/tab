import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
  getServerDatabase: vi.fn(),
  verifyMerchantDidToken: vi.fn(),
}));

vi.mock("../../../../lib/auth/magic-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../lib/auth/magic-admin")>();
  return {
    ...original,
    magicAuthenticationConfigured: () => true,
    verifyMerchantDidToken: boundary.verifyMerchantDidToken,
  };
});

vi.mock("../../../../lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../lib/auth/session")>();
  return {
    ...original,
    createSessionToken: boundary.createSessionToken,
    sessionSigningConfigured: () => true,
  };
});

vi.mock("../../../../lib/db/server", () => ({
  getServerDatabase: boundary.getServerDatabase,
}));

import { POST } from "./route";

function request(email: string) {
  return new Request("http://localhost/api/auth/verify", {
    body: JSON.stringify({ didToken: "verified.did.token", email, flow: "login" }),
    headers: { "content-type": "application/json", origin: "http://localhost" },
    method: "POST",
  });
}

describe("POST /api/auth/verify email binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a different persisted Magic identity before tenant access or cookie creation", async () => {
    boundary.verifyMerchantDidToken.mockResolvedValue({
      email: "owner@example.com",
      magicIssuer: "did:ethr:owner",
      receivingAddress: "0x1111111111111111111111111111111111111111",
    });

    const response = await POST(request("merchant@example.com"));

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MAGIC_EMAIL_MISMATCH",
        message: "This browser's saved Magic session belongs to a different email.",
      },
    });
    expect(boundary.getServerDatabase).not.toHaveBeenCalled();
    expect(boundary.createSessionToken).not.toHaveBeenCalled();
  });
});
