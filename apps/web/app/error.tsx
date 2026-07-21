"use client";

import { ErrorPanel } from "./error-panel";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      detail="Something went wrong while rendering this page."
      error={error}
      homeHref="/"
      moneyNote="This error did not initiate any payment. Retrying is safe."
      reset={reset}
      title="This page failed to load"
    />
  );
}
