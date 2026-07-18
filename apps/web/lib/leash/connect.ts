import { eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents } from "../db/schema";

const MAX_CONNECT_BODY_BYTES = 2_048;
const MAX_CLIENT_NAME_LENGTH = 200;
const MAX_CLIENT_VERSION_LENGTH = 100;

export type AgentTransport = "http" | "mcp";

export interface ConnectAgentInput {
  agentId: string;
  clientName: string | null;
  clientVersion: string | null;
  transport: AgentTransport;
}

export interface ConnectRequest {
  clientName: string | null;
  clientVersion: string | null;
  transport: AgentTransport;
}

export class InvalidConnectRequestError extends Error {
  constructor() {
    super("The connect request is invalid.");
    this.name = "InvalidConnectRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]) {
  const keys = Object.keys(record);
  return keys.length <= allowed.length && keys.every((key) => allowed.includes(key));
}

function parseClientInfo(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "version"])) {
    throw new InvalidConnectRequestError();
  }
  const { name, version } = value;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > MAX_CLIENT_NAME_LENGTH ||
    (version !== undefined &&
      (typeof version !== "string" ||
        version.trim().length === 0 ||
        version.length > MAX_CLIENT_VERSION_LENGTH))
  ) {
    throw new InvalidConnectRequestError();
  }
  return { clientName: name, clientVersion: version ?? null };
}

export function parseConnectRequest(rawBody: string): ConnectRequest {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_CONNECT_BODY_BYTES) {
    throw new InvalidConnectRequestError();
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new InvalidConnectRequestError();
  }
  if (!isRecord(value) || !hasExactKeys(value, ["clientInfo", "transport"])) {
    throw new InvalidConnectRequestError();
  }
  if (value.transport !== "mcp" && value.transport !== "http") {
    throw new InvalidConnectRequestError();
  }

  const identity =
    value.clientInfo === undefined
      ? { clientName: null, clientVersion: null }
      : parseClientInfo(value.clientInfo);
  return { ...identity, transport: value.transport };
}

export async function connectAgent(db: Database, input: ConnectAgentInput) {
  return db.transaction(async (transaction) => {
    const [connected] = await transaction
      .update(agents)
      .set({
        clientName: input.clientName,
        clientVersion: input.clientVersion,
        connectionCount: sql`${agents.connectionCount} + 1`,
        firstSeenAt: sql`coalesce(${agents.firstSeenAt}, clock_timestamp())`,
        lastSeenAt: sql`clock_timestamp()`,
        transport: input.transport,
      })
      .where(eq(agents.id, input.agentId))
      .returning({
        agentAddress: agents.agentAddress,
        clientName: agents.clientName,
        clientVersion: agents.clientVersion,
        connectionCount: agents.connectionCount,
        firstSeenAt: agents.firstSeenAt,
        lastSeenAt: agents.lastSeenAt,
        paymentProfile: agents.paymentProfile,
        transport: agents.transport,
      });
    if (!connected?.firstSeenAt || !connected.lastSeenAt) {
      throw new Error("The authenticated Leash agent was not found");
    }

    await transaction.insert(agentEvents).values({
      actorSurface: "agent",
      agentId: input.agentId,
      metadata: {
        clientName: connected.clientName,
        clientVersion: connected.clientVersion,
        connectionCount: connected.connectionCount,
        transport: connected.transport,
      },
      type: "connect",
    });

    return {
      agentAddress: connected.agentAddress,
      clientName: connected.clientName,
      clientVersion: connected.clientVersion,
      connectionCount: connected.connectionCount,
      firstSeenAt: connected.firstSeenAt,
      lastSeenAt: connected.lastSeenAt,
      paymentProfile: connected.paymentProfile,
      transport: input.transport,
    };
  });
}
