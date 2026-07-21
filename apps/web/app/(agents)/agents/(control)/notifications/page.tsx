import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import { listOwnerNotifications } from "../../../../../lib/leash/notification-store";
import { notificationResultView } from "../../../../../lib/leash/notification-view";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { AgentPicker, NoAgentState } from "../control-page";
import { NotificationCenter } from "../notification-center";

type NotificationsPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
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

  const result = await listOwnerNotifications(database, {
    agentId: selection.selected.id,
    cursor: undefined,
    limit: 50,
    ownerId: owner.userId,
    read: "all",
    resolution: "all",
    tier: undefined,
    type: undefined,
  });

  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={selection.selected.id} />
      <NotificationCenter
        agentId={selection.selected.id}
        initialResult={notificationResultView(result)}
        key={selection.selected.id}
      />
    </>
  );
}
