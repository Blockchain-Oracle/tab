import { createFaucetFunder, executeGrant, type FaucetGrantReport } from "@tab/faucet";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { faucetGrants } from "../db/faucet-schema";
import { agents } from "../db/schema";
import { consumeRateLimits } from "../http/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;

export class FaucetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaucetUnavailableError";
  }
}

export class FaucetAgentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "FaucetAgentError";
  }
}

export function faucetConfig() {
  const funderPrivateKey = process.env.FAUCET_FUNDER_PRIVATE_KEY?.trim();
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  if (!funderPrivateKey || !rpcUrl) {
    throw new FaucetUnavailableError(
      "The faucet is not configured. Set FAUCET_FUNDER_PRIVATE_KEY and BASE_SEPOLIA_RPC_URL.",
    );
  }
  return { funderPrivateKey, rpcUrl };
}

/**
 * Claim a starter grant for an owner's agent address. Testnet-only twice
 * over: the engine is chain-bound to Base Sepolia AND the agent must run
 * the base_sepolia_integration profile. Throttled per owner, per recipient
 * address, and per client IP inside one transaction.
 */
export async function claimAgentGrant(
  db: Database,
  input: { agentId: string; clientIp: string; ownerId: string },
): Promise<FaucetGrantReport> {
  const config = faucetConfig();

  const [agent] = await db
    .select({
      address: agents.agentAddress,
      paymentProfile: agents.paymentProfile,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.ownerId, input.ownerId)))
    .limit(1);

  if (!agent) throw new FaucetAgentError("AGENT_NOT_FOUND", "The agent was not found.");
  if (!agent.address) {
    throw new FaucetAgentError("AGENT_NOT_PROVISIONED", "Provision the agent wallet first.");
  }
  if (agent.paymentProfile !== "base_sepolia_integration") {
    throw new FaucetAgentError(
      "MAINNET_AGENT",
      "Test funds are only granted to Base Sepolia agents — never on mainnet.",
    );
  }
  if (agent.status === "cancelled" || agent.status === "nuked") {
    throw new FaucetAgentError("AGENT_INACTIVE", "This agent can no longer receive funds.");
  }

  const recipient = agent.address;
  // Preflight BEFORE consuming rate slots: an unconfigured or dry treasury
  // must not burn a legitimate user's daily claims.
  const funder = createFaucetFunder(config);
  const treasury = await funder.preflight();
  if (!treasury.funded) {
    throw new FaucetUnavailableError("The faucet treasury cannot cover a full grant right now.");
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
    await consumeRateLimits(
      transaction,
      [
        { limit: 3, scope: "faucet:recipient", subject: recipient.toLowerCase(), windowMs: DAY_MS },
        { limit: 5, scope: "faucet:owner", subject: input.ownerId, windowMs: DAY_MS },
        { limit: 20, scope: "faucet:ip", subject: input.clientIp, windowMs: HOUR_MS },
      ],
      now,
    );
  });

  const report = await executeGrant(funder, recipient);

  await db.insert(faucetGrants).values({
    ownerId: input.ownerId,
    recipient,
    report,
  });

  return report;
}
