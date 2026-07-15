import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { merchants, users } from "../db/schema";
import { InvalidSessionTokenError, readSessionToken } from "./session";

export class InactiveMerchantSessionError extends Error {
  constructor() {
    super("The merchant session is no longer active");
    this.name = "InactiveMerchantSessionError";
  }
}

export class InvalidMerchantSessionError extends Error {
  constructor(options?: ErrorOptions) {
    super("The merchant session is invalid", options);
    this.name = "InvalidMerchantSessionError";
  }
}

export async function loadMerchantSession(db: Database, token: string, secret?: string) {
  let session: Awaited<ReturnType<typeof readSessionToken>>;

  try {
    session = await readSessionToken(token, secret);
  } catch (error) {
    if (error instanceof InvalidSessionTokenError) {
      throw new InvalidMerchantSessionError({ cause: error });
    }
    throw error;
  }

  const [principal] = await db
    .select({
      businessName: merchants.businessName,
      email: users.email,
      liveActivatedAt: merchants.liveActivatedAt,
      logoEtag: merchants.logoEtag,
      logoUrl: merchants.logoUrl,
      merchantId: merchants.id,
      receivingAddress: merchants.receivingAddress,
      receivingAddressSource: merchants.receivingAddressSource,
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
    businessName: principal.businessName,
    email: principal.email,
    liveActivatedAt: principal.liveActivatedAt,
    logoEtag: principal.logoEtag,
    logoUrl: principal.logoUrl,
    merchantId: principal.merchantId,
    mode: session.mode,
    receivingAddress: principal.receivingAddress,
    receivingAddressSource: principal.receivingAddressSource,
    userId: principal.userId,
  };
}
