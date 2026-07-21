import { and, asc, eq, or, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agents, caps, faucetGrants, onboardingProgress, receipts } from "../db/schema";
import type { OwnerAgent } from "../leash/owner-agents";

/**
 * Agent-owner onboarding. Mirrors the merchant Quickstart contract: steps
 * complete from real integration evidence, never from optimistic UI. The
 * only manual acknowledgements are ones no system event can prove — and
 * each is server-validated against the evidence that makes it plausible.
 * Progress is owner-scoped (one journey per owner); derived steps are
 * computed against the currently selected agent.
 */
export const AGENT_ONBOARDING_STEPS = [
  { key: "provision_agent", title: "Provision the agent wallet" },
  { key: "set_cap", title: "Set the spending cap" },
  { key: "fund_agent", title: "Fund the agent" },
  { key: "connect_mcp", title: "Connect your MCP client" },
  { key: "first_paid_call", title: "Make the first paid call" },
  { key: "review_evidence", title: "Review the receipt evidence" },
] as const;

export type AgentOnboardingStepKey = (typeof AGENT_ONBOARDING_STEPS)[number]["key"];

export function isAgentOnboardingStepKey(value: unknown): value is AgentOnboardingStepKey {
  return AGENT_ONBOARDING_STEPS.some((step) => step.key === value);
}

export class OnboardingStepNotManualError extends Error {
  readonly code = "ONBOARDING_STEP_NOT_MANUAL";

  constructor() {
    super("This step is completed by a real integration event.");
    this.name = "OnboardingStepNotManualError";
  }
}

export class OnboardingEvidenceMissingError extends Error {
  readonly code = "ONBOARDING_EVIDENCE_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "OnboardingEvidenceMissingError";
  }
}

type EvidenceAgent = Pick<OwnerAgent, "agentAddress" | "firstSeenAt" | "paymentProfile" | "status">;

/** Progress row key for a mainnet funding acknowledgement of ONE agent. */
export function fundAckKey(agentId: string | null) {
  return `fund_agent:${agentId ?? "none"}`;
}

export type AgentOnboardingEvidence = {
  agent: EvidenceAgent | null;
  agentId: string | null;
  capConfigured: boolean;
  manualDone: ReadonlySet<string>;
  /** A faucet grant whose USDC leg verifiably put test funds at the address. */
  usdcGrantRecorded: boolean;
  settledReceiptId: string | null;
};

export type AgentOnboardingState = ReturnType<typeof deriveAgentOnboarding>;

export function deriveAgentOnboarding(evidence: AgentOnboardingEvidence) {
  const { agent } = evidence;
  const provisioned =
    Boolean(agent?.agentAddress) && agent?.status !== "cancelled" && agent?.status !== "nuked";
  const testnet = agent?.paymentProfile === "base_sepolia_integration";

  const done: Record<AgentOnboardingStepKey, boolean> = {
    connect_mcp: Boolean(agent?.firstSeenAt),
    first_paid_call: Boolean(evidence.settledReceiptId),
    // Testnet funding is proven by the recorded grant; mainnet deposits
    // happen outside our systems, so the owner acknowledges them — scoped
    // per agent, so acknowledging one agent never marks another funded.
    fund_agent: testnet
      ? evidence.usdcGrantRecorded
      : evidence.manualDone.has(fundAckKey(evidence.agentId)),
    provision_agent: provisioned,
    review_evidence: evidence.manualDone.has("review_evidence"),
    set_cap: evidence.capConfigured,
  };

  const steps = AGENT_ONBOARDING_STEPS.map((step) => ({
    ...step,
    completion:
      step.key === "review_evidence" || (step.key === "fund_agent" && agent && !testnet)
        ? ("manual" as const)
        : ("derived" as const),
    done: done[step.key],
  }));
  const currentKey = steps.find((step) => !step.done)?.key ?? null;

  return {
    // The grant fires by itself only when it is the actual next step for a
    // live testnet agent — never for mainnet, never before provisioning.
    autoGrantEligible: currentKey === "fund_agent" && testnet && provisioned,
    completedCount: steps.filter((step) => step.done).length,
    currentKey,
    settledReceiptId: evidence.settledReceiptId,
    steps,
  };
}

