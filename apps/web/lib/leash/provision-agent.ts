import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { getAddress } from "viem";

import type { Database } from "../db/client";
import { agentProvisionAttempts, agents, users } from "../db/schema";
import type { PaymentProfile } from "./payment-profile";

export const MAX_PROVISION_BODY_BYTES = 2_048;
const MAX_AGENT_NAME_LENGTH = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AGENT_PROVISION_ATTEMPT_LIMIT = 5;
export const AGENT_PROVISION_RATE_WINDOW_MS = 60 * 60 * 1_000;
export const AGENT_PROVISION_RETAINED_QUOTA = 10;

interface WalletClient {
  getOrCreateWallet(subject: string): Promise<string>;
}

export class InvalidAgentProvisionRequestError extends Error {
  constructor() {
    super("The agent provisioning request is invalid.");
    this.name = "InvalidAgentProvisionRequestError";
  }
}

export class AgentProvisionNotFoundError extends Error {
  constructor() {
    super("The owner or agent was not found.");
    this.name = "AgentProvisionNotFoundError";
  }
}

export class AgentProvisionConflictError extends Error {
  constructor() {
    super("The agent wallet identity conflicts with persisted state.");
    this.name = "AgentProvisionConflictError";
  }
}

export class AgentProvisionRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many agent provisioning attempts. Try again later.");
    this.name = "AgentProvisionRateLimitedError";
  }
}

export class AgentProvisionQuotaExceededError extends Error {
  constructor() {
    super("The agent provisioning quota has been reached.");
    this.name = "AgentProvisionQuotaExceededError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(rawBody: string) {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PROVISION_BODY_BYTES) {
    throw new InvalidAgentProvisionRequestError();
  }
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new InvalidAgentProvisionRequestError();
  }
  if (!record(value)) throw new InvalidAgentProvisionRequestError();
  const keys = Object.keys(value);
  if (
    keys.some((key) => key !== "agentId" && key !== "name" && key !== "network") ||
    !keys.includes("name")
  ) {
    throw new InvalidAgentProvisionRequestError();
  }
  const network = value.network ?? "testnet";
  if (network !== "testnet" && network !== "mainnet") {
    throw new InvalidAgentProvisionRequestError();
  }
  const rawName = typeof value.name === "string" ? value.name : "";
  const name = rawName.trim();
  if (!name || name.length > MAX_AGENT_NAME_LENGTH || rawName.length > MAX_AGENT_NAME_LENGTH) {
    throw new InvalidAgentProvisionRequestError();
  }
  const agentId = value.agentId;
  if (agentId !== undefined && (typeof agentId !== "string" || !UUID.test(agentId))) {
    throw new InvalidAgentProvisionRequestError();
  }
  return { agentId, name, network } as {
    agentId?: string;
    name: string;
    network: "mainnet" | "testnet";
  };
}

function opaqueSubject() {
  return `agent_${randomBytes(32).toString("base64url")}`;
}

const provisionIdentity = {
  agentAddress: agents.agentAddress,
  id: agents.id,
  name: agents.name,
  paymentProfile: agents.paymentProfile,
  signerSubject: agents.signerSubject,
  status: agents.status,
};

type ProvisionTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function consumeProviderAttempt(
  transaction: ProvisionTransaction,
  ownerId: string,
  now: Date,
) {
  const cutoff = new Date(now.getTime() - AGENT_PROVISION_RATE_WINDOW_MS);
  await transaction
    .delete(agentProvisionAttempts)
    .where(
      and(
        eq(agentProvisionAttempts.ownerId, ownerId),
        lte(agentProvisionAttempts.createdAt, cutoff),
      ),
    );
  const [recent] = await transaction
    .select({ value: count() })
    .from(agentProvisionAttempts)
    .where(eq(agentProvisionAttempts.ownerId, ownerId));
  if ((recent?.value ?? 0) >= AGENT_PROVISION_ATTEMPT_LIMIT) {
    const [oldest] = await transaction
      .select({ createdAt: agentProvisionAttempts.createdAt })
      .from(agentProvisionAttempts)
      .where(eq(agentProvisionAttempts.ownerId, ownerId))
      .orderBy(asc(agentProvisionAttempts.createdAt), asc(agentProvisionAttempts.id))
      .limit(1);
    const retryAfterSeconds = oldest
      ? Math.max(
          1,
          Math.ceil(
            (oldest.createdAt.getTime() + AGENT_PROVISION_RATE_WINDOW_MS - now.getTime()) / 1_000,
          ),
        )
      : 1;
    throw new AgentProvisionRateLimitedError(retryAfterSeconds);
  }
  await transaction.insert(agentProvisionAttempts).values({ createdAt: now, ownerId });
}

