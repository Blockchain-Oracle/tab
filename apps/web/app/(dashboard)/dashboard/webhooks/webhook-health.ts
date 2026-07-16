import type { WebhookEndpointView } from "../../../../lib/dashboard/webhooks-endpoints";

export function webhookHealthView(health: WebhookEndpointView["health"]) {
  if (health === "listening") return { className: "listening", label: "Listening" } as const;
  if (health === "failing") return { className: "failing", label: "Failing" } as const;
  return { className: "awaiting", label: "Awaiting a successful delivery" } as const;
}
