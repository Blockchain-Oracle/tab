import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db/client";
import { rateLimitAttempts } from "../db/schema";
import { consumeRateLimits, RateLimitedError } from "./rate-limit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for rate-limit integration tests");

const connection = createDatabase(databaseUrl, 4);

beforeEach(async () => {
  await connection.client`truncate table rate_limit_attempts`;
});

afterAll(async () => {
  await connection.client.end();
});

const WINDOW_MS = 60_000;

function rule(overrides: Partial<Parameters<typeof consumeRateLimits>[1][number]> = {}) {
  return {
    limit: 2,
    scope: "test:subject",
    subject: "subject-a",
    windowMs: WINDOW_MS,
    ...overrides,
  };
}

describe("consumeRateLimits", () => {
  it("allows attempts under the limit and records one row per rule", async () => {
    const now = new Date();
    await connection.db.transaction(async (tx) => {
      await consumeRateLimits(tx, [rule(), rule({ scope: "test:ip", subject: "10.0.0.1" })], now);
    });

    const rows = await connection.db.select().from(rateLimitAttempts);
    expect(rows).toHaveLength(2);
  });

  it("throws with retry-after once a subject reaches its limit", async () => {
    const now = new Date();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await connection.db.transaction(async (tx) => {
        await consumeRateLimits(tx, [rule()], new Date(now.getTime() + attempt));
      });
    }

    await expect(
      connection.db.transaction(async (tx) => {
        await consumeRateLimits(tx, [rule()], new Date(now.getTime() + 2));
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(RateLimitedError);
      const limited = error as RateLimitedError;
      expect(limited.scope).toBe("test:subject");
      expect(limited.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(limited.retryAfterSeconds).toBeLessThanOrEqual(60);
      return true;
    });
  });

  it("does not record any attempt when one key of a multi-key check is blocked", async () => {
    const now = new Date();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await connection.db.transaction(async (tx) => {
        await consumeRateLimits(tx, [rule()], new Date(now.getTime() + attempt));
      });
    }

    await expect(
      connection.db.transaction(async (tx) => {
        await consumeRateLimits(
          tx,
          [rule(), rule({ scope: "test:ip", subject: "10.0.0.1" })],
          new Date(now.getTime() + 2),
        );
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);

    const ipRows = await connection.db
      .select()
      .from(rateLimitAttempts)
      .then((rows) => rows.filter((row) => row.scope === "test:ip"));
    expect(ipRows).toHaveLength(0);
  });

  it("prunes attempts older than the window so the subject recovers", async () => {
    const past = new Date(Date.now() - WINDOW_MS - 1_000);
    await connection.db.insert(rateLimitAttempts).values([
      { createdAt: past, scope: "test:subject", subject: "subject-a" },
      { createdAt: past, scope: "test:subject", subject: "subject-a" },
    ]);

    await connection.db.transaction(async (tx) => {
      await consumeRateLimits(tx, [rule()], new Date());
    });

    const rows = await connection.db.select().from(rateLimitAttempts);
    expect(rows).toHaveLength(1);
  });
});
