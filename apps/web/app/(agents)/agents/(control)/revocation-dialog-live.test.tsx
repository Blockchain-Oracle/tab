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
  integrationAgent,
  integrationLiveRead,
  liveRead,
  type RevocationHarness,
  writeInput,
} from "./revocation-panel.test-support";

describe("Agent revocation live evidence", () => {
  let harness: RevocationHarness;

  beforeEach(() => {
    harness = createRevocationHarness();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await destroyRevocationHarness(harness);
    vi.unstubAllGlobals();
  });

  it("refreshes both floats when nuclear opens instead of presenting an SSR snapshot as live", async () => {
    const read = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(read.promise);
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Destroy credential").click());

    const dialog = harness.container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error("Nuclear confirmation not found");
    expect(dialog.textContent).toContain("Refreshing Base + Arbitrum");
    expect(dialog.textContent).not.toContain("$1.25");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agents/float-balances?agentId=${agent.id}`,
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
    const input = dialog.querySelector("input");
    if (!input) throw new Error("Confirmation input not found");
    await act(async () => writeInput(input, agent.name));
    expect(button(dialog, "Destroy credential").disabled).toBe(true);

    await act(async () => {
      read.resolve(new Response(JSON.stringify(liveRead), { status: 200 }));
      await read.promise;
      await Promise.resolve();
    });
    expect(dialog.textContent).toContain("$1.25");
    expect(dialog.textContent).toContain("RPC healthy");
    expect(dialog.textContent).toContain("Read 2026-07-17 10:30:00 UTC");
    expect(dialog.textContent).toContain("Funded spike B-04");
    expect(button(dialog, "Withdraw first").disabled).toBe(true);
    expect(button(dialog, "Destroy credential").disabled).toBe(false);
  });

  it("reports a failed live refresh without leaking provider detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("private RPC detail"))
        .mockResolvedValueOnce(new Response(JSON.stringify(liveRead), { status: 200 })),
    );
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => {
      button(harness.container, "Destroy credential").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    const input = dialog?.querySelector("input");
    if (!dialog || !input) throw new Error("Nuclear confirmation not found");
    expect(dialog?.textContent).toContain("Live read unavailable");
    expect(dialog?.textContent).not.toContain("private RPC detail");
    await act(async () => writeInput(input, agent.name));
    expect(button(dialog, "Destroy credential").disabled).toBe(true);
    await act(async () => {
      button(dialog, "Retry live read").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dialog.textContent).toContain("RPC healthy");
    expect(button(dialog, "Destroy credential").disabled).toBe(false);
  });

  it("times out a hung live read and keeps destruction disabled", async () => {
    vi.useFakeTimers();
    const read = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(read.promise));
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Destroy credential").click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    const input = dialog?.querySelector("input");
    if (!dialog || !input) throw new Error("Nuclear confirmation not found");
    await act(async () => writeInput(input, agent.name));

    await act(async () => vi.runOnlyPendingTimersAsync());

    expect(dialog.textContent).toContain("Live read unavailable");
    expect(button(dialog, "Destroy credential").disabled).toBe(true);
    expect(button(dialog, "Retry live read")).toBeDefined();
  });

  it("shows the pre-cancel float risk while the B-04 sweep remains disabled", async () => {
    const read = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(read.promise));
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Cancel credential").click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    const input = dialog?.querySelector("input");
    if (!dialog || !input) throw new Error("Cancel confirmation not found");
    await act(async () => writeInput(input, "CANCEL"));
    expect(button(dialog, "Cancel credential").disabled).toBe(true);
    await act(async () => {
      read.resolve(new Response(JSON.stringify(liveRead), { status: 200 }));
      await read.promise;
      await Promise.resolve();
    });
    expect(dialog.textContent).toContain("$1.25");
    expect(dialog.textContent).toContain("If it does, floats can remain at the old address");
    expect(dialog.textContent).toContain("pre-cancel or pre-destruction sweep");
    expect(button(dialog, "Withdraw first").disabled).toBe(true);
    expect(button(dialog, "Cancel credential").disabled).toBe(false);
  });

  it("keeps a mutation failure visible and retryable inside the active dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Revocation service unavailable." } }), {
          status: 503,
        }),
      ),
    );
    await act(async () => harness.root.render(<RevocationPanel agent={agent} />));
    await act(async () => button(harness.container, "Pause payments").click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error("Pause confirmation not found");
    await act(async () => {
      button(dialog, "Confirm pause").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
      "Revocation service unavailable.",
    );
    expect(button(dialog, "Confirm pause").disabled).toBe(false);
  });

  it("labels a Base Sepolia destructive preflight as test funds, never as mainnet", async () => {
    const read = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(read.promise));
    await act(async () => harness.root.render(<RevocationPanel agent={integrationAgent} />));
    await act(async () => button(harness.container, "Destroy credential").click());
    const dialog = harness.container.querySelector('[role="alertdialog"]');
    if (!dialog) throw new Error("Nuclear confirmation not found");

    expect(dialog.textContent).toContain("Refreshing Base Sepolia test funds");
    expect(dialog.textContent).not.toContain("Refreshing Base + Arbitrum");
    await act(async () => {
      read.resolve(new Response(JSON.stringify(integrationLiveRead), { status: 200 }));
      await read.promise;
      await Promise.resolve();
    });
    expect(dialog.textContent).toContain("Sandbox funds — no real value");
  });
});
