"use client";

import { useEffect } from "react";

import "./styles/boundary.css";

export default function SiteGlobalError({
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
    <html lang="en">
      <body>
        <main className="boundary-page">
          <section aria-labelledby="site-global-error-title" className="boundary-panel">
            <p className="boundary-eyebrow">Tab</p>
            <h1 className="boundary-title" id="site-global-error-title">
              Something went wrong
            </h1>
            <p className="boundary-detail">
              The site hit an unexpected error and could not render.
            </p>
            <div className="boundary-actions">
              <button className="boundary-retry" onClick={reset} type="button">
                Try again
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
