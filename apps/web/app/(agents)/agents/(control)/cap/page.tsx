export const metadata = { title: "Cap & limits" };

import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import { readOwnerCap } from "../../../../../lib/leash/cap-policy";
import { capPolicyView } from "../../../../../lib/leash/cap-view";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { CapPanel } from "../cap-panel";
import { AgentPicker, NoAgentState } from "../control-page";

type CapPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function CapPage({ searchParams }: CapPageProps) {
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

  const policy = await readOwnerCap(getServerDatabase().db, {
    agentId: selection.selected.id,
    ownerId: owner.userId,
  });

  return (
    <main>
      <AgentPicker agents={selection.agents} selectedId={selection.selected.id} />
      <CapPanel
        agentId={selection.selected.id}
        initialPolicy={policy ? capPolicyView(policy) : null}
        key={selection.selected.id}
      />
    </main>
  );
}
