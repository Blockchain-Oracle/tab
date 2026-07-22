import type { ReactNode } from "react";

import { requireCurrentOwner } from "../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../lib/db/server";
import { countOwnerUnreadNotifications } from "../../../../lib/leash/notification-store";
import { readOwnerAgentSelection } from "../../../../lib/leash/owner-agents";
import { LeashShell } from "./leash-shell";

export default async function LeashControlLayout({ children }: { children: ReactNode }) {
  const owner = await requireCurrentOwner();
  const database = getServerDatabase().db;
  const unreadCount = await countOwnerUnreadNotifications(database, { ownerId: owner.userId });
  const selection = await readOwnerAgentSelection(database, { ownerId: owner.userId });
  const network =
    selection.selected?.paymentProfile === "mainnet" ? ("mainnet" as const) : ("testnet" as const);

  return (
    <LeashShell email={owner.email} network={network} unreadCount={unreadCount}>
      {children}
    </LeashShell>
  );
}
