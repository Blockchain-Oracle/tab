import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agents } from "../../../../lib/db/schema";
import { MagicExpressError } from "../../../../lib/leash/magic-express";
import { createRevokeRouteHarness } from "../revoke/route-test-support";
import { handleProvisionRequest } from "./route";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for provision route tests");
const harness = createRevokeRouteHarness(databaseUrl);
const agentAddress = "0x2222222222222222222222222222222222222222";

beforeEach(async () => harness.reset());
afterAll(async () => harness.close());

function handle(
  request: ReturnType<typeof harness.request>,
  getOrCreateWallet: (subject: string) => Promise<string> = async () => agentAddress,
  paymentProfile: "mainnet" | "base_sepolia_integration" = "mainnet",
) {
  return handleProvisionRequest(request, {
    client: { getOrCreateWallet },
    database: harness.connection.db,
    paymentProfile,
  });
}

describe("POST /api/agents/provision", () => {
  it("requires same-origin owner authentication before contacting Magic", async () => {
    const owner = await harness.provision("provision-auth");
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const unauthenticated = await handle(harness.request({ name: owner.name }), wallet);
    expect(unauthenticated.status).toBe(401);

    const crossOrigin = await handle(
      harness.request(
        { agentId: owner.agentId, name: owner.name },
        owner.token,
        "https://attacker.example.test",
      ),
      wallet,
    );
    expect(crossOrigin.status).toBe(403);
    expect(wallet).not.toHaveBeenCalled();
  });

  it("provisions and idempotently returns the provider-backed wallet", async () => {
    const owner = await harness.provision("provision-live");
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const body = { agentId: owner.agentId, name: owner.name };

    const first = await handle(harness.request(body, owner.token), wallet);
    const repeated = await handle(harness.request(body, owner.token), wallet);

    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    await expect(first.json()).resolves.toEqual({
      agent: {
        address: agentAddress,
        id: owner.agentId,
        name: owner.name,
        paymentProfile: "mainnet",
      },
      testFunds: false,
    });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      agent: { address: agentAddress, id: owner.agentId },
    });
    expect(wallet).toHaveBeenCalledTimes(1);
  });

  it("creates an explicitly test-labeled Base Sepolia integration agent", async () => {
    const owner = await harness.provision("provision-testnet-owner");
    const response = await handle(
      harness.request({ name: "Sepolia payer" }, owner.token),
      async () => agentAddress,
      "base_sepolia_integration",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      agent: {
        address: agentAddress,
        name: "Sepolia payer",
        paymentProfile: "base_sepolia_integration",
      },
      label: "Sandbox funds — no real value",
      testFunds: true,
    });
  });

  it("distinguishes missing configuration and provider rejection with secret-safe errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const owner = await harness.provision("provision-errors");
    const body = { agentId: owner.agentId, name: owner.name };
    const missing = await handle(harness.request(body, owner.token), async () => {
      throw new MagicExpressError("SIGNER_NOT_CONFIGURED");
    });
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "SIGNER_NOT_CONFIGURED" },
    });

    warn.mockClear();
    try {
      const rejected = await handle(harness.request(body, owner.token), async () => {
        throw new MagicExpressError("SIGNER_PROVIDER_REJECTED", {
          providerCode: "CREDENTIALLIKEVALUE",
          providerStage: "WALLET_CREATION",
        });
      });
      expect(rejected.status).toBe(502);
      const responseBody = await rejected.json();
      expect(responseBody).toMatchObject({ error: { code: "SIGNER_PROVIDER_REJECTED" } });
      expect(JSON.stringify(responseBody)).not.toContain("Magic secret");

      const diagnostics = warn.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(diagnostics).not.toHaveProperty("providerCode");
      expect(JSON.stringify(diagnostics)).not.toContain("CREDENTIALLIKEVALUE");
    } finally {
      warn.mockRestore();
    }
  });

  it("maps the persisted provider-attempt limit to a retryable 429", async () => {
    const owner = await harness.provision("provision-admission");
    const unavailable = vi.fn(async (_subject: string) => {
      throw new MagicExpressError("SIGNER_PROVIDER_UNAVAILABLE");
    });
    const body = { agentId: owner.agentId, name: owner.name };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await handle(harness.request(body, owner.token), unavailable);
      expect(response.status).toBe(503);
    }
    const limited = await handle(harness.request(body, owner.token), unavailable);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "AGENT_PROVISION_RATE_LIMITED" },
    });
    expect(unavailable).toHaveBeenCalledTimes(5);
  });

  it("maps the retained-agent quota without calling the provider", async () => {
    const quotaOwner = await harness.provision("provision-quota");
    await harness.connection.db.insert(agents).values(
      Array.from({ length: 9 }, (_, index) => ({
        agentAddress: `0x${(index + 10).toString(16).padStart(40, "0")}`,
        name: `Quota agent ${index + 1}`,
        ownerId: quotaOwner.ownerId,
        signerSubject: `agent_route_quota_${index}`,
      })),
    );
    const wallet = vi.fn(async (_subject: string) => agentAddress);
    const quota = await handle(
      harness.request({ name: "Eleventh agent" }, quotaOwner.token),
      wallet,
    );
    expect(quota.status).toBe(409);
    await expect(quota.json()).resolves.toMatchObject({
      error: { code: "AGENT_PROVISION_QUOTA_EXCEEDED" },
    });
    expect(wallet).not.toHaveBeenCalled();
  });
});
