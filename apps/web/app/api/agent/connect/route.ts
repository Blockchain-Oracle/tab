import { type NextRequest, NextResponse } from "next/server";

import { authenticateLeashKey, InvalidLeashKeyError } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  connectAgent,
  InvalidConnectRequestError,
  parseConnectRequest,
} from "../../../../lib/leash/connect";
import { readSignRequestBody, SignRequestBodyError } from "../sign/sign-request-body";

const NO_STORE = { "cache-control": "no-store" };

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { headers: NO_STORE, status });
}

export async function POST(request: NextRequest) {
  const db = getServerDatabase().db;
  let agentId: string;
  try {
    ({ agentId } = await authenticateLeashKey(db, request.headers.get("authorization")));
  } catch (authError) {
    if (authError instanceof InvalidLeashKeyError) {
      return error("UNAUTHORIZED", "Authentication is required.", 401);
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
      return error("INVALID_CONNECT_REQUEST", "The connect request is invalid.", 400);
    }
    throw parseError;
  }

  const connected = await connectAgent(db, { agentId, ...input });
  return NextResponse.json(
    {
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
    },
    { headers: NO_STORE, status: 200 },
  );
}
