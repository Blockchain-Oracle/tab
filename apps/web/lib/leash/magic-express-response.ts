import type { MagicProviderStage } from "./magic-provider-diagnostics";

export type MagicExpressErrorCode =
  | "SIGNER_NOT_CONFIGURED"
  | "SIGNER_PROVIDER_REJECTED"
  | "SIGNER_PROVIDER_RATE_LIMITED"
  | "SIGNER_PROVIDER_UNAVAILABLE"
  | "SIGNER_PROVIDER_TIMEOUT"
  | "SIGNER_PROVIDER_INVALID_RESPONSE"
  | "SIGNER_IDENTITY_MISMATCH";

export class MagicExpressError extends Error {
  readonly providerCode: string | undefined;
  readonly providerHints: readonly string[];
  readonly providerStage: MagicProviderStage | undefined;
  readonly providerStatus: number | undefined;
  readonly providerTraceId: string | undefined;

  constructor(
    readonly code: MagicExpressErrorCode,
    options: {
      providerCode?: string;
      providerHints?: readonly string[];
      providerStage?: MagicProviderStage;
      providerStatus?: number;
      providerTraceId?: string;
    } = {},
  ) {
    super("The wallet signer request could not be completed.");
    this.name = "MagicExpressError";
    this.providerCode = options.providerCode;
    this.providerHints = options.providerHints ?? [];
    this.providerStage = options.providerStage;
    this.providerStatus = options.providerStatus;
    this.providerTraceId = options.providerTraceId;
  }
}

export function isMagicResponseObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rejectInvalidResponse(response: Response): Promise<never> {
  try {
    await response.body?.cancel();
  } catch {
    // Provider streams are untrusted; cancellation failure must not mask invalid data.
  }
  throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
}

export async function readBoundedMagicJson(response: Response, maximumBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    return rejectInvalidResponse(response);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return rejectInvalidResponse(response);
  }
  if (!response.body) return rejectInvalidResponse(response);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the invalid-response classification if cancellation itself fails.
        }
        throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined)) as unknown;
  } catch {
    throw new MagicExpressError("SIGNER_PROVIDER_INVALID_RESPONSE");
  }
}
