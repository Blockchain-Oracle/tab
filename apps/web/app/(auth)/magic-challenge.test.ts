import { beforeEach, describe, expect, it, vi } from "vitest";

import { type EmailOtpFlow, getMagicClient } from "../../lib/auth/magic-client";
import { startMagicEmailOtpChallenge } from "./magic-challenge";

vi.mock("../../lib/auth/magic-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/auth/magic-client")>();
  return { ...original, getMagicClient: vi.fn() };
});

function resolvedChallenge(didToken: string | null) {
  let challenge: EmailOtpFlow;
  challenge = Object.assign(Promise.resolve(didToken), {
    emit: vi.fn(),
    on: vi.fn(() => challenge),
  }) as unknown as EmailOtpFlow;
  return challenge;
}

function handlers(challenge: EmailOtpFlow) {
  return {
    dispatch: vi.fn(),
    email: "merchant@example.com",
    isCurrent: vi.fn((candidate: EmailOtpFlow) => candidate === challenge),
    isResend: vi.fn(() => false),
    onAuthenticated: vi.fn(),
    onFailure: vi.fn(),
    onFatal: vi.fn(),
    publishableKey: "pk_live_magic",
    resetResend: vi.fn(),
    resetSubmittedOtp: vi.fn(),
    setDeviceMessage: vi.fn(),
    setNotice: vi.fn(),
    verifyDidToken: vi.fn().mockResolvedValue("/dashboard/transactions"),
  };
}

describe("Magic email OTP challenge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the silent OTP flow and verifies its DID token", async () => {
    const challenge = resolvedChallenge("fresh.did.token");
    const loginWithEmailOTP = vi.fn(() => challenge);
    vi.mocked(getMagicClient).mockReturnValue({
      auth: { loginWithEmailOTP },
    } as unknown as ReturnType<typeof getMagicClient>);
    const options = handlers(challenge);

    const active = startMagicEmailOtpChallenge(options);
    await vi.waitFor(() => expect(options.onAuthenticated).toHaveBeenCalledOnce());

    expect(loginWithEmailOTP).toHaveBeenCalledWith({
      deviceCheckUI: false,
      email: "merchant@example.com",
      showUI: false,
    });
    expect(active?.flow).toBe(challenge);
    expect(options.verifyDidToken).toHaveBeenCalledWith("fresh.did.token", expect.any(AbortSignal));
    expect(options.onAuthenticated).toHaveBeenCalledWith(challenge, "/dashboard/transactions");
  });

  it("reports synchronous SDK startup failures without pretending a challenge exists", () => {
    const challenge = resolvedChallenge("unused");
    const error = new Error("Magic unavailable");
    vi.mocked(getMagicClient).mockImplementation(() => {
      throw error;
    });
    const options = handlers(challenge);

    const active = startMagicEmailOtpChallenge(options);

    expect(options.onFailure).toHaveBeenCalledWith(undefined, error);
    expect(active).toBeUndefined();
  });

  it("drops a completion from a challenge that is no longer current", async () => {
    const challenge = resolvedChallenge("stale.did.token");
    vi.mocked(getMagicClient).mockReturnValue({
      auth: { loginWithEmailOTP: vi.fn(() => challenge) },
    } as unknown as ReturnType<typeof getMagicClient>);
    const options = handlers(challenge);
    options.isCurrent.mockReturnValue(false);

    startMagicEmailOtpChallenge(options);
    await challenge;
    await Promise.resolve();

    expect(options.verifyDidToken).not.toHaveBeenCalled();
    expect(options.onAuthenticated).not.toHaveBeenCalled();
    expect(options.onFailure).not.toHaveBeenCalled();
  });

  it("aborts in-flight DID verification when the challenge is cancelled", async () => {
    const challenge = resolvedChallenge("cancelled.did.token");
    vi.mocked(getMagicClient).mockReturnValue({
      auth: { loginWithEmailOTP: vi.fn(() => challenge) },
    } as unknown as ReturnType<typeof getMagicClient>);
    const options = handlers(challenge);
    options.verifyDidToken.mockImplementation(
      (_didToken: string, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const active = startMagicEmailOtpChallenge(options);
    await vi.waitFor(() => expect(options.verifyDidToken).toHaveBeenCalledOnce());
    active?.cancel();
    await vi.waitFor(() => expect(options.verifyDidToken.mock.calls[0]?.[1].aborted).toBe(true));

    expect(challenge.emit).toHaveBeenCalledWith("cancel");
    expect(options.onAuthenticated).not.toHaveBeenCalled();
    expect(options.onFailure).not.toHaveBeenCalled();
  });
});
