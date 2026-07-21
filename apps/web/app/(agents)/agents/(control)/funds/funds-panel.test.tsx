import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LeashFundsSnapshot } from "../../../../../lib/leash/fund-balances";
import { FundsPanel } from "./funds-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const address = "0x1111111111111111111111111111111111111111";

describe("Agent funds surface", () => {
  it("renders only verified balances and keeps every B-04 money action disabled", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        {
          balanceAtomic: "1250000",
          label: "Base",
          network: "eip155:8453",
          testFunds: false,
        },
        {
          balanceAtomic: null,
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      paymentProfile: "mainnet",
      unified: { balanceUsd: 8.5, depositAddress: address, state: "available" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Operations agent"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("$8.50");
    expect(html).toContain("Owner unified balance");
    expect(html).toContain("Includes floats");
    expect(html).toContain("Base");
    expect(html).toContain("$1.25");
    expect(html).toContain("Arbitrum");
    expect(html).toContain("Unavailable");
    expect(html).toContain("PARTIAL READ");
    expect(html).toContain(address);
    expect(html).toContain("Agent signing address");
    expect(html).toContain("Send native USDC on Base or Arbitrum to this address.");
    expect(html).toContain("BLOCKED · B-04");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).not.toContain("Polygon");
    expect(html).not.toContain("Topping up");
  });

  it("renders no invented address or zero balance before provisioning", () => {
    const snapshot = {
      agentAddress: null,
      floats: null,
      paymentProfile: "mainnet",
      unified: { state: "not_provisioned" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="New agent"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("No agent wallet yet");
    expect(html).toContain("NO WALLET YET");
    expect(html).toContain("Provision your agent to get its wallet address");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("0x0000");
  });

  it("keeps the real funding address visible when Particle is unavailable", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        { balanceAtomic: "0", label: "Base", network: "eip155:8453", testFunds: false },
        {
          balanceAtomic: "0",
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      paymentProfile: "mainnet",
      unified: { state: "configuration_unavailable" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Configured address"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );
    expect(html).toContain(address);
    expect(html).toContain("Send native USDC on Base or Arbitrum to this address.");
    expect(html).toContain("Particle read configuration is unavailable.");
    expect(html).not.toContain("Claim test funds");
  });

  it("labels reads live only when Particle and both float networks succeeded", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        { balanceAtomic: "1", label: "Base", network: "eip155:8453", testFunds: false },
        {
          balanceAtomic: "2",
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      paymentProfile: "mainnet",
      unified: { balanceUsd: 1, depositAddress: address, state: "available" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Live agent"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );
    expect(html).toContain("LIVE READS");
    expect(html).not.toContain("PARTIAL READ");
    expect(html).toContain("Native USDC float total");
    expect(html).toContain("LOW · BELOW $5 FLOOR");
    expect(html).toContain("The fixed $5 floor is active");
    expect(html).toContain("Percentage threshold is unavailable until a real top-up event exists");
  });

  it("does not label a fully-read float above the fixed floor as low", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        {
          balanceAtomic: "4000000",
          label: "Base",
          network: "eip155:8453",
          testFunds: false,
        },
        {
          balanceAtomic: "2000000",
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      paymentProfile: "mainnet",
      unified: { balanceUsd: 6, depositAddress: address, state: "available" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Funded agent"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );
    expect(html).toContain("$6.00");
    expect(html).toContain("ABOVE FIXED FLOOR");
    expect(html).not.toContain("LOW · BELOW $5 FLOOR");
  });

  it("retains a nuked address as evidence without inviting deposits or withdrawal", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        { balanceAtomic: "0", label: "Base", network: "eip155:8453", testFunds: false },
        {
          balanceAtomic: "0",
          label: "Arbitrum",
          network: "eip155:42161",
          testFunds: false,
        },
      ],
      paymentProfile: "mainnet",
      unified: { state: "configuration_unavailable" },
    } satisfies LeashFundsSnapshot;
    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Nuked agent"
        agentStatus="nuked"
        snapshot={snapshot}
      />,
    );
    expect(html).toContain("HISTORY ONLY");
    expect(html).toContain("Do not deposit");
    expect(html).toContain("Agent withdrawal is unavailable after nuclear destruction");
    expect(html).toContain("EMPTY");
    expect(html).not.toContain("Send native USDC");
  });

  it("keeps Base Sepolia integration balances unmistakably separate from real money", () => {
    const snapshot = {
      agentAddress: address,
      floats: [
        {
          balanceAtomic: "1000",
          label: "Base Sepolia",
          network: "eip155:84532",
          testFunds: true,
        },
      ],
      paymentProfile: "base_sepolia_integration",
      unified: { state: "not_applicable_testnet" },
    } satisfies LeashFundsSnapshot;

    const html = renderToStaticMarkup(
      <FundsPanel
        agentId="33333333-3333-4333-8333-333333333333"
        agentName="Integration agent"
        agentStatus="provisioned"
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("Sandbox funds — no real value");
    expect(html).toContain("Claim test funds");
    expect(html).toContain("Base Sepolia");
    expect(html).toContain("eip155:84532");
    expect(html).toContain("Send Circle Base Sepolia USDC test funds to this address.");
    expect(html).toContain("Particle mainnet balance is separate from this testnet profile.");
    expect(html).not.toContain("Send native USDC on Base or Arbitrum");
  });
});
