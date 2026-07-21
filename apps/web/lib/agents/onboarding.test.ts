import { describe, expect, it } from "vitest";

import { type AgentOnboardingEvidence, deriveAgentOnboarding, fundAckKey } from "./onboarding";

const address = "0x1111111111111111111111111111111111111111";
const agentId = "33333333-3333-4333-8333-333333333333";

function evidence(overrides: Partial<AgentOnboardingEvidence> = {}): AgentOnboardingEvidence {
  return {
    agentId,
    agent: {
      agentAddress: address,
      firstSeenAt: null,
      paymentProfile: "base_sepolia_integration",
      status: "provisioned",
    },
    capConfigured: false,
    manualDone: new Set(),
    settledReceiptId: null,
    usdcGrantRecorded: false,
    ...overrides,
  };
}

function step(state: ReturnType<typeof deriveAgentOnboarding>, key: string) {
  const found = state.steps.find((entry) => entry.key === key);
  if (!found) throw new Error(`step ${key} missing`);
  return found;
}

describe("agent onboarding derivation", () => {
  it("starts with nothing done and provisioning as the current step", () => {
    const state = deriveAgentOnboarding(evidence({ agent: null }));
    expect(state.completedCount).toBe(0);
    expect(state.currentKey).toBe("provision_agent");
    expect(state.autoGrantEligible).toBe(false);
  });

  it("never counts a cancelled or nuked agent as provisioned", () => {
    for (const status of ["cancelled", "nuked"] as const) {
      const state = deriveAgentOnboarding(
        evidence({
          agent: {
            agentAddress: address,
            firstSeenAt: null,
            paymentProfile: "base_sepolia_integration",
            status,
          },
        }),
      );
      expect(step(state, "provision_agent").done).toBe(false);
    }
  });

  it("marks testnet funding done only from a recorded USDC grant, never from an ack", () => {
    const acked = deriveAgentOnboarding(evidence({ manualDone: new Set(["fund_agent"]) }));
    expect(step(acked, "fund_agent").done).toBe(false);
    expect(step(acked, "fund_agent").completion).toBe("derived");

    const granted = deriveAgentOnboarding(evidence({ usdcGrantRecorded: true }));
    expect(step(granted, "fund_agent").done).toBe(true);
  });

  it("treats mainnet funding as a manual acknowledgement, never a faucet grant", () => {
    const mainnet = {
      agentAddress: address,
      firstSeenAt: null,
      paymentProfile: "mainnet",
      status: "provisioned",
    } as const;
    const granted = deriveAgentOnboarding(evidence({ agent: mainnet, usdcGrantRecorded: true }));
    expect(step(granted, "fund_agent").done).toBe(false);
    expect(step(granted, "fund_agent").completion).toBe("manual");

    const acked = deriveAgentOnboarding(
      evidence({ agent: mainnet, manualDone: new Set([fundAckKey(agentId)]) }),
    );
    expect(step(acked, "fund_agent").done).toBe(true);
    expect(acked.autoGrantEligible).toBe(false);

    const otherAgentAck = deriveAgentOnboarding(
      evidence({ agent: mainnet, manualDone: new Set([fundAckKey("other-agent")]) }),
    );
    expect(step(otherAgentAck, "fund_agent").done).toBe(false);
  });

  it("auto-grants only when funding is the actual next step on a live testnet agent", () => {
    const notYet = deriveAgentOnboarding(evidence());
    expect(notYet.currentKey).toBe("set_cap");
    expect(notYet.autoGrantEligible).toBe(false);

    const ready = deriveAgentOnboarding(evidence({ capConfigured: true }));
    expect(ready.currentKey).toBe("fund_agent");
    expect(ready.autoGrantEligible).toBe(true);

    const funded = deriveAgentOnboarding(
      evidence({ capConfigured: true, usdcGrantRecorded: true }),
    );
    expect(funded.autoGrantEligible).toBe(false);
  });

  it("derives connection and first paid call from proxy and receipt evidence", () => {
    const state = deriveAgentOnboarding(
      evidence({
        agent: {
          agentAddress: address,
          firstSeenAt: new Date("2026-07-18T10:00:00Z"),
          paymentProfile: "base_sepolia_integration",
          status: "provisioned",
        },
        capConfigured: true,
        settledReceiptId: "44444444-4444-4444-8444-444444444444",
        usdcGrantRecorded: true,
      }),
    );
    expect(step(state, "connect_mcp").done).toBe(true);
    expect(step(state, "first_paid_call").done).toBe(true);
    expect(state.currentKey).toBe("review_evidence");
    expect(state.completedCount).toBe(5);
  });

  it("completes the journey after the evidence review acknowledgement", () => {
    const state = deriveAgentOnboarding(
      evidence({
        agent: {
          agentAddress: address,
          firstSeenAt: new Date("2026-07-18T10:00:00Z"),
          paymentProfile: "base_sepolia_integration",
          status: "provisioned",
        },
        capConfigured: true,
        manualDone: new Set(["review_evidence"]),
        settledReceiptId: "44444444-4444-4444-8444-444444444444",
        usdcGrantRecorded: true,
      }),
    );
    expect(state.completedCount).toBe(6);
    expect(state.currentKey).toBeNull();
  });
});
