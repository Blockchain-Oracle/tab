import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { AgentPicker, NoAgentState } from "../control-page";
import { RevocationPanel } from "../revocation-panel";

type RevocationPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function RevocationPage({ searchParams }: RevocationPageProps) {
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
  const agent = selection.selected;

  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={agent.id} />
      <RevocationPanel
        agent={{ id: agent.id, name: agent.name, status: agent.status }}
        key={agent.id}
      />
    </>
  );
}
