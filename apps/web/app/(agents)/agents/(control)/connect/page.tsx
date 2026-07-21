import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { readOwnerLeashKey } from "../../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../../lib/db/server";
import { leashKeyView } from "../../../../../lib/leash/leash-key-view";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { ConnectAgent } from "../connect-agent";
import { resolveLeashApiOrigin } from "../connect-config";
import { AgentPicker, NoAgentState } from "../control-page";

type ConnectPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const [owner, query] = await Promise.all([requireCurrentOwner(), searchParams]);
  const requestedAgentId = typeof query.agentId === "string" ? query.agentId : undefined;
  const database = getServerDatabase().db;

  let selection: Awaited<ReturnType<typeof readOwnerAgentSelection>>;
  try {
    selection = await readOwnerAgentSelection(database, {
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
      ownerId: owner.userId,
    });
  } catch (error) {
    if (error instanceof LeashAgentSelectionError) notFound();
    throw error;
  }
  if (!selection.selected) return <NoAgentState />;

  const key = await readOwnerLeashKey(database, {
    agentId: selection.selected.id,
    ownerId: owner.userId,
  });
  const configuration = resolveLeashApiOrigin(process.env.NEXT_PUBLIC_APP_URL);

  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={selection.selected.id} />
      <ConnectAgent
        key={selection.selected.id}
        agent={{
          clientName: selection.selected.clientName,
          connectionCount: selection.selected.connectionCount,
          id: selection.selected.id,
          lastSeenAt: selection.selected.lastSeenAt?.toISOString() ?? null,
          transport: selection.selected.transport,
        }}
        apiBaseUrl={configuration.apiBaseUrl}
        configurationIssue={configuration.issue}
        initialKey={key ? leashKeyView(key) : null}
      />
    </>
  );
}
