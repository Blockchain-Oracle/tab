/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RevocationPanel } from "./revocation-panel";
import {
  agent,
  button,
  createRevocationHarness,
  deferredResponse,
  destroyRevocationHarness,
  liveRead,
  type RevocationHarness,
  writeInput,
} from "./revocation-panel.test-support";

describe("Agent revocation dialog accessibility", () => {
  let harness: RevocationHarness;

  beforeEach(() => {
    harness = createRevocationHarness();
  });

  afterEach(async () => {
    await destroyRevocationHarness(harness);
    vi.unstubAllGlobals();
  });

  it("keeps the confirmation open and announces the executing state", async () => {
    const mutation = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(mutation.promise));
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Pause payments").click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error("Pause confirmation not found");

    await act(async () => button(dialog, "Confirm pause").click());
    const pendingButton = button(dialog, "Applying control…");
    expect(pendingButton.disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
    expect(harness.container.querySelector('[role="alertdialog"]')).not.toBeNull();

    await act(async () => {
      mutation.resolve(
        new Response(JSON.stringify({ agentId: agent.id, changed: true, status: "paused" }), {
          status: 200,
        }),
      );
      await mutation.promise;
      await Promise.resolve();
    });
  });

  it("traps focus, inerts controls, closes on Escape, and restores focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(liveRead), { status: 200 })),
    );
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    const invoker = button(harness.container, "Destroy credential");
    invoker.focus();
    await act(async () => invoker.click());

    const dialog = harness.container.querySelector<HTMLElement>('[role="alertdialog"]');
    const background = harness.container.querySelector<HTMLElement>("[data-revocation-background]");
    const input = dialog?.querySelector<HTMLInputElement>("input");
    if (!dialog || !background || !input) throw new Error("Accessible dialog was not rendered");
    expect(document.activeElement).toBe(input);
    expect(background.hasAttribute("inert")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toContain(
      "permanently destroys the signing credential",
    );

    const keep = button(dialog, "Keep credential");
    keep.focus();
    dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
    );
    expect(document.activeElement).toBe(keep);
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(harness.container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(background.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });

  it("moves focus to the heading after destructive success disables its opener", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((input: RequestInfo | URL) =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                String(input).includes("float-balances")
                  ? liveRead
                  : { agentId: agent.id, changed: true, status: "nuked" },
              ),
              { status: 200 },
            ),
          ),
        ),
    );
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Destroy credential").click());
    const dialog = harness.container.querySelector<HTMLElement>('[role="alertdialog"]');
    const input = dialog?.querySelector<HTMLInputElement>("input");
    if (!dialog || !input) throw new Error("Nuclear confirmation not found");
    await act(async () => writeInput(input, agent.name));
    await act(async () => {
      button(dialog, "Destroy credential").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const fallback = harness.container.querySelector<HTMLElement>(
      "[data-revocation-focus-fallback]",
    );
    expect(harness.container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(button(harness.container, "Destroy credential").disabled).toBe(true);
    expect(document.activeElement).toBe(fallback);
  });
});
