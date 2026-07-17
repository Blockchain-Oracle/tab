import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { agentEvents, agents, leashKeys } from "../db/schema";

const LEASH_KEY_PREFIX = "leash_sk_";
const LEASH_KEY_MATERIAL_LENGTH = 43;

export class InvalidLeashKeyError extends Error {
  readonly code = "INVALID_LEASH_KEY";

  constructor() {
    super("The Leash key is invalid or revoked.");
    this.name = "InvalidLeashKeyError";
  }
}

export class ActiveLeashKeyExistsError extends Error {
  constructor() {
    super("An active Leash key already exists for this agent.");
    this.name = "ActiveLeashKeyExistsError";
  }
}

export class ActiveLeashKeyNotFoundError extends Error {
  constructor() {
    super("The active Leash key was not found.");
    this.name = "ActiveLeashKeyNotFoundError";
  }
}

export class LeashAgentNotFoundError extends Error {
  constructor() {
    super("The Leash agent was not found.");
    this.name = "LeashAgentNotFoundError";
  }
}

export interface LeashKeyScope {
  agentId: string;
}

export interface OwnedLeashKeyScope extends LeashKeyScope {
  ownerId: string;
}

export interface LeashKeyTarget extends LeashKeyScope {
  keyId: string;
}

export interface OwnedLeashKeyTarget extends LeashKeyTarget {
  ownerId: string;
}

export interface LeashKeyPrincipal {
  agentId: string;
  leashKeyId: string;
}

const keySummary = {
  agentId: leashKeys.agentId,
  createdAt: leashKeys.createdAt,
  id: leashKeys.id,
  last4: leashKeys.last4,
  lastUsedAt: leashKeys.lastUsedAt,
  prefix: leashKeys.prefix,
  revokedAt: leashKeys.revokedAt,
  rotatedFromId: leashKeys.rotatedFromId,
};

export function hashLeashKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateLeashKey() {
  const secret = `${LEASH_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    hash: hashLeashKey(secret),
    last4: secret.slice(-4),
    prefix: LEASH_KEY_PREFIX,
    secret,
  };
}

export function readBearerLeashKey(authorizationHeader: string | null) {
  const bearer = authorizationHeader?.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1];
  if (
    !bearer ||
    !new RegExp(`^${LEASH_KEY_PREFIX}[A-Za-z0-9_-]{${LEASH_KEY_MATERIAL_LENGTH}}$`).test(bearer)
  ) {
    throw new InvalidLeashKeyError();
  }
  return bearer;
}

type InternalLeashKeyScope = LeashKeyScope & { ownerId?: string };
type InternalLeashKeyTarget = LeashKeyTarget & { ownerId?: string };

function agentScope(input: InternalLeashKeyScope) {
  return input.ownerId
    ? and(eq(agents.id, input.agentId), eq(agents.ownerId, input.ownerId))
    : eq(agents.id, input.agentId);
}

export async function readOwnerLeashKey(db: Database, input: OwnedLeashKeyScope) {
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(agentScope(input))
      .for("share");
    if (!agent) throw new LeashAgentNotFoundError();

    const [key] = await transaction
      .select(keySummary)
      .from(leashKeys)
      .where(and(eq(leashKeys.agentId, input.agentId), isNull(leashKeys.revokedAt)))
      .limit(1);
    return key ?? null;
  });
}

async function issueScopedLeashKey(db: Database, input: InternalLeashKeyScope) {
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(agentScope(input))
      .for("update");
    if (!agent) throw new LeashAgentNotFoundError();

    const [active] = await transaction
      .select({ id: leashKeys.id })
      .from(leashKeys)
      .where(and(eq(leashKeys.agentId, input.agentId), isNull(leashKeys.revokedAt)))
      .limit(1);
    if (active) throw new ActiveLeashKeyExistsError();

    const material = generateLeashKey();
    const [key] = await transaction
      .insert(leashKeys)
      .values({
        agentId: input.agentId,
        hashedKey: material.hash,
        last4: material.last4,
        prefix: material.prefix,
      })
      .returning(keySummary);
    if (!key) throw new Error("PostgreSQL did not return the issued Leash key");

    return { key, secret: material.secret };
  });
}

export function issueLeashKey(db: Database, input: LeashKeyScope) {
  return issueScopedLeashKey(db, input);
}

export function issueOwnerLeashKey(db: Database, input: OwnedLeashKeyScope) {
  return issueScopedLeashKey(db, input);
}

async function rotateScopedLeashKey(db: Database, input: InternalLeashKeyTarget) {
  return db.transaction(async (transaction) => {
    const [agent] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(agentScope(input))
      .for("update");
    if (!agent) throw new LeashAgentNotFoundError();

    const [previous] = await transaction
      .update(leashKeys)
      .set({ revokedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(leashKeys.id, input.keyId),
          eq(leashKeys.agentId, input.agentId),
          isNull(leashKeys.revokedAt),
        ),
      )
      .returning({ id: leashKeys.id });
    if (!previous) throw new ActiveLeashKeyNotFoundError();

    const material = generateLeashKey();
    const [key] = await transaction
      .insert(leashKeys)
      .values({
        agentId: input.agentId,
        hashedKey: material.hash,
        last4: material.last4,
        prefix: material.prefix,
        rotatedFromId: previous.id,
      })
      .returning(keySummary);
    if (!key) throw new Error("PostgreSQL did not return the rotated Leash key");

    const [event] = await transaction
      .insert(agentEvents)
      .values({
        actorSurface: "web",
        agentId: input.agentId,
        metadata: {
          reason: "key_rotation",
          replacementKeyId: key.id,
          revokedKeyId: previous.id,
        },
        type: "revoke",
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("PostgreSQL did not return the Leash key rotation event");

    return { key, secret: material.secret };
  });
}

export function rotateLeashKey(db: Database, input: LeashKeyTarget) {
  return rotateScopedLeashKey(db, input);
}

export function rotateOwnerLeashKey(db: Database, input: OwnedLeashKeyTarget) {
  return rotateScopedLeashKey(db, input);
}

export async function authenticateLeashKey(
  db: Database,
  authorizationHeader: string | null,
): Promise<LeashKeyPrincipal> {
  const secret = readBearerLeashKey(authorizationHeader);
  const [principal] = await db
    .update(leashKeys)
    .set({ lastUsedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(leashKeys.hashedKey, hashLeashKey(secret)),
        eq(leashKeys.prefix, LEASH_KEY_PREFIX),
        isNull(leashKeys.revokedAt),
      ),
    )
    .returning({ agentId: leashKeys.agentId, leashKeyId: leashKeys.id });

  if (!principal) throw new InvalidLeashKeyError();
  return principal;
}
