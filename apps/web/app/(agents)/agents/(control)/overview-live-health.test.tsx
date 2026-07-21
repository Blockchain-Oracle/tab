// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { OverviewLiveHealth } from "./overview-live-health";

describe("overview live read health", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    refresh.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("claims Live only after receipts, cap, and float reads all succeed", async () => {
    const request = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const body = String(input).includes("/float-balances") ? { health: "healthy" } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", request);
    await act(async () => {
      root.render(<OverviewLiveHealth agentId="11111111-1111-4111-8111-111111111111" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Live");
    expect(container.textContent).not.toContain("3s refresh");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports partial reads instead of Live when an RPC-backed float read is incomplete", async () => {
    const request = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const body = String(input).includes("/float-balances") ? { health: "partial" } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", request);
    await act(async () => {
      root.render(<OverviewLiveHealth agentId="11111111-1111-4111-8111-111111111111" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Partial reads");
    expect(container.textContent).not.toContain("Live");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports delayed updates when any real read fails", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", request);
    await act(async () => {
      root.render(<OverviewLiveHealth agentId="11111111-1111-4111-8111-111111111111" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Updates delayed");
    expect(refresh).not.toHaveBeenCalled();
  });
});
