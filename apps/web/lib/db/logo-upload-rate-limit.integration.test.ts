import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "./client";
import {
  consumeLogoUploadGrant,
  LOGO_UPLOAD_GRANT_LIMIT,
  LOGO_UPLOAD_WINDOW_MS,
} from "./logo-upload-rate-limit";
import { provisionMerchant } from "./provision-merchant";
import { merchants } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for logo rate-limit tests");

const connection = createDatabase(databaseUrl, 1);

async function merchant() {
  return provisionMerchant(connection.db, {
    email: `logo-limit-${randomUUID()}@example.test`,
    magicIssuer: `did:ethr:${randomUUID()}`,
    receivingAddress: "0x5555555555555555555555555555555555555555",
  });
}

describe("merchant logo upload grants with real PostgreSQL", () => {
  beforeEach(async () => {
    await connection.client`
      truncate table quickstart_progress, api_keys, merchants, users cascade
    `;
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it("atomically caps grants per merchant and resets an expired window", async () => {
    const identity = await merchant();
    const now = new Date("2026-07-15T12:00:00.000Z");

    for (let count = 0; count < LOGO_UPLOAD_GRANT_LIMIT; count += 1) {
      await expect(consumeLogoUploadGrant(connection.db, identity.merchantId, now)).resolves.toBe(
        true,
      );
    }
    await expect(consumeLogoUploadGrant(connection.db, identity.merchantId, now)).resolves.toBe(
      false,
    );

    const afterWindow = new Date(now.getTime() + LOGO_UPLOAD_WINDOW_MS + 1);
    await expect(
      consumeLogoUploadGrant(connection.db, identity.merchantId, afterWindow),
    ).resolves.toBe(true);

    const [row] = await connection.db
      .select({ count: merchants.logoUploadCount })
      .from(merchants)
      .where(eq(merchants.id, identity.merchantId));
    expect(row?.count).toBe(1);
  });
});
