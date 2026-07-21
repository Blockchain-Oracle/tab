import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { requireCurrentOwner } from "../../lib/auth/current-owner";
import { getServerDatabase } from "../../lib/db/server";
import { countOwnerUnreadNotifications } from "../../lib/leash/notification-store";
import { MobileShell } from "./mobile-shell";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tab Agents",
  },
  description: "Monitor Agent payments and control agent access without on-device signing.",
  manifest: "/mobile/manifest.webmanifest",
  title: "Agent monitor · Tab",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#141210",
  viewportFit: "cover",
};

export default async function MobileLayout({ children }: { children: ReactNode }) {
  const owner = await requireCurrentOwner();
  const unreadCount = await countOwnerUnreadNotifications(getServerDatabase().db, {
    ownerId: owner.userId,
  });

  return (
    <MobileShell email={owner.email} unreadCount={unreadCount}>
      {children}
    </MobileShell>
  );
}
