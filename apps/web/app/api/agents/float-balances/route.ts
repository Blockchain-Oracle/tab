import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../lib/db/server";
import { readLeashFloatBalances } from "../../../../lib/leash/fund-balances";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../lib/leash/owner-agents";
import { BASE_SEPOLIA_INTEGRATION_PROFILE } from "../../../../lib/leash/payment-profile";
import { TEST_FUNDS_LABEL } from "../../../../lib/leash/test-funds";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAgentQuery(params: URLSearchParams) {
  const keys = [...params.keys()];
  const values = params.getAll("agentId");
  if (
    keys.length !== 1 ||
    keys[0] !== "agentId" ||
    values.length !== 1 ||
    !UUID.test(values[0] ?? "")
  ) {
    return null;
  }
  return values[0] ?? null;
}

function readHealth(floats: Awaited<ReturnType<typeof readLeashFloatBalances>>) {
  if (!floats) return "unavailable" as const;
  const available = floats.filter((item) => item.balanceAtomic !== null).length;
  if (available === floats.length) return "healthy" as const;
  return available > 0 ? ("partial" as const) : ("unavailable" as const);
}

export async function GET(request: NextRequest) {
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  const agentId = parseAgentQuery(request.nextUrl.searchParams);
  if (!agentId) return leashError("INVALID_AGENT", "Choose a valid agent.", 400);

  try {
    const selection = await readOwnerAgentSelection(getServerDatabase().db, {
      agentId,
      ownerId: owner.userId,
    });
    const selected = selection.selected;
    const paymentProfile = selected?.paymentProfile ?? null;
    if (!selected || !paymentProfile) {
      return leashError("AGENT_NOT_FOUND", "The agent was not found.", 404);
    }
    const floats = await readLeashFloatBalances(selected.agentAddress, paymentProfile);
    const testFunds = paymentProfile === BASE_SEPOLIA_INTEGRATION_PROFILE;
    return NextResponse.json(
      {
        agentId,
        floats,
        health: readHealth(floats),
        paymentProfile,
        readAt: new Date().toISOString(),
        testFunds,
        testFundsLabel: testFunds ? TEST_FUNDS_LABEL : null,
      },
      { headers: LEASH_RESPONSE_HEADERS, status: 200 },
    );
  } catch (error) {
    if (error instanceof LeashAgentSelectionError) {
      return leashError("AGENT_NOT_FOUND", "The agent was not found.", 404);
    }
    throw error;
  }
}
