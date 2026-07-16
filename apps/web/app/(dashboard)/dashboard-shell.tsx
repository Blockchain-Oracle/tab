import type { ReactNode } from "react";
import styles from "./dashboard-shell.module.css";
import { DashboardSidebar } from "./dashboard-sidebar";

type DashboardShellProps = {
  businessName: string | null;
  children: ReactNode;
  email: string;
  liveActivated: boolean;
  mode: "live" | "test";
};

export function DashboardShell({
  businessName,
  children,
  email,
  liveActivated,
  mode,
}: DashboardShellProps) {
  return (
    <div className={styles.shell}>
      <DashboardSidebar
        businessName={businessName}
        email={email}
        liveActivated={liveActivated}
        mode={mode}
      />
      <div className={styles.contentColumn}>
        {mode === "test" ? (
          <div className={styles.testBanner} role="status">
            You are in test mode. Test payments are simulated and do not move real funds.
          </div>
        ) : null}
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
