import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { AgentPicker } from "../control-page";
import { ProvisionPanel } from "./provision-panel";

type ProvisionPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function ProvisionPage({ searchParams }: ProvisionPageProps) {
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
  return (
    <>
      {agent ? <AgentPicker agents={selection.agents} selectedId={agent.id} /> : null}
      <ProvisionPanel
        agent={agent ? { agentAddress: agent.agentAddress, id: agent.id, name: agent.name } : null}
        key={agent?.id ?? "new-agent"}
      />
    </>
  );
}
