import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listDashboardWebhookDeliveries } from "../../../lib/dashboard/webhooks-delivery-log";
import { requireWebhookMerchant, webhookRouteFailure } from "../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../lib/db/server";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireWebhookMerchant(request);
    const deliveries = await listDashboardWebhookDeliveries(getServerDatabase().db, principal);
    return NextResponse.json({ deliveries }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}
