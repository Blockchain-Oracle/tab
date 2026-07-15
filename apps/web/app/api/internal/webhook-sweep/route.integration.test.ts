import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { webhookDeliveries } from "../../../../lib/db/schema";
import { closeServerDatabase, getServerDatabase } from "../../../../lib/db/server";
import {
  closeLedgerTests,
  createPendingPaymentDelivery,
} from "../../../../lib/webhooks/delivery-store-test-support";
import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const cronSecret = randomBytes(32).toString("base64url");

function request(authorization?: string) {
  return new NextRequest("http://localhost/api/internal/webhook-sweep", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(async () => {
  process.env.CRON_SECRET = cronSecret;
  await getServerDatabase().client`truncate table users cascade`;
});

afterAll(async () => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  await closeLedgerTests();
  await closeServerDatabase();
});

async function expectPending(id: string) {
  const [delivery] = await getServerDatabase()
    .db.select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, id));
  expect(delivery).toMatchObject({ leaseToken: null, result: "pending" });
}

describe("authenticated webhook outbox sweep route", () => {
  it.each([
    undefined,
    "Bearer wrong-secret",
  ])("rejects an untrusted scheduler header", async (authorization) => {
    const delivery = await createPendingPaymentDelivery();
    const response = await GET(request(authorization));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await expectPending(delivery.id);
  });

  it("fails closed when the deployment has no cron secret", async () => {
    const delivery = await createPendingPaymentDelivery();
    delete process.env.CRON_SECRET;
    const response = await GET(request(`Bearer ${cronSecret}`));
    expect(response.status).toBe(401);
    await expectPending(delivery.id);
  });

  it("runs the real bounded drainer and returns only aggregate work counts", async () => {
    const response = await GET(request(`Bearer ${cronSecret}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      work: { claimed: 0, examined: 0, finalized: 0, promoted: 0 },
    });
  });
});
