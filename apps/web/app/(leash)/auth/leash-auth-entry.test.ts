import { describe, expect, it, vi } from "vitest";

import { runLeashAuthEntry } from "./leash-auth-entry";

describe("Leash persistent Magic auth entry", () => {
  it("prechecks, restores the Magic DID, then verifies without starting OTP", async () => {
    const order: string[] = [];
    const onAuthenticated = vi.fn();
    const onChallenge = vi.fn();

    await runLeashAuthEntry({
      isCurrent: () => true,
      onAuthenticated,
      onChallenge,
      onPrecheckRejected: vi.fn(),
      precheck: async () => {
        order.push("precheck");
      },
      user: {
        getIdToken: async () => {
          order.push("getIdToken");
          return "persisted.did.token";
        },
        isLoggedIn: async () => {
          order.push("isLoggedIn");
          return true;
        },
      },
      verifyDidToken: async (didToken) => {
        order.push(`verify:${didToken}`);
        return "/leash";
      },
    });

    expect(order).toEqual(["precheck", "isLoggedIn", "getIdToken", "verify:persisted.did.token"]);
    expect(onAuthenticated).toHaveBeenCalledWith("/leash");
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("starts OTP only when Magic has no persisted login", async () => {
    const getIdToken = vi.fn();
    const onChallenge = vi.fn();

    await runLeashAuthEntry({
      isCurrent: () => true,
      onAuthenticated: vi.fn(),
      onChallenge,
      onPrecheckRejected: vi.fn(),
      precheck: async () => undefined,
      user: {
        getIdToken,
        isLoggedIn: vi.fn().mockResolvedValue(false),
      },
      verifyDidToken: vi.fn(),
    });

    expect(getIdToken).not.toHaveBeenCalled();
    expect(onChallenge).toHaveBeenCalledOnce();
  });

  it("does not contact Magic when the server precheck rejects", async () => {
    const isLoggedIn = vi.fn();
    const onPrecheckRejected = vi.fn();

    await runLeashAuthEntry({
      isCurrent: () => true,
      onAuthenticated: vi.fn(),
      onChallenge: vi.fn(),
      onPrecheckRejected,
      precheck: async () => {
        throw new Error("not configured");
      },
      user: { getIdToken: vi.fn(), isLoggedIn },
      verifyDidToken: vi.fn(),
    });

    expect(onPrecheckRejected).toHaveBeenCalledOnce();
    expect(isLoggedIn).not.toHaveBeenCalled();
  });
});
