/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiEnvironment } from "../../../../../lib/auth/api-key";
import type { DashboardWebhookDelivery } from "../../../../../lib/dashboard/webhooks-delivery-log";
import { DeliveryLog } from "./delivery-log";

function delivery(
  env: ApiEnvironment,
  overrides: Partial<DashboardWebhookDelivery> = {},
): DashboardWebhookDelivery {
  const id =
    env === "test"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
  return {
    attempt: 3,
    completedAt: new Date("2026-07-16T10:01:00.000Z"),
    createdAt: new Date("2026-07-16T10:00:00.000Z"),
    eventId: `${env}-event`,
    failureKind: "http",
    id,
    nextRetryAt: null,
    parentDeliveryId: null,
    request: {
      body: JSON.stringify({ transactionId: `${env}-transaction` }),
      bodyHash: "a".repeat(64),
      signature: "t=1,v1=signature",
    },
    response: { bodySnippet: "upstream failed", statusCode: 500, timeMs: 42 },
    result: "gave_up",
    retryChainId: id,
    startedAt: new Date("2026-07-16T10:00:59.000Z"),
    trigger: "auto",
    type: "payment",
    ...overrides,
  };
}

function findButton(container: HTMLElement, name: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(name),
  );
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}

describe("webhook delivery log client state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("hydrates ISO timestamps returned by a successful resend before rendering", async () => {
    const source = delivery("test");
    const resent = delivery("test", {
      attempt: 1,
      completedAt: new Date("2026-07-16T11:01:00.000Z"),
      createdAt: new Date("2026-07-16T11:00:00.000Z"),
      id: "33333333-3333-4333-8333-333333333333",
      parentDeliveryId: source.id,
      response: { bodySnippet: "ok", statusCode: 200, timeMs: 20 },
      result: "delivered",
      retryChainId: "33333333-3333-4333-8333-333333333333",
      startedAt: new Date("2026-07-16T11:00:59.000Z"),
      trigger: "manual",
    });
    const jsonDelivery = JSON.parse(JSON.stringify(resent));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ delivery: jsonDelivery }), {
          headers: { "content-type": "application/json" },
          status: 201,
        }),
      ),
    );

    await act(async () => {
      root.render(<DeliveryLog environment="test" initialDeliveries={[source]} />);
    });
    await act(async () => findButton(container, "test-transaction").click());
    await act(async () => {
      findButton(container, "Resend delivery").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Delivered");
    expect(container.querySelector('time[datetime="2026-07-16T11:00:00.000Z"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("replaces test deliveries when refreshed props switch the client island to live mode", async () => {
    await act(async () => {
      root.render(<DeliveryLog environment="test" initialDeliveries={[delivery("test")]} />);
    });
    expect(container.textContent).toContain("test-transaction");

    await act(async () => {
      root.render(<DeliveryLog environment="live" initialDeliveries={[delivery("live")]} />);
    });

    expect(container.textContent).toContain("live-transaction");
    expect(container.textContent).not.toContain("test-transaction");
  });
});
