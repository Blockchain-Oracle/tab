import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  readWebhookEndpoint,
  updateWebhookEndpoint,
} from "../../../lib/dashboard/webhooks-endpoints";
import {
  localWebhookTestOptions,
  readWebhookUrl,
  requireWebhookMerchant,
  requireWebhookMutationOrigin,
  webhookRouteFailure,
} from "../../../lib/dashboard/webhooks-http";
import { getServerDatabase } from "../../../lib/db/server";

const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    const principal = await requireWebhookMerchant(request);
    const endpoint = await readWebhookEndpoint(getServerDatabase().db, principal);
    return NextResponse.json({ endpoint }, { headers: noStore });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireWebhookMutationOrigin(request);
    const principal = await requireWebhookMerchant(request);
    const url = await readWebhookUrl(request);
    const result = await createWebhookEndpoint(
      getServerDatabase().db,
      principal,
      url,
      localWebhookTestOptions(),
    );
    return NextResponse.json(result, { headers: noStore, status: 201 });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireWebhookMutationOrigin(request);
    const principal = await requireWebhookMerchant(request);
    const url = await readWebhookUrl(request);
    const endpoint = await updateWebhookEndpoint(
      getServerDatabase().db,
      principal,
      url,
      localWebhookTestOptions(),
    );
    return NextResponse.json({ endpoint }, { headers: noStore });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireWebhookMutationOrigin(request);
    const principal = await requireWebhookMerchant(request);
    await deleteWebhookEndpoint(getServerDatabase().db, principal);
    return new NextResponse(null, { headers: noStore, status: 204 });
  } catch (error) {
    return webhookRouteFailure(error);
  }
}
