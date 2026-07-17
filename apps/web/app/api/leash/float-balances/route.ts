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
  if (!agentId) return leashError("INVALID_AGENT", "Choose a valid Leash agent.", 400);

  try {
    const selection = await readOwnerAgentSelection(getServerDatabase().db, {
      agentId,
      ownerId: owner.userId,
    });
    const floats = await readLeashFloatBalances(selection.selected?.agentAddress ?? null);
    return NextResponse.json(
      { agentId, floats, health: readHealth(floats), readAt: new Date().toISOString() },
      { headers: LEASH_RESPONSE_HEADERS, status: 200 },
    );
  } catch (error) {
    if (error instanceof LeashAgentSelectionError) {
      return leashError("LEASH_AGENT_NOT_FOUND", "The Leash agent was not found.", 404);
    }
    throw error;
  }
}
