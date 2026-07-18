import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { issueLeashKey } from "../../../../lib/auth/leash-key";
import { createDatabase } from "../../../../lib/db/client";
import { agents, receipts, users } from "../../../../lib/db/schema";
import { closeServerDatabase } from "../../../../lib/db/server";
import { createSignPost } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sign body route tests");
const connection = createDatabase(databaseUrl, 2);
const agentAddress = "0x4444444444444444444444444444444444444444";

beforeEach(async () => connection.client`truncate table users cascade`);
afterAll(async () => {
  await closeServerDatabase();
  await connection.client.end();
});

async function provisionKey() {
  const [user] = await connection.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, magicIssuer: `did:ethr:${randomUUID()}` })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected user");
  const [agent] = await connection.db
    .insert(agents)
    .values({
      agentAddress,
      name: "Body deadline agent",
      ownerId: user.id,
      signerSubject: `agent_${randomUUID()}`,
    })
    .returning({ id: agents.id });
  if (!agent) throw new Error("Expected agent");
  return (await issueLeashKey(connection.db, { agentId: agent.id })).secret;
}

function request(secret: string) {
  return new NextRequest("http://localhost/api/agent/sign", {
    body: "{}",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function route() {
  const reserveRequest = vi.fn(async () => {
    throw new Error("Reservation storage must not run");
  });
  const floatBalance = vi.fn(async () => BigInt(0));
  const signerConfigured = vi.fn(() => true);
  const signTypedData = vi.fn(async () => ({
    digest: `0x${"00".repeat(32)}` as `0x${string}`,
    signature: `0x${"00".repeat(65)}` as `0x${string}`,
  }));
  return {
    floatBalance,
    post: createSignPost({
      bodyReadTimeoutMs: 5,
      floatBalance,
      reserveRequest,
      signer: { signTypedData },
      signerConfigured,
    }),
    reserveRequest,
    signTypedData,
    signerConfigured,
  };
}

async function withTestGuard<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<"test-guard">((resolve) => {
    timer = setTimeout(() => resolve("test-guard"), 500);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function expectNoDownstreamCalls(dependencies: ReturnType<typeof route>) {
  expect(dependencies.reserveRequest).not.toHaveBeenCalled();
  expect(dependencies.floatBalance).not.toHaveBeenCalled();
  expect(dependencies.signerConfigured).not.toHaveBeenCalled();
  expect(dependencies.signTypedData).not.toHaveBeenCalled();
}

describe("POST /api/agent/sign body deadline", () => {
  it("returns deterministic INVALID_SIGN_REQUEST for a stalled authenticated body", async () => {
    const secret = await provisionKey();
    const target = request(secret);
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    Object.defineProperty(target, "body", {
      configurable: true,
      value: {
        getReader: () => ({
          cancel,
          read: () => new Promise<never>(() => undefined),
          releaseLock,
        }),
      },
    });
    const dependencies = route();

    const outcome = await withTestGuard(dependencies.post(target));
    expect(outcome).not.toBe("test-guard");
    if (outcome === "test-guard") return;
    expect(outcome.status).toBe(400);
    await expect(outcome.json()).resolves.toMatchObject({
      error: { code: "INVALID_SIGN_REQUEST" },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expectNoDownstreamCalls(dependencies);
    await expect(connection.db.select({ id: receipts.id }).from(receipts)).resolves.toEqual([]);
  });

  it("rejects an already-aborted authenticated body before downstream work", async () => {
    const secret = await provisionKey();
    const target = request(secret);
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn(() => {
      throw new Error("An aborted body must not be read");
    });
    Object.defineProperties(target, {
      body: { configurable: true, value: { cancel, getReader } },
      signal: { configurable: true, value: AbortSignal.abort() },
    });
    const dependencies = route();

    const response = await dependencies.post(target);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_SIGN_REQUEST" },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expectNoDownstreamCalls(dependencies);
    await expect(connection.db.select({ id: receipts.id }).from(receipts)).resolves.toEqual([]);
  });
});
