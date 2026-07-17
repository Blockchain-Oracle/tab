import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../../lib/db/server";
import { readOwnerCap } from "../../../../../lib/leash/cap-policy";
import { readOwnerCapResetNotice } from "../../../../../lib/leash/cap-reset-notice";
import { capPolicyView } from "../../../../../lib/leash/cap-view";
import {
  LeashAgentSelectionError,
  readOwnerAgentSelection,
} from "../../../../../lib/leash/owner-agents";
import { listOwnerReceipts } from "../../../../../lib/leash/receipt-store";
import { AgentPicker, NoAgentState } from "../control-page";
import { ReceiptFeed } from "./receipt-feed";

type PaymentsPageProps = { searchParams: Promise<{ agentId?: string | string[] }> };

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
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

  const [initialResult, capResetNotice, cap] = await Promise.all([
    listOwnerReceipts(database, {
      agentId: selection.selected.id,
      cursor: undefined,
      limit: 100,
      ownerId: owner.userId,
    }),
    readOwnerCapResetNotice(database, {
      agentId: selection.selected.id,
      ownerId: owner.userId,
    }),
    readOwnerCap(database, {
      agentId: selection.selected.id,
      ownerId: owner.userId,
    }),
  ]);

  return (
    <>
      <AgentPicker agents={selection.agents} selectedId={selection.selected.id} />
      <ReceiptFeed
        agentId={selection.selected.id}
        capResetNotice={capResetNotice}
        initialPolicy={cap ? capPolicyView(cap) : null}
        initialResult={initialResult}
        key={selection.selected.id}
      />
    </>
  );
}
