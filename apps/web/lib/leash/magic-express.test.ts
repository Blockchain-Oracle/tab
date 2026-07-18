import { generateKeyPairSync } from "node:crypto";

import { decodeJwt } from "jose";
import { hashTypedData, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createMagicExpressClient,
  isMagicExpressConfigured,
  MagicExpressError,
} from "./magic-express";

const payer = privateKeyToAccount(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);
const subject = `agent_${"a".repeat(43)}`;
const typedData = {
  domain: {
    chainId: 84_532,
    name: "USDC",
    verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    version: "2",
  },
  message: {
    from: payer.address,
    nonce: `0x${"12".repeat(32)}` as const,
    to: "0x1111111111111111111111111111111111111111" as const,
    validAfter: BigInt(0),
    validBefore: BigInt(1_784_358_300),
    value: BigInt(1_000),
  },
  primaryType: "TransferWithAuthorization" as const,
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
};

function environment() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  return {
    MAGIC_OIDC_AUDIENCE: "tab-magic-express",
    MAGIC_OIDC_ISSUER: "https://tab-live.example.test",
    MAGIC_OIDC_KEY_ID: "tab-oidc-2026-07",
    MAGIC_OIDC_PRIVATE_KEY_B64: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    MAGIC_OIDC_PROVIDER_ID: "provider-test",
    MAGIC_SECRET_KEY: "sk_test_never-log-this-value",
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("strict Magic Express client", () => {
  it("reports availability only when the complete signer configuration is valid", () => {
    expect(isMagicExpressConfigured(environment())).toBe(true);
    expect(isMagicExpressConfigured({})).toBe(false);
    expect(isMagicExpressConfigured({ ...environment(), MAGIC_OIDC_PROVIDER_ID: undefined })).toBe(
      false,
    );
  });

  it("does not mislabel a corrupt persisted subject as missing signer configuration", async () => {
    const client = createMagicExpressClient({
      environment: environment(),
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(client.getOrCreateWallet("not-an-opaque-agent-subject")).rejects.toMatchObject({
      code: "SIGNER_IDENTITY_MISMATCH",
    });
  });

  it("provisions through the current v2 contract and keeps the identity JWT secret", async () => {
    const requests: Array<{ body: string; headers: Headers; url: string }> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
        url: String(input),
      });
      return json({ public_address: payer.address });
    });
    const client = createMagicExpressClient({ environment: environment(), fetch: request });

    await expect(client.getOrCreateWallet(subject)).resolves.toBe(payer.address);
    expect(request).toHaveBeenCalledOnce();
    expect(requests[0]?.url).toBe("https://tee.express.magiclabs.com/v2/wallet");
    expect(requests[0]?.body).toBe("{}");
    expect(requests[0]?.headers.get("x-magic-chain")).toBe("ETH");
    expect(requests[0]?.headers.get("x-oidc-provider-id")).toBe("provider-test");
    expect(requests[0]?.headers.get("x-magic-secret-key")).toBe("sk_test_never-log-this-value");
    expect(request.mock.calls[0]?.[1]?.redirect).toBe("error");
    const token = requests[0]?.headers.get("authorization")?.replace(/^Bearer /, "");
    expect(token).toBeTruthy();
    expect(decodeJwt(token ?? "")).toMatchObject({ sub: subject });
    expect(JSON.stringify(await client.getOrCreateWallet(subject))).not.toContain("Bearer");
  });

  it("hashes exact typed data, reconstructs r/s/v, and requires signer recovery", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      const digest = requestBody?.raw_data_hash as `0x${string}`;
      const signature = await payer.sign({ hash: digest });
      const parsed = parseSignature(signature);
      return json({
        message_hash: digest,
        r: parsed.r,
        s: parsed.s,
        v: String(parsed.v),
      });
    });
    const client = createMagicExpressClient({ environment: environment(), fetch: request });

    const result = await client.signTypedData({ address: payer.address, subject, typedData });

    expect(requestBody).toEqual({
      chain: "ETH",
      raw_data_hash: hashTypedData(typedData),
    });
    expect(result).toEqual({ digest: hashTypedData(typedData), signature: expect.any(String) });
    expect(result.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it("rejects a valid signature from any address other than the provisioned agent", async () => {
    const other = privateKeyToAccount(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const digest = JSON.parse(String(init?.body)).raw_data_hash as `0x${string}`;
      const parsed = parseSignature(await other.sign({ hash: digest }));
      return json({ message_hash: digest, r: parsed.r, s: parsed.s, v: String(parsed.v) });
    });
    const client = createMagicExpressClient({ environment: environment(), fetch: request });

    await expect(
      client.signTypedData({ address: payer.address, subject, typedData }),
    ).rejects.toMatchObject({ code: "SIGNER_IDENTITY_MISMATCH" });
  });

  it("rejects a response that omits or changes the exact signed digest", async () => {
    const responseFor = (messageHash?: string) =>
      vi.fn<typeof fetch>(async (_input, init) => {
        const digest = JSON.parse(String(init?.body)).raw_data_hash as `0x${string}`;
        const parsed = parseSignature(await payer.sign({ hash: digest }));
        return json({
          ...(messageHash ? { message_hash: messageHash } : {}),
          r: parsed.r,
          s: parsed.s,
          v: String(parsed.v),
        });
      });

    for (const request of [responseFor(), responseFor(`0x${"00".repeat(32)}`)]) {
      const client = createMagicExpressClient({ environment: environment(), fetch: request });
      await expect(
        client.signTypedData({ address: payer.address, subject, typedData }),
      ).rejects.toMatchObject({ code: "SIGNER_PROVIDER_INVALID_RESPONSE" });
    }
  });

  it.each([
    [401, "SIGNER_PROVIDER_REJECTED"],
    [403, "SIGNER_PROVIDER_REJECTED"],
    [429, "SIGNER_PROVIDER_RATE_LIMITED"],
    [500, "SIGNER_PROVIDER_UNAVAILABLE"],
  ])("maps provider status %s without exposing its body", async (status, code) => {
    const secretBody = "provider leaked jwt=secret-token";
    const request = vi.fn<typeof fetch>(async () => new Response(secretBody, { status }));
    const client = createMagicExpressClient({ environment: environment(), fetch: request });

    const error = await client.getOrCreateWallet(subject).catch((caught) => caught);
    expect(error).toBeInstanceOf(MagicExpressError);
    expect(error).toMatchObject({ code, providerStatus: status });
    expect(String(error)).not.toContain(secretBody);
    expect(request).toHaveBeenCalledOnce();
  });

  it("retains only bounded allowlisted diagnostics from a provider rejection", async () => {
    const providerMessage = "JWT signature failed for a sensitive subject";
    const client = createMagicExpressClient({
      environment: environment(),
      fetch: async () => json({ error: { code: "INVALID_JWT", message: providerMessage } }, 401),
    });

    const error = await client.getOrCreateWallet(subject).catch((caught) => caught);
    expect(error).toMatchObject({
      code: "SIGNER_PROVIDER_REJECTED",
      providerCode: "INVALID_JWT",
      providerHints: ["jwt", "signature"],
      providerStatus: 401,
    });
    expect(String(error)).not.toContain(providerMessage);
  });

  it("retains only a fixed wallet-creation stage and validated Magic trace ID", async () => {
    const traceId = "express-0685e1c2-382a-41c4-b495-d5806d2a60e7";
    const client = createMagicExpressClient({
      environment: environment(),
      fetch: async () =>
        new Response(
          JSON.stringify({ detail: "HTTPStatusError occurred during v2 wallet creation." }),
          {
            headers: {
              "content-type": "application/json",
              "x-magic-trace-id": traceId,
            },
            status: 401,
          },
        ),
    });

    const error = await client.getOrCreateWallet(subject).catch((caught) => caught);
    expect(error).toMatchObject({
      code: "SIGNER_PROVIDER_REJECTED",
      providerStage: "WALLET_CREATION",
      providerStatus: 401,
      providerTraceId: traceId,
    });
    expect(JSON.stringify(error)).not.toContain("HTTPStatusError");
  });

  it("distinguishes absent configuration, timeout, and oversized invalid responses", async () => {
    const missing = createMagicExpressClient({ environment: {} });
    await expect(missing.getOrCreateWallet(subject)).rejects.toMatchObject({
      code: "SIGNER_NOT_CONFIGURED",
    });

    const waiting = vi.fn<typeof fetch>(async (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });
    const timeout = createMagicExpressClient({
      environment: environment(),
      fetch: waiting,
      timeoutMs: 5,
    });
    await expect(timeout.getOrCreateWallet(subject)).rejects.toMatchObject({
      code: "SIGNER_PROVIDER_TIMEOUT",
    });

    const oversized = createMagicExpressClient({
      environment: environment(),
      fetch: async () => new Response("x".repeat(17_000), { status: 200 }),
      maxResponseBytes: 16_384,
    });
    await expect(oversized.getOrCreateWallet(subject)).rejects.toMatchObject({
      code: "SIGNER_PROVIDER_INVALID_RESPONSE",
    });
  });
});
