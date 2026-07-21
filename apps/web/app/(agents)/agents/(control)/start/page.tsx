export const metadata = { title: "Get started" };

import { notFound } from "next/navigation";

import { readAgentOnboarding } from "../../../../../lib/agents/onboarding";
import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { AgentPicker } from "../control-page";
import { StartPanel } from "./start-panel";

type StartPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function StartPage({ searchParams }: StartPageProps) {
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

  const agent = selection.selected;
  const state = await readAgentOnboarding(getServerDatabase().db, owner.userId, agent);

  return (
    <>
      {agent ? <AgentPicker agents={selection.agents} selectedId={agent.id} /> : null}
      <StartPanel
        agentAddress={agent?.agentAddress ?? null}
        agentId={agent?.id ?? null}
        agentName={agent?.name ?? null}
        state={state}
        testnet={agent?.paymentProfile === "base_sepolia_integration"}
      />
    </>
  );
}