const USDC_FUNDED = sql`${faucetGrants.report} @> '{"legs":[{"asset":"usdc","state":"funded"}]}'::jsonb`;
const USDC_ALREADY = sql`${faucetGrants.report} @> '{"legs":[{"asset":"usdc","state":"already-funded"}]}'::jsonb`;

export async function readAgentOnboarding(
  db: Database,
  ownerId: string,
  agent: OwnerAgent | null,
): Promise<AgentOnboardingState> {
  const wantGrant = Boolean(
    agent?.agentAddress && agent.paymentProfile === "base_sepolia_integration",
  );
  const [manual, capRows, grantRows, receiptRows] = await Promise.all([
    db
      .select({ stepKey: onboardingProgress.stepKey })
      .from(onboardingProgress)
      .where(eq(onboardingProgress.ownerId, ownerId)),
    agent
      ? db.select({ agentId: caps.agentId }).from(caps).where(eq(caps.agentId, agent.id)).limit(1)
      : [],
    wantGrant && agent?.agentAddress
      ? db
          .select({ id: faucetGrants.id })
          .from(faucetGrants)
          .where(and(eq(faucetGrants.recipient, agent.agentAddress), or(USDC_FUNDED, USDC_ALREADY)))
          .limit(1)
      : [],
    agent
      ? db
          .select({ id: receipts.id })
          .from(receipts)
          .where(and(eq(receipts.agentId, agent.id), eq(receipts.status, "settled")))
          .orderBy(asc(receipts.createdAt))
          .limit(1)
      : [],
  ]);

  return deriveAgentOnboarding({
    agent,
    agentId: agent?.id ?? null,
    capConfigured: capRows.length > 0,
    manualDone: new Set(manual.map((row) => row.stepKey)),
    settledReceiptId: receiptRows[0]?.id ?? null,
    usdcGrantRecorded: grantRows.length > 0,
  });
}

/**
 * Record a manual acknowledgement — only for steps whose evidence lives
 * outside our systems, and only when that evidence is plausible:
 * `fund_agent` requires an owned mainnet agent; `review_evidence` requires
 * a settled receipt to exist for one of the owner's agents.
 */
export async function completeOnboardingStep(
  db: Database,
  input: { agentId?: string; ownerId: string; stepKey: AgentOnboardingStepKey },
) {
  let storedKey: string = input.stepKey;
  if (input.stepKey === "fund_agent") {
    if (!input.agentId) {
      throw new OnboardingEvidenceMissingError("An agentId is required to acknowledge funding.");
    }
    const [agent] = await db
      .select({ paymentProfile: agents.paymentProfile })
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.ownerId, input.ownerId)))
      .limit(1);
    if (!agent) throw new OnboardingEvidenceMissingError("The agent was not found.");
    if (agent.paymentProfile !== "mainnet") throw new OnboardingStepNotManualError();
    storedKey = fundAckKey(input.agentId);
  } else if (input.stepKey === "review_evidence") {
    const [settled] = await db
      .select({ id: receipts.id })
      .from(receipts)
      .innerJoin(agents, eq(agents.id, receipts.agentId))
      .where(and(eq(agents.ownerId, input.ownerId), eq(receipts.status, "settled")))
      .limit(1);
    if (!settled) {
      throw new OnboardingEvidenceMissingError("There is no settled receipt to review yet.");
    }
  } else {
    throw new OnboardingStepNotManualError();
  }

  const [row] = await db
    .insert(onboardingProgress)
    .values({
      doneAt: new Date(),
      ownerId: input.ownerId,
      source: "manual",
      stepKey: storedKey,
    })
    .onConflictDoUpdate({
      set: { doneAt: new Date(), source: "manual" },
      target: [onboardingProgress.ownerId, onboardingProgress.stepKey],
    })
    .returning({ doneAt: onboardingProgress.doneAt, stepKey: onboardingProgress.stepKey });
  if (!row) throw new Error("Onboarding progress was not stored");
  return row;
}
