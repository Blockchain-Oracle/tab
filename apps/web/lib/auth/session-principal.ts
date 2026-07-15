import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { merchants, users } from "../db/schema";
import { readSessionToken } from "./session";

export class InactiveMerchantSessionError extends Error {
  constructor() {
    super("The merchant session is no longer active");
    this.name = "InactiveMerchantSessionError";
  }
}

export async function loadMerchantSession(db: Database, token: string, secret?: string) {
  const session = await readSessionToken(token, secret);
  const [principal] = await db
    .select({
      email: users.email,
      merchantId: merchants.id,
      userId: users.id,
    })
    .from(users)
    .innerJoin(merchants, eq(merchants.userId, users.id))
    .where(and(eq(users.id, session.userId), eq(merchants.id, session.merchantId)))
    .limit(1);

  if (!principal) {
    throw new InactiveMerchantSessionError();
  }

  return {
    email: principal.email,
    merchantId: principal.merchantId,
    mode: session.mode,
    userId: principal.userId,
  };
}
