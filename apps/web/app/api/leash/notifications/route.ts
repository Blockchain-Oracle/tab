import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../lib/db/server";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";
import {
  InvalidNotificationInputError,
  parseNotificationMutation,
  parseNotificationQuery,
} from "../../../../lib/leash/notification-input";
import {
  LeashNotificationNotFoundError,
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
} from "../../../../lib/leash/notification-store";

async function owner(request: NextRequest) {
  const result = await requireOwnerRequest(request);
  return result instanceof Response ? { response: result } : { principal: result };
}

function notFound(error: unknown) {
  if (error instanceof LeashNotificationNotFoundError) {
    return leashError("LEASH_RESOURCE_NOT_FOUND", error.message, 404);
  }
  throw error;
}

export async function GET(request: NextRequest) {
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let query: ReturnType<typeof parseNotificationQuery>;
  try {
    query = parseNotificationQuery(request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof InvalidNotificationInputError) {
      return leashError("INVALID_NOTIFICATION_INPUT", error.message, 400);
    }
    throw error;
  }

  try {
    const result = await listOwnerNotifications(getServerDatabase().db, {
      ...query,
      ownerId: authenticated.principal.userId,
    });
    return NextResponse.json(result, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    return notFound(error);
  }
}

export async function PATCH(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const authenticated = await owner(request);
  if (authenticated.response) return authenticated.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  let mutation: ReturnType<typeof parseNotificationMutation>;
  try {
    mutation = parseNotificationMutation(body);
  } catch (error) {
    if (error instanceof InvalidNotificationInputError) {
      return leashError("INVALID_NOTIFICATION_INPUT", error.message, 400);
    }
    throw error;
  }

  const database = getServerDatabase().db;
  const scope = {
    agentId: mutation.agentId,
    now: new Date(),
    ownerId: authenticated.principal.userId,
  };
  try {
    const result =
      mutation.action === "read_one"
        ? await markOwnerNotificationRead(database, {
            ...scope,
            notificationId: mutation.notificationId,
          })
        : await markAllOwnerNotificationsRead(database, scope);
    return NextResponse.json(result, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    return notFound(error);
  }
}
