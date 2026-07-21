"use client";

import { AppShell, UnreadBadge } from "@tab/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "../theme-toggle";
import { DashboardAccountMenu } from "./dashboard-account-menu";
import styles from "./dashboard-chrome.module.css";
import { DashboardModeControl } from "./dashboard-mode-control";

type DashboardShellProps = {
  businessName: string | null;
  children: ReactNode;
  email: string;
  liveActivated: boolean;
  mode: "live" | "test";
  webhookAlerts?: number;
};

const GROUPS = [
  {
    items: [
      { href: "/dashboard/quickstart", label: "Quickstart" },
      { href: "/dashboard/keys", label: "API keys" },
      { href: "/dashboard/webhooks", label: "Webhooks" },
    ],
    label: "Build",
  },
  {
    items: [{ href: "/dashboard/transactions", label: "Transactions" }],
    label: "Operate",
  },
  {
    items: [{ href: "/dashboard/settings", label: "Settings" }],
    label: "Account",
  },
] as const;

export function DashboardShell({
  businessName,
  children,
  email,
  liveActivated,
  mode,
  webhookAlerts,
}: DashboardShellProps) {
  const pathname = usePathname();
  const groups = GROUPS.map((group) => ({
    items: group.items.map((item) => ({
      ...item,
      active: pathname === item.href || pathname.startsWith(`${item.href}/`),
      ...(item.href === "/dashboard/webhooks"
        ? { badge: <UnreadBadge count={webhookAlerts} srLabel="failed deliveries" /> }
        : undefined),
    })),
    label: group.label,
  }));

  return (
    <AppShell
      accountSlot={
        <div className={styles.accountArea}>
          <ThemeToggle />
          <DashboardAccountMenu businessName={businessName} email={email} />
        </div>
      }
      bannerSlot={
        mode === "test" ? (
          <div className={styles.testBanner} role="status">
            Test mode — payments are simulated. No real funds move.
          </div>
        ) : null
      }
      brandHref="/dashboard/transactions"
      groups={groups}
      linkComponent={Link}
      modeSlot={<DashboardModeControl liveActivated={liveActivated} mode={mode} />}
      navAriaLabel="Merchant dashboard"
      surfaceTag="Merchant"
    >
      {children}
    </AppShell>
  );
}
