import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import { readLeashFundsSnapshot } from "../../../../../lib/leash/fund-balances";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { AgentPicker, NoAgentState } from "../control-page";
import { FundsPanel } from "./funds-panel";

type FundsPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function FundsPage({ searchParams }: FundsPageProps) {
  const [owner, query] = await Promise.all([requireCurrentOwner(), searchParams]);
  const requestedAgentId = typeof query.agentId === "string" ? query.agentId : undefined;

  let selection: Awaited<ReturnType<typeof readOwnerAgentSelection>>;
  try {
    selection = await readOwnerAgentSelection(getServerDatabase().db, {
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
      ownerId: owner.userId,
    });
  } catch (error) {
    if (error instanceof LeashAgentSelectionError) notFound();
    throw error;
  }
  if (!selection.selected) return <NoAgentState />;

  const snapshot = await readLeashFundsSnapshot(
    selection.selected.agentAddress,
    selection.selected.paymentProfile,
  );
  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={selection.selected.id} />
      <FundsPanel
        agentName={selection.selected.name}
        agentStatus={selection.selected.status}
        snapshot={snapshot}
      />
    </>
  );
}
