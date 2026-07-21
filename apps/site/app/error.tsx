"use client";

import { useEffect } from "react";

import "./styles/boundary.css";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="boundary-page">
      <section aria-labelledby="site-error-title" className="boundary-panel">
        <p className="boundary-eyebrow">Tab</p>
        <h1 className="boundary-title" id="site-error-title">
          This page failed to load
        </h1>
        <p className="boundary-detail">
          Something went wrong while rendering. No financial data is involved on this page.
        </p>
        <div className="boundary-actions">
          <button className="boundary-retry" onClick={reset} type="button">
            Try again
          </button>
          <a className="boundary-link" href="/">
            Back to home
          </a>
        </div>
      </section>
    </main>
  );
}
