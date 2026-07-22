"use client";

import { AppShell, UnreadBadge } from "@tab/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "../../../../components/workspace-switcher";
import { ThemeToggle } from "../../../theme-toggle";
import { AgentNetworkControl } from "./agent-network-control";
import { LeashAccountMenu } from "./leash-account-menu";
import styles from "./leash-chrome.module.css";

type LeashShellProps = {
  children: ReactNode;
  email: string;
  network: "mainnet" | "testnet";
  unreadCount: number | null;
};

function isActive(pathname: string, href: string) {
  return href === "/agents" ? pathname === href : pathname.startsWith(href);
}

export function LeashShell({ children, email, network, unreadCount }: LeashShellProps) {
  const pathname = usePathname();

  const groups = [
    {
      items: [
        { href: "/agents", label: "Overview" },
        { href: "/agents/payments", label: "Payments" },
        {
          badge: <UnreadBadge count={unreadCount} />,
          href: "/agents/notifications",
          label: "Notifications",
        },
      ],
      label: "Operate",
    },
    {
      items: [
        { href: "/agents/cap", label: "Cap & limits" },
        { href: "/agents/funds", label: "Funds" },
        { href: "/agents/revocation", label: "Revocation" },
      ],
      label: "Controls",
    },
    {
      items: [
        { href: "/agents/start", label: "Get started" },
        { href: "/agents/provision", label: "Provision agent" },
        { href: "/agents/connect", label: "Connect agent" },
      ],
      label: "Setup",
    },
  ].map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, active: isActive(pathname, item.href) })),
  }));

  return (
    <AppShell
      accountSlot={
        <div className={styles.accountArea}>
          <ThemeToggle />
          <LeashAccountMenu email={email} />
        </div>
      }
      brandHref="/agents"
      groups={groups}
      linkComponent={Link}
      modeSlot={<AgentNetworkControl network={network} />}
      navAriaLabel="Agent control plane"
      surfaceSlot={<WorkspaceSwitcher current="agents" />}
      surfaceTag="Agents"
    >
      {children}
    </AppShell>
  );
}
