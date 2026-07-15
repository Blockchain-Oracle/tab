import { type NextRequest, NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "../../../../lib/auth/api-key-http";
import { cronAuthorizationIsValid } from "../../../../lib/auth/cron-auth";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  drainLiveSettlementQueue,
  LiveSettlementVerificationBlockedError,
} from "../../../../lib/payments/settlement-worker";
import { liveSettlementVerificationAvailable } from "../../../../lib/payments/verify";

function blockedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED",
        message: "Live settlement verification awaits the funded B-04 integration spike.",
      },
    },
    { headers: NO_STORE_HEADERS, status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!cronAuthorizationIsValid(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized." } },
      { headers: NO_STORE_HEADERS, status: 401 },
    );
  }
  if (!liveSettlementVerificationAvailable()) return blockedResponse();

  try {
    const work = await drainLiveSettlementQueue(getServerDatabase().db);
    return NextResponse.json({ ok: true, work }, { headers: NO_STORE_HEADERS, status: 200 });
  } catch (error) {
    if (error instanceof LiveSettlementVerificationBlockedError) {
      return blockedResponse();
    }
    console.error("Live settlement sweep failed");
    return NextResponse.json(
      {
        error: {
          code: "SETTLEMENT_SWEEP_FAILED",
          message: "Live settlement verification did not complete.",
        },
      },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
}
