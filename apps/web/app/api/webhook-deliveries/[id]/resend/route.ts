import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resendDashboardWebhookDelivery } from "../../../../../lib/dashboard/webhooks-delivery-log";
import {
  localWebhookTestOptions,
  requireWebhookMerchant,
  requireWebhookMutationOrigin,
  webhookRouteFailure,
} from "../../../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../../../lib/db/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    requireWebhookMutationOrigin(request);
    const principal = await requireWebhookMerchant(request);
    const { id } = await context.params;
    const delivery = await resendDashboardWebhookDelivery(
      getServerDatabase().db,
      principal,
      id,
      localWebhookTestOptions(),
    );
    return NextResponse.json(
      { delivery },
      { headers: { "cache-control": "no-store" }, status: 201 },
    );
  } catch (error) {
    return webhookRouteFailure(error);
  }
}
