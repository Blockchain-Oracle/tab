/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeashKeyView } from "../../../../lib/leash/leash-key-view";
import { KeyLifecycle } from "./key-lifecycle";

const agentId = "11111111-1111-4111-8111-111111111111";
const oldKey: LeashKeyView = {
  agentId,
  createdAt: "2026-07-17T10:00:00.000Z",
  id: "22222222-2222-4222-8222-222222222222",
  last4: "a1B2",
  lastUsedAt: null,
  prefix: "agent_sk_",
  revokedAt: null,
  rotatedFromId: null,
};

function button(container: ParentNode, label: string) {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

describe("agent key rotation", () => {
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

  it("rotates the selected stored key and reveals the replacement only until it is saved", async () => {
    const replacement = {
      ...oldKey,
      id: "33333333-3333-4333-8333-333333333333",
      last4: "z9Y8",
      rotatedFromId: oldKey.id,
    };
    const oneTimeSecret = `agent_sk_${"z".repeat(43)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ key: replacement, secret: oneTimeSecret }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<KeyLifecycle agentId={agentId} initialKey={oldKey} />));

    await act(async () => button(container, "Rotate key").click());
    const dialog = container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error("Rotation confirmation not found");
    await act(async () => {
      button(dialog, "Rotate key").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/keys",
      expect.objectContaining({
        body: JSON.stringify({ agentId, keyId: oldKey.id }),
        method: "PATCH",
      }),
    );
    expect(container.textContent).toContain(oneTimeSecret);
    expect(container.textContent).not.toContain("agent_sk_••••••••z9Y8");

    await act(async () => button(container, "I’ve saved my key").click());
    expect(container.textContent).not.toContain(oneTimeSecret);
    expect(container.textContent).toContain("agent_sk_••••••••z9Y8");
  });
});
