import { and, asc, count, eq, lte, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { rateLimitAttempts } from "../db/rate-limit-schema";

export interface RateLimitRule {
  /** Named guarded action, e.g. "faucet:address". */
  scope: string;
  /** Throttled key: owner id, agent address, client IP, … */
  subject: string;
  /** Attempts allowed inside the window. */
  limit: number;
  windowMs: number;
}

export class RateLimitedError extends Error {
  constructor(
    readonly scope: string,
    readonly retryAfterSeconds: number,
  ) {
    super("Too many attempts. Try again later.");
    this.name = "RateLimitedError";
  }
}

type RateLimitTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function retryAfterFor(transaction: RateLimitTransaction, rule: RateLimitRule, now: Date) {
  const [oldest] = await transaction
    .select({ createdAt: rateLimitAttempts.createdAt })
    .from(rateLimitAttempts)
    .where(
      and(eq(rateLimitAttempts.scope, rule.scope), eq(rateLimitAttempts.subject, rule.subject)),
    )
    .orderBy(asc(rateLimitAttempts.createdAt), asc(rateLimitAttempts.id))
    .limit(1);
  if (!oldest) return 1;
  return Math.max(
    1,
    Math.ceil((oldest.createdAt.getTime() + rule.windowMs - now.getTime()) / 1_000),
  );
}

/**
 * Multi-key windowed rate limit (prune → count → insert, all in-transaction).
 * Checks EVERY rule before recording any attempt; if any rule is at its
 * limit, throws RateLimitedError carrying the LONGEST cooldown so a caller
 * cannot bypass one key by tripping another first.
 *
 * Each subject is serialized with an advisory transaction lock (the same
 * pattern as webhook egress limits): under READ COMMITTED, concurrent
 * transactions cannot see each other's uncommitted attempts, so an unlocked
 * prune→count→insert would let N parallel requests all pass the same limit.
 */
export async function consumeRateLimits(
  transaction: RateLimitTransaction,
  rules: readonly RateLimitRule[],
  now: Date,
): Promise<void> {
  let blocked: { scope: string; retryAfterSeconds: number } | undefined;

  // Sorted acquisition: two requests sharing subjects always lock in the
  // same order, so overlapping rule sets cannot deadlock each other.
  const lockKeys = rules.map((rule) => `rate-limit:${rule.scope}:${rule.subject}`).sort();
  for (const lockKey of lockKeys) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  }
  for (const rule of rules) {
    const cutoff = new Date(now.getTime() - rule.windowMs);
    await transaction
      .delete(rateLimitAttempts)
      .where(
        and(
          eq(rateLimitAttempts.scope, rule.scope),
          eq(rateLimitAttempts.subject, rule.subject),
          lte(rateLimitAttempts.createdAt, cutoff),
        ),
      );
    const [recent] = await transaction
      .select({ value: count() })
      .from(rateLimitAttempts)
      .where(
        and(eq(rateLimitAttempts.scope, rule.scope), eq(rateLimitAttempts.subject, rule.subject)),
      );
    if ((recent?.value ?? 0) >= rule.limit) {
      const retryAfterSeconds = await retryAfterFor(transaction, rule, now);
      if (!blocked || retryAfterSeconds > blocked.retryAfterSeconds) {
        blocked = { retryAfterSeconds, scope: rule.scope };
      }
    }
  }

  if (blocked) {
    throw new RateLimitedError(blocked.scope, blocked.retryAfterSeconds);
  }

  await transaction
    .insert(rateLimitAttempts)
    .values(rules.map((rule) => ({ createdAt: now, scope: rule.scope, subject: rule.subject })));
}
