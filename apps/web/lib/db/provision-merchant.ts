import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { normalizeReceivingAddress } from "../merchant/receiving-address";
import type { Database } from "./client";
import { apiKeys, merchants, users } from "./schema";

export class MerchantAlreadyExistsError extends Error {
  readonly code = "EMAIL_ALREADY_REGISTERED";

  constructor() {
    super("A merchant already exists for this identity");
    this.name = "MerchantAlreadyExistsError";
  }
}

export interface ProvisionMerchantInput {
  email: string;
  magicIssuer: string;
  receivingAddress: string;
}

function publishableKey(env: "test" | "live") {
  const prefix = `pk_${env}_`;
  const value = `${prefix}${randomBytes(24).toString("base64url")}`;

  return {
    env,
    last4: value.slice(-4),
    prefix,
    value,
  };
}

const identityConstraints = new Set([
  "merchants_user_id_unique",
  "users_email_unique",
  "users_magic_issuer_unique",
]);

function uniqueViolationConstraint(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);

    if ("code" in current && current.code === "23505") {
      if ("constraint_name" in current && typeof current.constraint_name === "string") {
        return current.constraint_name;
      }

      return undefined;
    }

    current = "cause" in current ? current.cause : undefined;
  }

  return undefined;
}

export async function provisionMerchant(db: Database, input: ProvisionMerchantInput) {
  const email = input.email.trim().toLowerCase();
  const magicIssuer = input.magicIssuer.trim();
  const receivingAddress = normalizeReceivingAddress(input.receivingAddress);

  if (!email.includes("@")) {
    throw new Error("A valid email is required");
  }
  if (!magicIssuer.startsWith("did:")) {
    throw new Error("A valid Magic issuer is required");
  }
  if (!receivingAddress) {
    throw new Error("A valid EVM receiving address is required");
  }

  try {
    return await db.transaction(async (transaction) => {
      const [createdUser] = await transaction
        .insert(users)
        .values({ email, magicIssuer })
        .onConflictDoNothing()
        .returning({ id: users.id });
      const [existingUser] = createdUser
        ? []
        : await transaction
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, email), eq(users.magicIssuer, magicIssuer)))
            .limit(1);
      const user = createdUser ?? existingUser;

      if (!user) {
        throw new MerchantAlreadyExistsError();
      }

      const [merchant] = await transaction
        .insert(merchants)
        .values({
          receivingAddress,
          userId: user.id,
        })
        .returning({ id: merchants.id });

      if (!merchant) {
        throw new Error("PostgreSQL did not return the created merchant");
      }

      const testKey = publishableKey("test");
      const liveKey = publishableKey("live");

      await transaction.insert(apiKeys).values(
        [testKey, liveKey].map((key) => ({
          env: key.env,
          last4: key.last4,
          merchantId: merchant.id,
          name: `Default ${key.env} publishable key`,
          prefix: key.prefix,
          publicKey: key.value,
          type: "publishable" as const,
        })),
      );

      return {
        merchantId: merchant.id,
        publishableKeys: {
          live: liveKey.value,
          test: testKey.value,
        },
        userId: user.id,
      };
    });
  } catch (error) {
    if (error instanceof MerchantAlreadyExistsError) {
      throw error;
    }
    const constraint = uniqueViolationConstraint(error);
    if (constraint && identityConstraints.has(constraint)) {
      throw new MerchantAlreadyExistsError();
    }
    throw error;
  }
}
