import "server-only";

const PROVIDER_CODE = /^[A-Z][A-Z0-9_:-]{0,63}$/;
const TRACE_ID = /^express-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const HINTS = [
  ["api key", /\bapi[ _-]?key\b/i],
  ["audience", /\baudience\b/i],
  ["credentials", /\bcredentials?\b/i],
  ["domain", /\bdomain\b/i],
  ["expired", /\bexpired?\b/i],
  ["issuer", /\bissuer\b/i],
  ["jwks", /\bjwks?\b/i],
  ["jwt", /\bjwts?\b/i],
  ["provider", /\bproviders?\b/i],
  ["signature", /\bsignatures?\b/i],
] as const;

export type MagicProviderStage =
  | "AUTHENTICATION"
  | "AUDIENCE"
  | "ISSUER"
  | "JWKS"
  | "REFERRER"
  | "SIGNATURE_VERIFICATION"
  | "TOKEN_DECODE"
  | "TOKEN_EXPIRED"
  | "WALLET_CREATION";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stage(detail: string): MagicProviderStage | undefined {
  if (/httpstatuserror occurred during v\d+ wallet creation/i.test(detail)) {
    return "WALLET_CREATION";
  }
  if (/error decoding token claims/i.test(detail)) return "TOKEN_DECODE";
  if (/signature verification failed/i.test(detail)) return "SIGNATURE_VERIFICATION";
  if (/missing x-magic-referrer or referer header/i.test(detail)) return "REFERRER";
  if (/not authenticated/i.test(detail)) return "AUTHENTICATION";
  if (/\bexpired?\b/i.test(detail)) return "TOKEN_EXPIRED";
  if (/\baudience\b/i.test(detail)) return "AUDIENCE";
  if (/\bissuer\b/i.test(detail)) return "ISSUER";
  if (/\bjwks?\b/i.test(detail)) return "JWKS";
  return undefined;
}

async function boundedText(response: Response, maximumBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    await response.body?.cancel().catch(() => undefined);
    return "";
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        return "";
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
  return new TextDecoder().decode(joined);
}

export async function readMagicProviderDiagnostics(response: Response, maximumBytes: number) {
  const trace = response.headers.get("x-magic-trace-id");
  const providerTraceId = trace && TRACE_ID.test(trace) ? trace : undefined;
  let serialized = "";
  let body: unknown;
  try {
    serialized = await boundedText(response, maximumBytes);
    body = JSON.parse(serialized) as unknown;
  } catch {
    body = undefined;
  }
  const nestedError = record(body) && record(body.error) ? body.error : undefined;
  const candidate = nestedError?.code ?? (record(body) ? body.code : undefined);
  const providerCode =
    typeof candidate === "string" && PROVIDER_CODE.test(candidate) ? candidate : undefined;
  const detail = record(body) && typeof body.detail === "string" ? body.detail : "";
  const providerStage = stage(detail);
  const providerHints = HINTS.filter(([, pattern]) => pattern.test(serialized)).map(
    ([hint]) => hint,
  );
  return {
    ...(providerCode ? { providerCode } : {}),
    providerHints,
    ...(providerStage ? { providerStage } : {}),
    ...(providerTraceId ? { providerTraceId } : {}),
  };
}
