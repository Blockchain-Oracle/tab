"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashboardAccountMenu } from "./dashboard-account-menu";
import { DashboardModeControl } from "./dashboard-mode-control";
import styles from "./dashboard-sidebar.module.css";

type DashboardSidebarProps = {
  businessName: string | null;
  email: string;
  liveActivated: boolean;
  mode: "live" | "test";
  publishableKey: string;
};

const navigation = [
  { href: "/dashboard/quickstart", label: "Quickstart" },
  { href: "/dashboard/transactions", label: "Transactions" },
] as const;

const pendingNavigation = ["API keys", "Webhooks"] as const;

export function DashboardSidebar({
  businessName,
  email,
  liveActivated,
  mode,
  publishableKey,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/dashboard/transactions">
        <span className={styles.brandTile} aria-hidden="true">
          T
        </span>
        <span>Tab</span>
      </Link>

      <nav aria-label="Merchant dashboard" className={styles.navigation}>
        {navigation.map((item) => (
          <Link
            aria-current={pathname === item.href ? "page" : undefined}
            className={pathname === item.href ? styles.activeNavItem : styles.navItem}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
        {pendingNavigation.map((label) => (
          <span
            aria-disabled="true"
            className={styles.pendingNavItem}
            key={label}
            title="Available when the real integration is connected"
          >
            {label}
          </span>
        ))}
        <Link
          aria-current={pathname === "/dashboard/settings" ? "page" : undefined}
          className={pathname === "/dashboard/settings" ? styles.activeNavItem : styles.navItem}
          href="/dashboard/settings"
        >
          Settings
        </Link>
      </nav>

      <div className={styles.sidebarBottom}>
        <DashboardModeControl liveActivated={liveActivated} mode={mode} />
        <DashboardAccountMenu
          businessName={businessName}
          email={email}
          publishableKey={publishableKey}
        />
      </div>
    </aside>
  );
}
