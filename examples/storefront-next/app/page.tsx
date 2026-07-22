"use client";

import { PayButton } from "@runtab/sdk";
import { useState } from "react";

export default function Storefront() {
  const [transactionId, setTransactionId] = useState<string | null>(null);

  return (
    <main style={{ fontFamily: "system-ui", margin: "80px auto", maxWidth: 420 }}>
      <h1>Demo storefront</h1>
      <p>One product, $1.00, paid with nothing but an email.</p>

      {transactionId ? (
        <p>
          Paid ✓ — transaction <code>{transactionId}</code>
        </p>
      ) : (
        <PayButton
          apiBaseUrl={process.env.NEXT_PUBLIC_TAB_API_BASE_URL ?? "https://app.runtab.xyz"}
          intentUrl="/api/payment-intent"
          publishableKey={process.env.NEXT_PUBLIC_TAB_PUBLISHABLE_KEY as string}
          onSuccess={(id) => setTransactionId(id)}
        />
      )}
    </main>
  );
}
