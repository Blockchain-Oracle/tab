/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProvisionPanel } from "./provision-panel";

describe("Provisioning gate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows naming and selected-agent context without inventing wallet state", () => {
    const html = renderToStaticMarkup(
      <ProvisionPanel
        agent={{
          agentAddress: null,
          id: "11111111-1111-4111-8111-111111111111",
          name: "Operations agent",
        }}
      />,
    );

    expect(html).toContain("BLOCKED · B-03");
    expect(html).toContain("Provision agent");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("OIDC_ISSUER_NOT_CONFIGURED");
    expect(html).toContain('name="agentName"');
    expect(html).toContain('value="Operations agent"');
    expect(html).toContain("Agent address");
    expect(html).toContain("Not provisioned");
    expect(html).toContain("No address or balance exists to read");
    expect(html).toContain("$0.00");
    expect(html).toContain("BLOCKED placeholder — not a live balance");
    expect(html).not.toContain("0x0000");
    expect(html).toContain("<form");
  });

  it("renders a stored real address as context without calling it newly provisioned", () => {
    const address = "0x1111111111111111111111111111111111111111";
    const html = renderToStaticMarkup(
      <ProvisionPanel agent={{ agentAddress: address, id: "agent", name: "Existing agent" }} />,
    );

    expect(html).toContain(address);
    expect(html).toContain("Existing stored address");
    expect(html).not.toContain("$0.00");
  });

  it("checks the runtime guard and renders its exact blocked response", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "OIDC_ISSUER_NOT_CONFIGURED",
            message: "Magic OIDC provisioning has not passed its live spike.",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <ProvisionPanel agent={{ agentAddress: null, id: "agent-id", name: "Operations agent" }} />,
      ),
    );
    const control = container.querySelector("button");
    if (!control) throw new Error("Provision control not found");
    await act(async () => {
      control.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/leash/provision", {
      body: JSON.stringify({ agentId: "agent-id", name: "Operations agent" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(container.textContent).toContain("OIDC_ISSUER_NOT_CONFIGURED");
    expect(container.textContent).toContain("has not passed its live spike");
    expect(container.textContent).not.toContain("0x0000");
    await act(async () => root.unmount());
    container.remove();
  });
});
