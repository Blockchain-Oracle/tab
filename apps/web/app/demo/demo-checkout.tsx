"use client";

import { PayButton } from "@runtab/sdk";
import { useState } from "react";

import styles from "./demo.module.css";

type OrderState =
  | { status: "idle" }
  | { status: "saving" }
  | { message: string; status: "error" }
  | { orderNumber: string; paymentRef: string; status: "confirmed" };

export function DemoCheckout({
  apiBaseUrl,
  publishableKey,
}: {
  apiBaseUrl: string;
  publishableKey: string;
}) {
  const [order, setOrder] = useState<OrderState>({ status: "idle" });

  async function completeOrder(transactionId: string) {
    setOrder({ status: "saving" });
    try {
      const response = await fetch("/api/demo/order", {
        body: JSON.stringify({ transactionId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        order?: { orderNumber?: unknown; paymentRef?: unknown };
      };
      if (
        !response.ok ||
        typeof body.order?.orderNumber !== "string" ||
        typeof body.order.paymentRef !== "string"
      ) {
        throw new Error("Order confirmation failed");
      }
      setOrder({
        orderNumber: body.order.orderNumber,
        paymentRef: body.order.paymentRef,
        status: "confirmed",
      });
    } catch {
      setOrder({
        message: "The payment is recorded. Open Transactions to confirm the order reference.",
        status: "error",
      });
    }
  }

  return (
    <div className={styles.checkout}>
      <PayButton
        apiBaseUrl={apiBaseUrl}
        intentUrl="/api/demo/intent"
        onSuccess={(transactionId) => void completeOrder(transactionId)}
        publishableKey={publishableKey}
      />
      {order.status === "saving" ? <p role="status">Confirming the test order…</p> : null}
      {order.status === "error" ? (
        <p className={styles.orderError} role="alert">
          {order.message}
        </p>
      ) : null}
      {order.status === "confirmed" ? (
        <div className={styles.orderSuccess} role="status">
          <strong>Order {order.orderNumber} confirmed</strong>
          <span>Payment reference {order.paymentRef}</span>
        </div>
      ) : null}
    </div>
  );
}
