import { privateKeyToAccount, signAuthorization } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

import { createMagicPaymentSigner, restoreMagicSession, startMagicEmailOtp } from "./magic";

const ownerAddress = "0x1111111111111111111111111111111111111111";

function metadata(email = "buyer@example.test") {
  return { email, wallets: { ethereum: { publicAddress: ownerAddress, subAccounts: [] } } };
}

describe("Magic buyer authentication", () => {
  it("reuses a valid persistent session without starting OTP", async () => {
    const user = {
      getIdToken: vi.fn().mockResolvedValue("persisted.did.token"),
      getInfo: vi.fn().mockResolvedValue(metadata()),
      isLoggedIn: vi.fn().mockResolvedValue(true),
    };

    await expect(restoreMagicSession({ user })).resolves.toEqual({
      didToken: "persisted.did.token",
      email: "buyer@example.test",
      ownerAddress,
    });
    expect(user.isLoggedIn).toHaveBeenCalledOnce();
    expect(user.getIdToken).toHaveBeenCalledOnce();
    expect(user.getInfo).toHaveBeenCalledOnce();
  });

  it("returns no session when Magic is logged out", async () => {
    const user = {
      getIdToken: vi.fn(),
      getInfo: vi.fn(),
      isLoggedIn: vi.fn().mockResolvedValue(false),
    };

    await expect(restoreMagicSession({ user })).resolves.toBeUndefined();
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(user.getInfo).not.toHaveBeenCalled();
  });

  it("runs headless OTP, emits the code, and binds identity to the entered email", async () => {
    const listeners = new Map<string, () => void>();
    let resolveDid!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolveDid = resolve;
    });
    const flow = Object.assign(promise, {
      emit: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
        return flow;
      }),
    });
    const loginWithEmailOTP = vi.fn(() => flow);
    const onOtpSent = vi.fn();
    const onExpired = vi.fn();
    const onInvalid = vi.fn();
    const onRateLimited = vi.fn();
    const client = {
      auth: { loginWithEmailOTP },
      user: {
        getIdToken: vi.fn(),
        getInfo: vi.fn().mockResolvedValue(metadata()),
        isLoggedIn: vi.fn(),
      },
    };

    const attempt = startMagicEmailOtp(client, "Buyer@Example.Test", {
      onExpired,
      onInvalid,
      onOtpSent,
      onRateLimited,
    });
    listeners.get("email-otp-sent")?.();
    listeners.get("invalid-email-otp")?.();
    listeners.get("expired-email-otp")?.();
    listeners.get("login-throttled")?.();
    attempt.verify("641728");
    attempt.cancel();
    resolveDid("fresh.did.token");

    await expect(attempt.result).resolves.toEqual({
      didToken: "fresh.did.token",
      email: "buyer@example.test",
      ownerAddress,
    });
    expect(loginWithEmailOTP).toHaveBeenCalledWith({
      deviceCheckUI: false,
      email: "buyer@example.test",
      showUI: false,
    });
    expect(onOtpSent).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledOnce();
    expect(onRateLimited).toHaveBeenCalledOnce();
    expect(flow.emit).toHaveBeenCalledWith("verify-email-otp", "641728");
    expect(flow.emit).toHaveBeenCalledWith("cancel");
  });

  it("serializes and verifies Magic authorization and root signatures", async () => {
    const privateKey = `0x${"01".padStart(64, "0")}` as const;
    const account = privateKeyToAccount(privateKey);
    const contractAddress = "0x3333333333333333333333333333333333333333";
    const rootHash = `0x${"ab".repeat(32)}` as const;
    const signedAuthorization = await signAuthorization({
      address: contractAddress,
      chainId: 42161,
      nonce: 7,
      privateKey,
    });
    if (signedAuthorization.yParity === undefined) throw new Error("Missing test signature parity");
    const rootSignature = await account.signMessage({ message: { raw: rootHash } });
    const sign7702Authorization = vi.fn().mockResolvedValue({
      chainId: 42161,
      contractAddress,
      nonce: 7,
      r: signedAuthorization.r,
      s: signedAuthorization.s,
      v: signedAuthorization.yParity + 27,
    });
    const request = vi.fn().mockResolvedValue(rootSignature);
    const signer = createMagicPaymentSigner(
      { rpcProvider: { request }, wallet: { sign7702Authorization } },
      account.address,
    );

    await expect(
      signer.signAuthorization({
        address: contractAddress,
        chainId: 42161,
        nonce: 7,
        userOpHash: `0x${"cd".repeat(32)}`,
      }),
    ).resolves.toMatch(/^0x[\da-f]{130}$/i);
    await expect(signer.signRootHash(rootHash, account.address)).resolves.toBe(rootSignature);

    expect(sign7702Authorization).toHaveBeenCalledWith({
      chainId: 42161,
      contractAddress,
      nonce: 7,
    });
    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [rootHash, account.address],
    });
  });
});
