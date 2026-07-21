import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StartPanel, type StartPanelState } from "./start-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const address = "0x1111111111111111111111111111111111111111";
const agentId = "33333333-3333-4333-8333-333333333333";

function state(overrides: Partial<StartPanelState> = {}): StartPanelState {
  return {
    autoGrantEligible: false,
    completedCount: 2,
    currentKey: "fund_agent",
    settledReceiptId: null,
    steps: [
      { completion: "derived", done: true, key: "provision_agent", title: "Provision" },
      { completion: "derived", done: true, key: "set_cap", title: "Set cap" },
      { completion: "derived", done: false, key: "fund_agent", title: "Fund the agent" },
      { completion: "derived", done: false, key: "connect_mcp", title: "Connect" },
      { completion: "derived", done: false, key: "first_paid_call", title: "First paid call" },
      { completion: "manual", done: false, key: "review_evidence", title: "Review evidence" },
    ],
    ...overrides,
  };
}

describe("agent get-started wizard", () => {
  it("embeds the real faucet claim for a provisioned testnet agent", () => {
    const html = renderToStaticMarkup(
      <StartPanel
        agentAddress={address}
        agentId={agentId}
        agentName="Ops agent"
        state={state()}
        testnet
      />,
    );
    expect(html).toContain("Claim test funds");
    expect(html).toContain("Sandbox funds — no real value");
    expect(html).not.toContain("Mark done");
  });

  it("offers only a manual acknowledgement for mainnet funding — no faucet", () => {
    const mainnetSteps = state();
    const fundStep = mainnetSteps.steps.find((step) => step.key === "fund_agent");
    if (fundStep) fundStep.completion = "manual";
    const html = renderToStaticMarkup(
      <StartPanel
        agentAddress={address}
        agentId={agentId}
        agentName="Ops agent"
        state={mainnetSteps}
        testnet={false}
      />,
    );
    expect(html).not.toContain("Claim test funds");
    expect(html).toContain("Mark done");
  });

  it("withholds the evidence acknowledgement until a settled receipt exists", () => {
    const html = renderToStaticMarkup(
      <StartPanel
        agentAddress={address}
        agentId={agentId}
        agentName="Ops agent"
        state={state()}
        testnet
      />,
    );
    expect(html).not.toContain("Mark reviewed");

    const withReceipt = renderToStaticMarkup(
      <StartPanel
        agentAddress={address}
        agentId={agentId}
        agentName="Ops agent"
        state={state({ settledReceiptId: "44444444-4444-4444-8444-444444444444" })}
        testnet
      />,
    );
    expect(withReceipt).toContain("Mark reviewed");
    expect(withReceipt).toContain("/agents/receipts/44444444-4444-4444-8444-444444444444");
  });
});
