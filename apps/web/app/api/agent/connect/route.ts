import type { NextRequest } from "next/server";

import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import { jsonError, jsonNoStore } from "../../../../lib/http/responses";
import {
  connectAgent,
  InvalidConnectRequestError,
  parseConnectRequest,
} from "../../../../lib/leash/connect";
import { readSignRequestBody, SignRequestBodyError } from "../sign/sign-request-body";

export async function POST(request: NextRequest) {
  const db = getServerDatabase().db;
  let agentId: string;
  try {
    ({ agentId } = await authenticateLeashKey(db, request.headers.get("authorization")));
  } catch (authError) {
    if (authError instanceof InvalidLeashKeyError) {
      return jsonError("UNAUTHORIZED", "Authentication is required.", 401);
    }
    throw authError;
  }

  let input: ReturnType<typeof parseConnectRequest>;
  try {
    input = parseConnectRequest(await readSignRequestBody(request));
  } catch (parseError) {
    if (
      parseError instanceof InvalidConnectRequestError ||
      parseError instanceof SignRequestBodyError
    ) {
      return jsonError("INVALID_CONNECT_REQUEST", "The connect request is invalid.", 400);
    }
    throw parseError;
  }

  try {
    const connected = await connectAgent(db, { agentId, ...input });
    return jsonNoStore({
      agent: { address: connected.agentAddress },
      client: {
        connectionCount: connected.connectionCount,
        firstSeenAt: connected.firstSeenAt.toISOString(),
        lastSeenAt: connected.lastSeenAt.toISOString(),
        name: connected.clientName ?? "Unknown client",
        transport: connected.transport,
        version: connected.clientVersion,
      },
      paymentProfile: connected.paymentProfile,
    });
  } catch (connectError) {
    console.error("agent/connect failed", connectError);
    return jsonError("CONNECT_FAILED", "The connect request could not be processed.", 500);
  }
}
