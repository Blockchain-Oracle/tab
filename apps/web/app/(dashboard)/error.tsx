"use client";

import { ErrorPanel } from "../error-panel";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      detail="This dashboard view failed to load. Your merchant data is unchanged."
      error={error}
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
      moneyNote="This error did not move any funds. Retrying is safe; payment records live in Payments."
      reset={reset}
      title="This view failed to load"
    />
  );
}
