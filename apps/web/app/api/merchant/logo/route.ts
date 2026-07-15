import { head } from "@vercel/blob";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "../../../../lib/auth/session-principal";
import { consumeLogoUploadGrant } from "../../../../lib/db/logo-upload-rate-limit";
import { merchants } from "../../../../lib/db/schema";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  completedLogoIsAllowed,
  LOGO_CONTENT_TYPES,
  logoUploadRequestIsAllowed,
  MAX_LOGO_BYTES,
} from "./logo-policy";
import { logoWriteConditions } from "./logo-write-conditions";

class LogoUploadRateLimitError extends Error {}

function error(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: { "cache-control": "no-store" }, status },
  );
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim();
}

function isUploadBody(value: unknown): value is HandleUploadBody {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "blob.upload-completed") {
    return "payload" in value && typeof value.payload === "object" && value.payload !== null;
  }
  if (value.type !== "blob.generate-client-token" || !("payload" in value)) return false;

  const payload = value.payload;
  return (
    typeof payload === "object" &&
    payload !== null &&
    "pathname" in payload &&
    typeof payload.pathname === "string" &&
    "multipart" in payload &&
    typeof payload.multipart === "boolean" &&
    "clientPayload" in payload &&
    (payload.clientPayload === null || typeof payload.clientPayload === "string")
  );
}

async function authenticatedMerchant(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;

  try {
    return await loadMerchantSession(getServerDatabase().db, token);
  } catch (sessionError) {
    if (
      sessionError instanceof InvalidMerchantSessionError ||
      sessionError instanceof InactiveMerchantSessionError
    ) {
      return undefined;
    }
    throw sessionError;
  }
}

export async function POST(request: NextRequest) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return error("INVALID_UPLOAD_REQUEST", "The upload request is invalid.", 400);
  }
  if (!isUploadBody(parsedBody)) {
    return error("INVALID_UPLOAD_REQUEST", "The upload request is invalid.", 400);
  }
  const body = parsedBody;

  let principal: Awaited<ReturnType<typeof authenticatedMerchant>>;
  if (body.type === "blob.generate-client-token") {
    if (!requestOriginIsAllowed(request)) {
      return error("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
    }
    principal = await authenticatedMerchant(request);
    if (!principal) {
      return error("SESSION_REQUIRED", "A valid merchant session is required.", 401);
    }
  }

  const token = blobToken();
  if (!token) {
    return error("LOGO_STORAGE_NOT_CONFIGURED", "Logo storage is not configured.", 503);
  }

  try {
    const response = await handleUpload({
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!principal || !logoUploadRequestIsAllowed(pathname, principal.merchantId)) {
          throw new Error("UPLOAD_NOT_ALLOWED");
        }
        if (!(await consumeLogoUploadGrant(getServerDatabase().db, principal.merchantId))) {
          throw new LogoUploadRateLimitError();
        }
        const writeConditions = await logoWriteConditions(pathname, token);
        return {
          addRandomSuffix: false,
          allowedContentTypes: [...LOGO_CONTENT_TYPES],
          cacheControlMaxAge: 60,
          maximumSizeInBytes: MAX_LOGO_BYTES,
          ...writeConditions,
        };
      },
      request,
      token,
    });
    return NextResponse.json(response, { headers: { "cache-control": "no-store" } });
  } catch (uploadError) {
    if (uploadError instanceof LogoUploadRateLimitError) {
      return error("LOGO_UPLOAD_RATE_LIMITED", "Try another logo upload later.", 429);
    }
    return error("UPLOAD_NOT_ALLOWED", "The logo upload could not be authorized.", 400);
  }
}

export async function PUT(request: NextRequest) {
  if (!requestOriginIsAllowed(request)) {
    return error("ORIGIN_NOT_ALLOWED", "Request origin is not allowed.", 403);
  }
  const principal = await authenticatedMerchant(request);
  if (!principal) {
    return error("SESSION_REQUIRED", "A valid merchant session is required.", 401);
  }
  const token = blobToken();
  if (!token) {
    return error("LOGO_STORAGE_NOT_CONFIGURED", "Logo storage is not configured.", 503);
  }

  let completed: { etag: string; url: string } | undefined;
  try {
    const body = (await request.json()) as unknown;
    completed =
      typeof body === "object" &&
      body !== null &&
      "etag" in body &&
      typeof body.etag === "string" &&
      "url" in body &&
      typeof body.url === "string"
        ? { etag: body.etag, url: body.url }
        : undefined;
  } catch {
    completed = undefined;
  }
  if (!completed) return error("INVALID_LOGO", "A completed logo upload is required.", 400);

  try {
    const blob = await head(completed.url, { token });
    if (!completedLogoIsAllowed(blob, principal.merchantId, completed.etag)) {
      return error("INVALID_LOGO", "The uploaded logo is not valid for this merchant.", 400);
    }
    await getServerDatabase()
      .db.update(merchants)
      .set({ logoEtag: blob.etag, logoUrl: blob.url })
      .where(eq(merchants.id, principal.merchantId));
    return NextResponse.json(
      { logoEtag: blob.etag, logoUrl: blob.url },
      { headers: { "cache-control": "no-store" }, status: 200 },
    );
  } catch {
    return error("INVALID_LOGO", "The uploaded logo could not be verified.", 400);
  }
}
