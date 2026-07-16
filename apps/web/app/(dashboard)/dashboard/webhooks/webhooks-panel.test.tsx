/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiEnvironment } from "../../../../lib/auth/api-key";
import type { WebhookEndpointView } from "../../../../lib/dashboard/webhooks-endpoints";
import { WebhooksPanel } from "./webhooks-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function endpoint(env: ApiEnvironment, url: string): WebhookEndpointView {
  return {
    createdAt: new Date("2026-07-16T10:00:00.000Z"),
    env,
    health: "awaiting",
    id:
      env === "test"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222",
    lastDeliveredAt: null,
    listening: false,
    secretLast4: env === "test" ? "tE57" : "L1vE",
    updatedAt: new Date("2026-07-16T10:00:00.000Z"),
    url,
    verifiedAt: null,
  };
}

function findButton(container: HTMLElement, name: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  );
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}

async function click(container: HTMLElement, name: string) {
  await act(async () => {
    findButton(container, name).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("webhook endpoint environment state", () => {
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

  it("drops dirty test state before a live-mode mutation", async () => {
    const testEndpoint = endpoint("test", "https://test.example/webhook");
    const liveEndpoint = endpoint("live", "https://live.example/webhook");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ endpoint: testEndpoint, secret: "whsec_test_only_secret" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Test endpoint unavailable." } }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ endpoint: liveEndpoint }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <WebhooksPanel environment="test" initialEndpoint={testEndpoint} recentDeliveries={[]} />,
      );
    });
    await click(container, "Regenerate");
    await click(container, "Send test webhook");
    await click(container, "Edit");

    const dirtyInput = container.querySelector<HTMLInputElement>('input[aria-label="Webhook URL"]');
    if (!dirtyInput) throw new Error("Webhook URL input not found");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        dirtyInput,
        "https://dirty-test.example/webhook",
      );
      dirtyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(container, "Delete");

    expect(container.textContent).toContain("whsec_test_only_secret");
    expect(container.textContent).toContain("Test endpoint unavailable.");
    expect(container.textContent).toContain("Remove this webhook URL?");

    await act(async () => {
      root.render(
        <WebhooksPanel environment="live" initialEndpoint={liveEndpoint} recentDeliveries={[]} />,
      );
    });

    expect(container.textContent).toContain(liveEndpoint.url);
    expect(container.textContent).not.toContain("dirty-test.example");
    expect(container.textContent).not.toContain("whsec_test_only_secret");
    expect(container.textContent).not.toContain("Test endpoint unavailable.");
    expect(container.textContent).not.toContain("Remove this webhook URL?");
    expect(container.querySelector('input[aria-label="Webhook URL"]')).toBeNull();

    await click(container, "Edit");
    const liveInput = container.querySelector<HTMLInputElement>('input[aria-label="Webhook URL"]');
    expect(liveInput?.value).toBe(liveEndpoint.url);
    await act(async () => {
      liveInput?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/webhook-endpoint",
      expect.objectContaining({
        body: JSON.stringify({ url: liveEndpoint.url }),
        method: "PATCH",
      }),
    ]);
  });
});
