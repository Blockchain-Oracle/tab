/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative aria-hidden tally marks; accessible labels live on the surrounding elements. */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./mobile-shell.module.css";
import { PwaRegistration } from "./pwa-registration";

const tabs = [
  { href: "/mobile", label: "Overview" },
  { href: "/mobile/feed", label: "Feed" },
  { href: "/agents/revocation", label: "Controls" },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/mobile") return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileShell({
  children,
  email,
  unreadCount,
}: {
  children: ReactNode;
  email: string;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const notificationLabel = unreadCount
    ? `${unreadCount} unread notifications`
    : "Open notifications";

  return (
    <div className={styles.viewport}>
      <div className={styles.app}>
        <header className={styles.header}>
          <Link className={styles.identity} href="/mobile" aria-label="Agent mobile overview">
            <span className={styles.mark} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <g stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
                  <path d="M5 5v14" />
                  <path d="M10 5v14" />
                  <path d="M15 5v14" />
                  <path d="M20 5v14" />
                </g>
                <path
                  d="M2 17 22 7"
                  stroke="var(--tab-accent)"
                  strokeLinecap="round"
                  strokeWidth="2.4"
                />
              </svg>
            </span>
            <span className={styles.identityCopy}>
              <strong>Tab monitor</strong>
              <span>{email}</span>
            </span>
          </Link>
          <Link
            className={styles.notifications}
            href="/agents/notifications"
            aria-label={notificationLabel}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
              <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
            </svg>
            {unreadCount > 0 ? (
              <span className={styles.badge}>{Math.min(unreadCount, 99)}</span>
            ) : null}
          </Link>
        </header>

        <main className={styles.content}>{children}</main>

        <nav className={styles.tabs} aria-label="Mobile monitor">
          {tabs.map((tab) => {
            const current = isCurrent(pathname, tab.href);
            return (
              <Link
                className={current ? styles.tabActive : styles.tab}
                href={tab.href}
                key={tab.href}
                aria-current={current ? "page" : undefined}
              >
                <span className={styles.tabGlyph} aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <PwaRegistration />
      </div>
    </div>
  );
}
