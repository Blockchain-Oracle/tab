/** @vitest-environment jsdom */

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CANCEL_COPY_BY_SPIKE_OUTCOME } from "./revocation-copy";
import { RevocationPanel } from "./revocation-panel";
import {
  agent,
  button,
  createRevocationHarness,
  destroyRevocationHarness,
  type RevocationHarness,
} from "./revocation-panel.test-support";

describe("Agent revocation spectrum", () => {
  let harness: RevocationHarness;

  beforeEach(() => {
    harness = createRevocationHarness();
  });

  afterEach(async () => {
    await destroyRevocationHarness(harness);
    vi.unstubAllGlobals();
  });

  it("renders four honest levels and never claims pause stops the external process", () => {
    const html = renderToStaticMarkup(<RevocationPanel agent={agent} />);
    expect(html).toContain("Pause payments");
    expect(html).toContain("Freeze signer");
    expect(html).toContain("Cancel credential");
    expect(html).toContain("Destroy credential");
    expect(html).toContain("payments stop at Tab before signing");
    expect(html).toContain("B-03 has not established whether re-provisioning");
    expect(html).toContain("Permanently destroys the signing credential");
    expect(html).not.toContain("stops your agent process");
  });

  it.each([
    ["provisioned", "Pause payments", "Confirm pause", "pause", "paused"],
    ["paused", "Resume payments", "Confirm resume", "resume", "provisioned"],
    ["provisioned", "Freeze signer", "Confirm freeze", "freeze", "frozen"],
    ["frozen", "Unfreeze signer", "Confirm unfreeze", "unfreeze", "provisioned"],
  ] as const)("confirms %s → %s before submitting the real API action", async (initialStatus, triggerLabel, confirmLabel, action, nextStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agentId: agent.id, changed: true, status: nextStatus }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await act(async () =>
      harness.root.render(<RevocationPanel agent={{ ...agent, status: initialStatus }} />),
    );
    await act(async () => button(harness.container, triggerLabel).click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error(`${action} confirmation not found`);
    expect(dialog.querySelector("input")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      button(dialog, confirmLabel).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/revoke",
      expect.objectContaining({
        body: JSON.stringify({ action, agentId: agent.id }),
        method: "POST",
      }),
    );
    const renderedStatus =
      nextStatus === "provisioned"
        ? "Active"
        : `${nextStatus.slice(0, 1).toUpperCase()}${nextStatus.slice(1)}`;
    expect(harness.container.textContent).toContain(renderedStatus);
  });

  it("pre-authors both B-03 cancel copy outcomes while showing the unresolved variant", () => {
    const html = renderToStaticMarkup(<RevocationPanel agent={agent} />);
    expect(html).toContain("B-03 has not established whether re-provisioning");
    expect(CANCEL_COPY_BY_SPIKE_OUTCOME.server_key_rotation).toContain("rotates your server key");
    expect(CANCEL_COPY_BY_SPIKE_OUTCOME.credential_chain_reset).toContain(
      "resets the credential chain",
    );
  });

  it("shows a post-nuclear exit and warns that Agent withdrawal is unavailable", () => {
    const html = renderToStaticMarkup(<RevocationPanel agent={{ ...agent, status: "nuked" }} />);
    expect(html).toContain("Provision new agent");
    expect(html).toContain("Not provisioned — destroyed");
    expect(html).toContain("Agent withdrawal is unavailable after nuclear destruction");
    expect(html).toContain("/agents/provision?agentId=");
  });
});
