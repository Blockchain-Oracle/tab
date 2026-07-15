import { type NextRequest, NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { cronAuthorizationIsValid } from "../../../../lib/auth/cron-auth";
import { getServerDatabase } from "../../../../lib/db/server";
import { drainWebhookDeliveryQueue } from "../../../../lib/webhooks/worker";

export async function GET(request: NextRequest) {
  if (!cronAuthorizationIsValid(request.headers.get("authorization"))) {
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
