"use client";

import { ErrorPanel } from "./error-panel";

import "@tab/ui/theme.css";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body data-tab-theme="light" data-tab-ui="">
        <ErrorPanel
          detail="Tab hit an unexpected error and could not render."
          error={error}
          moneyNote="This error did not initiate any payment. Retrying is safe."
          reset={reset}
          title="Something went wrong"
        />
      </body>
    </html>
  );
}
