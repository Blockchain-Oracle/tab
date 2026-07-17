import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { createSessionToken, readSessionToken, sessionCookieOptions } from "./session";

const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const claims = {
  email: "owner@example.test",
  merchantId: "10000000-0000-4000-8000-000000000001",
  mode: "test" as const,
  userId: "20000000-0000-4000-8000-000000000002",
};
const ownerClaims = {
  email: claims.email,
  userId: claims.userId,
};

describe("merchant session tokens with real JOSE signing", () => {
  it("round-trips validated merchant claims", async () => {
    const token = await createSessionToken(claims, secret);

    await expect(readSessionToken(token, secret)).resolves.toEqual(claims);
  });

  it("round-trips a genuine owner token without merchant resource claims", async () => {
    const token = await createSessionToken(ownerClaims, secret);

    await expect(readSessionToken(token, secret)).resolves.toStrictEqual(ownerClaims);
  });

  it.each([
    { merchantId: claims.merchantId },
    { mode: claims.mode },
  ])("rejects a token with a partial merchant claim set", async (partialMerchantClaims) => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ email: claims.email, ...partialMerchantClaims })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow("Session claims are invalid");
  });

  it("rejects a token whose signature was changed", async () => {
    const token = await createSessionToken(claims, secret);
    const [header, payload, signature] = token.split(".");

    if (!header || !payload || !signature) {
      throw new Error("JOSE returned a malformed compact JWT");
    }

    const replacement = signature.startsWith("a") ? "b" : "a";
    const tampered = `${header}.${payload}.${replacement}${signature.slice(1)}`;

    await expect(readSessionToken(tampered, secret)).rejects.toThrow();
  });

  it("rejects signed tokens with invalid runtime claims", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: "not-a-uuid",
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow("Session claims are invalid");
  });

  it("rejects tokens from the wrong issuer", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("another-product")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects tokens for the wrong audience", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("another-app")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects expired tokens", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects signed tokens with no expiration claim", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt()
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects signed tokens with no issued-at claim", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setExpirationTime("1h")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects signed tokens with no subject claim", async () => {
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("rejects tokens older than the declared session lifetime", async () => {
    const key = new TextEncoder().encode(secret);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      email: claims.email,
      merchantId: claims.merchantId,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("tab")
      .setAudience("tab-web")
      .setSubject(claims.userId)
      .setIssuedAt(now - 86401)
      .setExpirationTime(now + 60)
      .sign(key);

    await expect(readSessionToken(token, secret)).rejects.toThrow();
  });

  it("refuses secrets shorter than 32 bytes", async () => {
    await expect(createSessionToken(claims, "too-short")).rejects.toThrow(
      "SESSION_SECRET must be at least 32 bytes",
    );
  });

  it("uses hardened cookie attributes", () => {
    expect(sessionCookieOptions(true)).toEqual({
      httpOnly: true,
      maxAge: 86400,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
