import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { getServerDatabase } from "../../../../lib/db/server";
import { drainWebhookDeliveryQueue } from "../../../../lib/webhooks/worker";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorization, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized." } },
      { headers: NO_STORE_HEADERS, status: 401 },
    );
  }

  try {
    const work = await drainWebhookDeliveryQueue(getServerDatabase().db);
    return NextResponse.json({ ok: true, work }, { headers: NO_STORE_HEADERS, status: 200 });
  } catch {
    console.error("Webhook outbox sweep failed");
    return NextResponse.json(
      {
        error: {
          code: "WEBHOOK_SWEEP_FAILED",
          message: "Webhook delivery recovery did not complete.",
        },
      },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
}
