import "server-only";

import {
  getAddress,
  type Hex,
  hashTypedData,
  isAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  serializeSignature,
} from "viem";

import {
  isMagicResponseObject,
  MagicExpressError,
  type MagicExpressErrorCode,
  readBoundedMagicJson,
} from "./magic-express-response";
import {
  InvalidMagicOidcSubjectError,
  MagicOidcConfigurationError,
  magicOidcJwks,
  mintMagicAgentJwt,
} from "./magic-oidc";
import { readMagicProviderDiagnostics } from "./magic-provider-diagnostics";

export type { MagicExpressErrorCode } from "./magic-express-response";
export { MagicExpressError } from "./magic-express-response";

const EXPRESS_BASE_URL = "https://tee.express.magiclabs.com";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16_384;
const HEX_32 = /^0x[0-9a-fA-F]{64}$/;

type Environment = Readonly<Record<string, string | undefined>>;
type TypedDataInput = Parameters<typeof hashTypedData>[0];

function configuredValue(environment: Environment, name: string) {
  const value = environment[name];
  if (!value || value.trim() !== value || value.length > 512) {
    throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
  }
  return value;
}

function providerStatus(status: number): MagicExpressErrorCode {
  if (status === 429) return "SIGNER_PROVIDER_RATE_LIMITED";
  if (status >= 400 && status < 500) return "SIGNER_PROVIDER_REJECTED";
  return "SIGNER_PROVIDER_UNAVAILABLE";
}

interface MagicExpressClientOptions {
  environment?: Environment;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
  timeoutMs?: number;
}

class MagicExpressClient {
  readonly #environment: Environment;
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxResponseBytes: number;
  readonly #timeoutMs: number;

  constructor(options: MagicExpressClientOptions) {
    this.#environment = options.environment ?? process.env;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(this.#maxResponseBytes) ||
      this.#maxResponseBytes < 1_024 ||
      this.#maxResponseBytes > 64 * 1_024 ||
      !Number.isSafeInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      this.#timeoutMs > 30_000
    ) {
      throw new Error("Magic Express request bounds are invalid");
    }
  }

  async #request(path: string, subject: string, body: Record<string, unknown>) {
    // Server Wallets may live in a separate Magic app from embedded auth:
    // prefer its dedicated secret, fall back to the shared one.
    const secretKey = this.#environment.MAGIC_TEE_SECRET_KEY?.trim()
      ? configuredValue(this.#environment, "MAGIC_TEE_SECRET_KEY")
      : configuredValue(this.#environment, "MAGIC_SECRET_KEY");
    const providerId = configuredValue(this.#environment, "MAGIC_OIDC_PROVIDER_ID");
    let token: string;
    try {
      token = await mintMagicAgentJwt(subject, { environment: this.#environment });
    } catch (error) {
      if (error instanceof InvalidMagicOidcSubjectError) {
        throw new MagicExpressError("SIGNER_IDENTITY_MISMATCH");
      }
      if (error instanceof MagicOidcConfigurationError) {
        throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
      }
      throw error;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    try {
      const response = await this.#fetch(`${EXPRESS_BASE_URL}${path}`, {
        body: JSON.stringify(body),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-magic-chain": "ETH",
          "x-magic-secret-key": secretKey,
          "x-oidc-provider-id": providerId,
        },
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        const diagnostics = await readMagicProviderDiagnostics(response, this.#maxResponseBytes);
        throw new MagicExpressError(providerStatus(response.status), {
          ...diagnostics,
          providerStatus: response.status,
        });
      }
      return await readBoundedMagicJson(response, this.#maxResponseBytes);
    } catch (error) {
      if (error instanceof MagicExpressError) throw error;
      throw new MagicExpressError(
        timedOut ? "SIGNER_PROVIDER_TIMEOUT" : "SIGNER_PROVIDER_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getOrCreateWallet(subject: string) {
    const response = await this.#request("/v2/wallet", subject, {});
    if (!isMagicResponseObject(response) || typeof response.public_address !== "string") {
      throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
    }
    try {
      return getAddress(response.public_address);
    } catch {
      throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
    }
  }

  async signTypedData(options: {
    address: `0x${string}`;
    subject: string;
    typedData: TypedDataInput;
  }) {
    if (!isAddress(options.address)) {
      throw new MagicExpressError("SIGNER_IDENTITY_MISMATCH");
    }
    const digest = hashTypedData(options.typedData);
    const response = await this.#request("/v2/wallet/sign/data", options.subject, {
      chain: "ETH",
      raw_data_hash: digest,
    });
    if (
      !isMagicResponseObject(response) ||
      typeof response.r !== "string" ||
      !HEX_32.test(response.r) ||
      typeof response.s !== "string" ||
      !HEX_32.test(response.s) ||
      (typeof response.v !== "string" && typeof response.v !== "number") ||
      ![27, 28].includes(Number(response.v)) ||
      typeof response.message_hash !== "string" ||
      response.message_hash.toLowerCase() !== digest.toLowerCase()
    ) {
      throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
    }
    const yParity = (Number(response.v) - 27) as 0 | 1;
    const signature = serializeSignature({
      r: response.r as Hex,
      s: response.s as Hex,
      yParity,
    });
    try {
      const recovered = await recoverTypedDataAddress({ ...options.typedData, signature });
      if (!isAddressEqual(recovered, options.address)) {
        throw new MagicExpressError("SIGNER_IDENTITY_MISMATCH");
      }
    } catch (error) {
      if (error instanceof MagicExpressError) throw error;
      throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
    }
    return { digest, signature };
  }
}

export function createMagicExpressClient(options: MagicExpressClientOptions = {}) {
  return new MagicExpressClient(options);
}

export function isMagicExpressConfigured(environment: Environment = process.env) {
  try {
    if (environment.MAGIC_TEE_SECRET_KEY?.trim()) {
      configuredValue(environment, "MAGIC_TEE_SECRET_KEY");
    } else {
      configuredValue(environment, "MAGIC_SECRET_KEY");
    }
    configuredValue(environment, "MAGIC_OIDC_PROVIDER_ID");
    magicOidcJwks(environment);
    return true;
  } catch {
    return false;
  }
}
