type DeliveryResult = "delivered" | "failed" | "gave_up" | "pending" | "retrying" | "timeout";

interface DeliveryEvidence {
  eventId: string;
  failureKind: "configuration" | "http" | "network" | "timeout" | null;
  request: { body: string };
  response: { statusCode: number | null };
  result: DeliveryResult;
  type: "payment" | "test";
}

export function deliveryCode(delivery: Pick<DeliveryEvidence, "failureKind" | "response">) {
  if (delivery.response.statusCode !== null) return String(delivery.response.statusCode);
  if (delivery.failureKind === "timeout") return "TIMEOUT";
  if (delivery.failureKind === "configuration") return "CONFIG";
  if (delivery.failureKind === "network") return "NETWORK";
  return "—";
}

export function deliverySubject(delivery: Pick<DeliveryEvidence, "eventId" | "request" | "type">) {
  if (delivery.type === "test") return "Test event";
  try {
    const payload = JSON.parse(delivery.request.body) as { transactionId?: unknown };
    if (typeof payload.transactionId === "string" && payload.transactionId.length > 0) {
      return payload.transactionId;
    }
  } catch {
    // The immutable raw request remains available in the expanded evidence panel.
  }
  return delivery.eventId;
}

export function deliveryTone(delivery: Pick<DeliveryEvidence, "result">) {
  const states = {
    delivered: { label: "Delivered", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
    gave_up: { label: "Gave up", tone: "danger" },
    pending: { label: "Pending", tone: "neutral" },
    retrying: { label: "Retrying", tone: "warning" },
    timeout: { label: "Timed out", tone: "danger" },
  } as const;
  return states[delivery.result];
}

export function mayResend(result: DeliveryResult) {
  return result !== "pending" && result !== "retrying";
}

export function compactEvidence(value: string) {
  return value.length <= 28 ? value : `${value.slice(0, 13)}…${value.slice(-8)}`;
}
