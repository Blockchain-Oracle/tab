import { and, eq } from "drizzle-orm";

import type { Database } from "./client";
import { merchants, users } from "./schema";

export async function merchantIsRegistered(db: Database, email: string) {
  const [merchant] = await db
    .select({ id: merchants.id })
    .from(users)
    .innerJoin(merchants, eq(merchants.userId, users.id))
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  return Boolean(merchant);
}

export async function findMerchantIdentity(db: Database, email: string, magicIssuer: string) {
  const [identity] = await db
    .select({
      email: users.email,
      merchantId: merchants.id,
      userId: users.id,
    })
    .from(users)
    .innerJoin(merchants, eq(merchants.userId, users.id))
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.magicIssuer, magicIssuer)))
    .limit(1);

  return identity;
}
