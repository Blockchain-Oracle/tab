import { describe, expect, it, vi } from "vitest";

import { runAuthEntry } from "./auth-entry";

function callbacks() {
  return {
    onAuthenticated: vi.fn(),
    onChallenge: vi.fn(),
    onPrecheckRejected: vi.fn(),
  };
}

describe("auth entry orchestration", () => {
  it("prechecks before reusing a persisted Magic session without starting OTP", async () => {
    const calls: string[] = [];
    const handlers = callbacks();

    await runAuthEntry({
      ...handlers,
      isCurrent: () => true,
      precheck: async () => {
        calls.push("precheck");
      },
      readDidToken: async () => {
        calls.push("session");
        return "fresh.did.token";
      },
      verifyDidToken: async () => {
        calls.push("verify");
        return "/dashboard/transactions";
      },
    });

    expect(calls).toEqual(["precheck", "session", "verify"]);
    expect(handlers.onChallenge).not.toHaveBeenCalled();
    expect(handlers.onAuthenticated).toHaveBeenCalledWith("/dashboard/transactions");
  });

  it("starts OTP only when no persisted Magic session exists", async () => {
    const handlers = callbacks();
    const verifyDidToken = vi.fn();

    await runAuthEntry({
      ...handlers,
      isCurrent: () => true,
      precheck: vi.fn().mockResolvedValue(undefined),
      readDidToken: vi.fn().mockResolvedValue(undefined),
      verifyDidToken,
    });

    expect(handlers.onChallenge).toHaveBeenCalledOnce();
    expect(verifyDidToken).not.toHaveBeenCalled();
    expect(handlers.onAuthenticated).not.toHaveBeenCalled();
  });

  it("stops before Magic when the server precheck rejects the email", async () => {
    const error = new Error("not allowed");
    const handlers = callbacks();
    const readDidToken = vi.fn();

    await runAuthEntry({
      ...handlers,
      isCurrent: () => true,
      precheck: vi.fn().mockRejectedValue(error),
      readDidToken,
      verifyDidToken: vi.fn(),
    });

    expect(handlers.onPrecheckRejected).toHaveBeenCalledWith(error);
    expect(readDidToken).not.toHaveBeenCalled();
    expect(handlers.onChallenge).not.toHaveBeenCalled();
  });

  it.each([
    ["session lookup", vi.fn().mockRejectedValue(new Error("Magic unavailable"))],
    ["token verification", vi.fn().mockResolvedValue("fresh.did.token")],
  ])("does not challenge or redirect when %s fails", async (failurePoint, readDidToken) => {
    const handlers = callbacks();
    const verifyDidToken =
      failurePoint === "token verification"
        ? vi.fn().mockRejectedValue(new Error("verification unavailable"))
        : vi.fn();

    await expect(
      runAuthEntry({
        ...handlers,
        isCurrent: () => true,
        precheck: vi.fn().mockResolvedValue(undefined),
        readDidToken,
        verifyDidToken,
      }),
    ).rejects.toThrow();

    expect(handlers.onChallenge).not.toHaveBeenCalled();
    expect(handlers.onAuthenticated).not.toHaveBeenCalled();
  });

  it.each([
    "precheck",
    "session",
    "verification",
  ])("ignores an attempt that becomes stale after %s", async (staleAfter) => {
    let current = true;
    const handlers = callbacks();
    const complete = (stage: string, value?: string) => {
      if (staleAfter === stage) current = false;
      return value;
    };

    await runAuthEntry({
      ...handlers,
      isCurrent: () => current,
      precheck: async () => {
        complete("precheck");
      },
      readDidToken: async () => complete("session", "fresh.did.token"),
      verifyDidToken: async () => complete("verification", "/dashboard/transactions") as string,
    });

    expect(handlers.onChallenge).not.toHaveBeenCalled();
    expect(handlers.onAuthenticated).not.toHaveBeenCalled();
    expect(handlers.onPrecheckRejected).not.toHaveBeenCalled();
  });
});
