import { type NextRequest, NextResponse } from "next/server";

import type { ApiKeyPermissions } from "../../../lib/auth/api-key";
import { createSecretApiKey, listApiKeys } from "../../../lib/dashboard/api-keys";
import {
  authenticatedMerchant,
  KEY_RESPONSE_HEADERS,
  keyError,
  requestedKeyEnvironment,
  requireAllowedOrigin,
} from "../../../lib/dashboard/api-keys-http";
import { getServerDatabase } from "../../../lib/db/server";

const MAX_KEY_NAME_LENGTH = 100;

async function requestBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function parseCreateBody(
  body: unknown,
): { name: string; permissions: ApiKeyPermissions } | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "name" && key !== "permissions")) {
    return undefined;
  }
  if (
    (record.name !== undefined && typeof record.name !== "string") ||
    (typeof record.name === "string" && record.name.trim().length > MAX_KEY_NAME_LENGTH) ||
    (record.permissions !== "full" && record.permissions !== "read_only")
  ) {
    return undefined;
  }
  const permissions = record.permissions;
  if (permissions !== "full" && permissions !== "read_only") return undefined;
  return {
    name: typeof record.name === "string" ? record.name : "Unnamed key",
    permissions,
  };
}

export async function GET(request: NextRequest) {
  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return keyError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }
  const env = requestedKeyEnvironment(request, principal.mode);
  if (!env) return keyError("INVALID_ENVIRONMENT", "Environment must be test or live.", 400);

  const keys = await listApiKeys(getServerDatabase().db, {
    env,
    merchantId: principal.merchantId,
  });
  return NextResponse.json({ keys }, { headers: KEY_RESPONSE_HEADERS, status: 200 });
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) return originError;

  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return keyError("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }
  const env = requestedKeyEnvironment(request, principal.mode);
  if (!env) return keyError("INVALID_ENVIRONMENT", "Environment must be test or live.", 400);

  const input = parseCreateBody(await requestBody(request));
  if (!input) {
    return keyError(
      "INVALID_KEY_INPUT",
      `Use an optional key name of ${MAX_KEY_NAME_LENGTH} characters or fewer and choose Full access or Read-only.`,
      400,
    );
  }

  const created = await createSecretApiKey(getServerDatabase().db, {
    ...input,
    env,
    merchantId: principal.merchantId,
  });
  return NextResponse.json(created, { headers: KEY_RESPONSE_HEADERS, status: 201 });
}
