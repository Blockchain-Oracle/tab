import type { ReactNode } from "react";

import { requireCurrentOwner } from "../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../lib/db/server";
import { countOwnerUnreadNotifications } from "../../../../lib/leash/notification-store";
import { LeashShell } from "./leash-shell";

export default async function LeashControlLayout({ children }: { children: ReactNode }) {
  const owner = await requireCurrentOwner();
  const unreadCount = await countOwnerUnreadNotifications(getServerDatabase().db, {
    ownerId: owner.userId,
  });

  return (
    <LeashShell email={owner.email} unreadCount={unreadCount}>
      {children}
    </LeashShell>
  );
}
