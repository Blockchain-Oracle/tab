import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "./client";
import { users } from "./schema";

export class OwnerIdentityConflictError extends Error {
  constructor() {
    super("The verified Magic identity conflicts with an existing owner");
    this.name = "OwnerIdentityConflictError";
  }
}

export interface OwnerIdentityInput {
  email: string;
  magicIssuer: string;
}

function normalizedIdentity(input: OwnerIdentityInput) {
  const email = input.email.trim().toLowerCase();
  const magicIssuer = input.magicIssuer.trim();

  if (!email.includes("@")) throw new Error("A valid email is required");
  if (!magicIssuer.startsWith("did:")) throw new Error("A valid Magic issuer is required");

  return { email, magicIssuer };
}

export async function findOrCreateOwnerIdentity(db: Database, input: OwnerIdentityInput) {
  const identity = normalizedIdentity(input);
  const [created] = await db
    .insert(users)
    .values(identity)
    .onConflictDoNothing()
    .returning({ email: users.email, userId: users.id });

  if (created) return created;

  const [existing] = await db
    .select({ email: users.email, userId: users.id })
    .from(users)
    .where(and(eq(users.email, identity.email), eq(users.magicIssuer, identity.magicIssuer)))
    .limit(1);

  if (!existing) throw new OwnerIdentityConflictError();
  return existing;
}