async function reserveIdentity(
  database: Database,
  options: {
    agentId?: string;
    name: string;
    now: Date;
    ownerId: string;
    paymentProfile: PaymentProfile;
  },
) {
  return database.transaction(async (transaction) => {
    const [owner] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, options.ownerId))
      .for("update");
    if (!owner) throw new AgentProvisionNotFoundError();

    const where = options.agentId
      ? and(eq(agents.id, options.agentId), eq(agents.ownerId, options.ownerId))
      : and(
          eq(agents.ownerId, options.ownerId),
          eq(agents.name, options.name),
          eq(agents.paymentProfile, options.paymentProfile),
          eq(agents.status, "provisioned"),
        );
    const [existing] = await transaction
      .select(provisionIdentity)
      .from(agents)
      .where(where)
      .orderBy(desc(agents.createdAt), desc(agents.id))
      .limit(1)
      .for("update");
    if (existing) {
      if (
        existing.paymentProfile !== options.paymentProfile ||
        existing.status !== "provisioned" ||
        !existing.signerSubject
      ) {
        throw new AgentProvisionConflictError();
      }
      if (existing.name !== options.name) {
        const [renamed] = await transaction
          .update(agents)
          .set({ name: options.name })
          .where(eq(agents.id, existing.id))
          .returning(provisionIdentity);
        if (!renamed) throw new AgentProvisionNotFoundError();
        if (!renamed.agentAddress) {
          await consumeProviderAttempt(transaction, options.ownerId, options.now);
        }
        return renamed;
      }
      if (!existing.agentAddress) {
        await consumeProviderAttempt(transaction, options.ownerId, options.now);
      }
      return existing;
    }
    if (options.agentId) throw new AgentProvisionNotFoundError();
    const [retained] = await transaction
      .select({ value: count() })
      .from(agents)
      .where(eq(agents.ownerId, options.ownerId));
    if ((retained?.value ?? 0) >= AGENT_PROVISION_RETAINED_QUOTA) {
      throw new AgentProvisionQuotaExceededError();
    }
    await consumeProviderAttempt(transaction, options.ownerId, options.now);
    const [created] = await transaction
      .insert(agents)
      .values({
        name: options.name,
        ownerId: options.ownerId,
        paymentProfile: options.paymentProfile,
        signerSubject: opaqueSubject(),
        status: "provisioned",
      })
      .returning(provisionIdentity);
    if (!created?.signerSubject) throw new Error("PostgreSQL did not reserve an agent identity");
    return created;
  });
}

export async function provisionAgentWallet(options: {
  client: WalletClient;
  database: Database;
  now?: Date;
  ownerId: string;
  paymentProfile: PaymentProfile;
  rawBody: string;
}) {
  const request = parseRequest(options.rawBody);
  // The caller's profile is the DEFAULT (testnet); mainnet is a per-agent
  // opt-in from the provision request.
  const paymentProfile: PaymentProfile =
    request.network === "mainnet" ? "mainnet" : options.paymentProfile;
  const reserved = await reserveIdentity(options.database, {
    ...(request.agentId ? { agentId: request.agentId } : {}),
    name: request.name,
    now: options.now ?? new Date(),
    ownerId: options.ownerId,
    paymentProfile,
  });
  if (!reserved.signerSubject) throw new AgentProvisionConflictError();
  if (reserved.agentAddress) {
    return {
      agentAddress: getAddress(reserved.agentAddress),
      id: reserved.id,
      name: reserved.name,
      paymentProfile: reserved.paymentProfile,
    };
  }
  const returnedAddress = getAddress(
    await options.client.getOrCreateWallet(reserved.signerSubject),
  );

  return options.database.transaction(async (transaction) => {
    const [current] = await transaction
      .select(provisionIdentity)
      .from(agents)
      .where(and(eq(agents.id, reserved.id), eq(agents.ownerId, options.ownerId)))
      .for("update");
    if (!current || current.signerSubject !== reserved.signerSubject) {
      throw new AgentProvisionConflictError();
    }
    if (current.agentAddress && getAddress(current.agentAddress) !== returnedAddress) {
      throw new AgentProvisionConflictError();
    }
    const stored = current.agentAddress
      ? current
      : (
          await transaction
            .update(agents)
            .set({ agentAddress: returnedAddress })
            .where(eq(agents.id, current.id))
            .returning(provisionIdentity)
        )[0];
    if (!stored?.agentAddress) throw new Error("PostgreSQL did not persist the agent wallet");
    return {
      agentAddress: getAddress(stored.agentAddress),
      id: stored.id,
      name: stored.name,
      paymentProfile: stored.paymentProfile,
    };
  });
}
