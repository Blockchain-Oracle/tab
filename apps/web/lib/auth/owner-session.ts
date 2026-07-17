import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { users } from "../db/schema";
import { InvalidSessionTokenError, readSessionToken } from "./session";

export class InactiveOwnerSessionError extends Error {
  constructor() {
    super("The owner session is no longer active");
    this.name = "InactiveOwnerSessionError";
  }
}

export class InvalidOwnerSessionError extends Error {
  constructor(options?: ErrorOptions) {
    super("The owner session is invalid", options);
    this.name = "InvalidOwnerSessionError";
  }
}

export async function loadOwnerSession(db: Database, token: string, secret?: string) {
  let session: Awaited<ReturnType<typeof readSessionToken>>;

  try {
    session = await readSessionToken(token, secret);
  } catch (error) {
    if (error instanceof InvalidSessionTokenError) {
      throw new InvalidOwnerSessionError({ cause: error });
    }
    throw error;
  }

  const [owner] = await db
    .select({ email: users.email, userId: users.id })
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.email, session.email)))
    .limit(1);

  if (!owner) throw new InactiveOwnerSessionError();
  return owner;
}
