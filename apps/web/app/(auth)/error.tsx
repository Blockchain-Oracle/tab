"use client";

import { ErrorPanel } from "../error-panel";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      detail="The sign-in view failed to load. No session was created."
      error={error}
      homeHref="/login"
      homeLabel="Back to sign in"
      moneyNote="This error did not initiate any payment. Retrying is safe."
      reset={reset}
      title="Sign-in is unavailable"
    />
  );
}
