/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeashKeyView } from "../../../../lib/leash/leash-key-view";
import { ConnectAgent } from "./connect-agent";

const agentId = "11111111-1111-4111-8111-111111111111";
const key: LeashKeyView = {
  agentId,
  createdAt: "2026-07-17T10:00:00.000Z",
  id: "22222222-2222-4222-8222-222222222222",
  last4: "a1B2",
  lastUsedAt: "2026-07-17T11:00:00.000Z",
  prefix: "leash_sk_",
  revokedAt: null,
  rotatedFromId: null,
};

describe("Leash agent connection setup", () => {
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

  it("starts from a real no-key state and labels package publication honestly", () => {
    const html = renderToStaticMarkup(
      <ConnectAgent
        agent={{
          clientName: null,
          connectionCount: 0,
          id: agentId,
          lastSeenAt: null,
          transport: null,
        }}
        apiBaseUrl="https://tab.example.test"
        initialKey={null}
      />,
    );

    expect(html).toContain("Generate Leash key");
    expect(html).toContain("Package publish pending");
    expect(html).toContain("LEASH_API_BASE_URL");
    expect(html).toContain("Standalone paid_fetch");
    expect(html).toContain("Proxy an existing MCP server");
    expect(html).toContain("No key exists yet");
    expect(html).not.toContain("leash_sk_••••••••");
  });

  it("derives the mask and connection state from stored rows", () => {
    const html = renderToStaticMarkup(
      <ConnectAgent
        agent={{
          clientName: "Claude Code",
          connectionCount: 2,
          id: agentId,
          lastSeenAt: "2026-07-17T11:30:00.000Z",
          transport: "mcp",
        }}
        apiBaseUrl="https://tab.example.test"
        initialKey={key}
      />,
    );

    expect(html).toContain("leash_sk_••••••••a1B2");
    expect(html).toContain("Claude Code");
    expect(html).toContain("2 recorded connections");
    expect(html).toContain("Rotate key");
    expect(html).not.toContain("a fake key");
  });

  it("blocks the config honestly when the deployed origin is unavailable", () => {
    const html = renderToStaticMarkup(
      <ConnectAgent
        agent={{
          clientName: null,
          connectionCount: 0,
          id: agentId,
          lastSeenAt: null,
          transport: null,
        }}
        apiBaseUrl={null}
        configurationIssue="NEXT_PUBLIC_APP_URL is not configured."
        initialKey={null}
      />,
    );

    expect(html).toContain("Configuration blocked");
    expect(html).toContain("NEXT_PUBLIC_APP_URL is not configured.");
    expect(html).not.toContain("leash-mcp");
  });

  it("advances key progress immediately after the real create response and stays current after save", async () => {
    const createdKey = { ...key, last4: "z9Y8" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ key: createdKey, secret: `leash_sk_${"z".repeat(43)}` }), {
          status: 201,
        }),
      ),
    );
    await act(async () => {
      root.render(
        <ConnectAgent
          agent={{
            clientName: null,
            connectionCount: 0,
            id: agentId,
            lastSeenAt: null,
            transport: null,
          }}
          apiBaseUrl="https://tab.example.test"
          initialKey={null}
        />,
      );
    });

    expect(container.textContent).toContain("Not connected");
    const generate = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Generate Leash key",
    );
    if (!generate) throw new Error("Generate button not found");
    await act(async () => {
      generate.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Awaiting initialize");

    const saved = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "I’ve saved my key",
    );
    if (!saved) throw new Error("Save confirmation not found");
    await act(async () => saved.click());

    expect(container.textContent).toContain("Awaiting initialize");
    expect(container.textContent).toContain("leash_sk_••••••••z9Y8");
  });
});
