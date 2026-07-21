"use client";

import { ErrorPanel } from "../error-panel";

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      detail="The monitor failed to load. Your agent's server-side state is unaffected."
      error={error}
      homeHref="/mobile"
      homeLabel="Back to monitor"
      moneyNote="This device never signs payments. Retrying is safe."
      reset={reset}
      title="Monitor unavailable"
    />
  );
}
