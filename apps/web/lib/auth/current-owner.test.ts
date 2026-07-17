import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InactiveOwnerSessionError extends Error {}
  class InvalidOwnerSessionError extends Error {}
  return {
    cookieValue: undefined as string | undefined,
    InactiveOwnerSessionError,
    InvalidOwnerSessionError,
    loadOwnerSession: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
  })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../db/server", () => ({ getServerDatabase: () => ({ db: "database" }) }));
vi.mock("./owner-session", () => ({
  InactiveOwnerSessionError: mocks.InactiveOwnerSessionError,
  InvalidOwnerSessionError: mocks.InvalidOwnerSessionError,
  loadOwnerSession: mocks.loadOwnerSession,
}));

import { getCurrentOwner, requireCurrentOwner } from "./current-owner";

describe("current Leash owner server helper", () => {
  beforeEach(() => {
    mocks.cookieValue = undefined;
    mocks.loadOwnerSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("loads the owner from tab_session", async () => {
    const owner = { email: "owner@example.test", userId: "owner-id" };
    mocks.cookieValue = "signed-session";
    mocks.loadOwnerSession.mockResolvedValue(owner);

    await expect(getCurrentOwner()).resolves.toBe(owner);
    expect(mocks.loadOwnerSession).toHaveBeenCalledWith("database", "signed-session");
  });

  it("returns no owner for missing, invalid, or inactive sessions", async () => {
    await expect(getCurrentOwner()).resolves.toBeUndefined();

    mocks.cookieValue = "invalid";
    mocks.loadOwnerSession.mockRejectedValueOnce(new mocks.InvalidOwnerSessionError());
    await expect(getCurrentOwner()).resolves.toBeUndefined();

    mocks.cookieValue = "inactive";
    mocks.loadOwnerSession.mockRejectedValueOnce(new mocks.InactiveOwnerSessionError());
    await expect(getCurrentOwner()).resolves.toBeUndefined();
  });

  it("redirects an unauthenticated owner to the dedicated Leash login", async () => {
    await expect(requireCurrentOwner()).rejects.toThrow("redirect:/leash/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/leash/login");
  });

  it("does not hide unexpected owner lookup failures", async () => {
    mocks.cookieValue = "signed-session";
    mocks.loadOwnerSession.mockRejectedValue(new Error("database unavailable"));

    await expect(getCurrentOwner()).rejects.toThrow("database unavailable");
  });
});
