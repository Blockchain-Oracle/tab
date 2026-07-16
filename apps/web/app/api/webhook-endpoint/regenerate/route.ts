import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { regenerateWebhookSecret } from "../../../../lib/dashboard/webhooks-endpoints";
import {
  requireWebhookMerchant,
  requireWebhookMutationOrigin,
  webhookRouteFailure,
} from "../../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../../lib/db/server";

export async function POST(request: NextRequest) {
  try {
    requireWebhookMutationOrigin(request);
    const principal = await requireWebhookMerchant(request);
    const result = await regenerateWebhookSecret(getServerDatabase().db, principal);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}
