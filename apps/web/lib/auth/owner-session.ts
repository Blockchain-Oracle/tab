import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { users } from "../db/schema";
import { InvalidSessionTokenError, isMerchantSession, readSessionToken } from "./session";

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

  // Merchant-scoped tokens never grant agent-owner control: the dashboards
  // are separate privilege domains. Magic session persistence makes the
  // owner login silent for a dual-role user, so strictness costs no OTP.
  if (isMerchantSession(session)) {
    throw new InvalidOwnerSessionError();
  }

  const [owner] = await db
    .select({ email: users.email, userId: users.id })
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.email, session.email)))
    .limit(1);

  if (!owner) throw new InactiveOwnerSessionError();
  return owner;
}
