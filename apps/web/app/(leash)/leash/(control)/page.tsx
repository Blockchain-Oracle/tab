import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../lib/auth/current-owner";
import { readOwnerLeashKey } from "../../../../lib/auth/leash-key";
import { getServerDatabase } from "../../../../lib/db/server";
import { readOwnerCap } from "../../../../lib/leash/cap-policy";
import { capPolicyView } from "../../../../lib/leash/cap-view";
import { readFloatBalance } from "../../../../lib/leash/float-balance";
import { listOwnerNotifications } from "../../../../lib/leash/notification-store";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../lib/leash/owner-agents";
import { AgentPicker, NoAgentState } from "./control-page";
import { LeashOverview } from "./leash-overview";

type OverviewPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

async function liveFloatReads(address: string | null) {
  if (!address) return null;
  const networks = [
    { label: "Base", network: "eip155:8453" },
    { label: "Arbitrum", network: "eip155:42161" },
  ] as const;
  return Promise.all(
    networks.map(async (network) => {
      try {
        const balance = await readFloatBalance({ address, network: network.network });
        return { ...network, balanceAtomic: balance.toString() };
      } catch {
        return { ...network, balanceAtomic: null };
      }
    }),
  );
}

export default async function LeashOverviewPage({ searchParams }: OverviewPageProps) {
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
  const agent = selection.selected;

  const [policy, keySummary, notificationResult, floats] = await Promise.all([
    readOwnerCap(database, { agentId: agent.id, ownerId: owner.userId }),
    readOwnerLeashKey(database, { agentId: agent.id, ownerId: owner.userId }),
    listOwnerNotifications(database, {
      agentId: agent.id,
      cursor: undefined,
      limit: 3,
      ownerId: owner.userId,
      read: "all",
      resolution: "all",
      tier: undefined,
      type: undefined,
    }),
    liveFloatReads(agent.agentAddress),
  ]);

  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={agent.id} />
      <LeashOverview
        agent={agent}
        floats={floats}
        keySummary={keySummary}
        notifications={notificationResult.notifications}
        policy={policy ? capPolicyView(policy) : null}
        unreadCount={notificationResult.unreadCount}
      />
    </>
  );
}
