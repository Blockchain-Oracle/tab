"use client";

import { ErrorPanel } from "../error-panel";

export default function LeashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      detail="This agent-control view failed to load. Policy gates stay enforced on the server regardless of this error."
      error={error}
      homeHref="/agents"
      homeLabel="Back to overview"
      moneyNote="This error did not sign or send any payment. Retrying is safe; settled evidence lives in Payments."
      reset={reset}
      title="This view failed to load"
    />
  );
}
