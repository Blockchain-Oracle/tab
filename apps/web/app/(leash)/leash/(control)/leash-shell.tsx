"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LeashAccountMenu } from "./leash-account-menu";
import styles from "./leash-shell.module.css";

const navigation = [
  { href: "/leash", label: "Overview" },
  { href: "/leash/notifications", label: "Notifications" },
  { href: "/leash/cap", label: "Cap & limits" },
  { href: "/leash/connect", label: "Connect agent" },
] as const;

type LeashShellProps = {
  children: ReactNode;
  email: string;
  unreadCount: number | null;
};

function isActive(pathname: string, href: string) {
  return href === "/leash" ? pathname === href : pathname.startsWith(href);
}

export function LeashShell({ children, email, unreadCount }: LeashShellProps) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/leash">
          <span aria-hidden="true" className={styles.brandTile}>
            L
          </span>
          <span>Leash</span>
        </Link>

        <nav aria-label="Leash control plane" className={styles.navigation}>
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? styles.activeNavItem : styles.navItem}
                href={item.href}
                key={item.href}
              >
                <span>{item.label}</span>
                {item.href === "/leash/notifications" && unreadCount !== null ? (
                  <span className={styles.badge}>
                    <span className={styles.srOnly}>{unreadCount} unread notifications</span>
                    <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <p className={styles.productNote}>x402 payments, capped outside your agent.</p>
          <LeashAccountMenu email={email} />
        </div>
      </aside>
      <div className={styles.contentColumn}>{children}</div>
    </div>
  );
}
