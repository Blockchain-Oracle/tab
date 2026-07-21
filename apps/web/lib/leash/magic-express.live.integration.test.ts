import { readFile } from "node:fs/promises";
import { Magic as MagicAdmin } from "@magic-sdk/admin";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { findOrCreateOwnerIdentity } from "../db/owner-identity";
import { closeServerDatabase, getServerDatabase } from "../db/server";

const runLive = process.env.RUN_LIVE_MAGIC_PROVISIONING === "1";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live Magic provisioning test`);
  return value;
}

async function loadLocalSecret(name: "MAGIC_SECRET_KEY" | "SESSION_SECRET") {
  if (process.env[name]) return;
  const source = await readFile(".env.local", "utf8");
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1);
  if (!value) throw new Error(`${name} is unavailable in the local secret source`);
  process.env[name] = value;
}

async function provision(origin: string, token: string, name: string) {
  const response = await fetch(`${origin}/api/agents/provision`, {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      origin,
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  expect(text.length).toBeLessThan(16_384);
  const body = JSON.parse(text) as {
    agent?: { address?: string; id?: string; paymentProfile?: string };
    error?: { code?: string };
    label?: string;
    testFunds?: boolean;
  };
  expect(response.status, body.error?.code).toBe(200);
  expect(body.testFunds).toBe(true);
  expect(body.label).toBe("Sandbox funds — no real value");
  expect(body.agent?.paymentProfile).toBe("base_sepolia_integration");
  if (!body.agent?.address || !body.agent.id) {
    throw new Error("The deployed provision route returned incomplete agent evidence");
  }
  return { agentAddress: body.agent.address, id: body.agent.id };
}

describe.runIf(runLive)("live Magic Express wallet provisioning", () => {
  afterAll(closeServerDatabase);

  it("binds the real owner and proves same-subject and different-subject behavior", async () => {
    await loadLocalSecret("MAGIC_SECRET_KEY");
    await loadLocalSecret("SESSION_SECRET");
    const ownerAddress = required("LIVE_MAGIC_OWNER_ADDRESS");
    const ownerEmail = required("LIVE_MAGIC_OWNER_EMAIL").toLowerCase();
    const origin = required("LIVE_TAB_ORIGIN");
    const secret = required("MAGIC_SECRET_KEY");
    const admin = await MagicAdmin.init(secret);
    const metadata = await admin.users.getMetadataByPublicAddress(ownerAddress);

    expect(metadata.publicAddress?.toLowerCase()).toBe(ownerAddress.toLowerCase());
    expect(metadata.email?.toLowerCase()).toBe(ownerEmail);
    expect(metadata.issuer?.startsWith("did:")).toBe(true);
    if (!metadata.issuer) throw new Error("Magic did not return the real owner's issuer");

    const database = getServerDatabase().db;
    const owner = await findOrCreateOwnerIdentity(database, {
      email: ownerEmail,
      magicIssuer: metadata.issuer,
    });
    const token = await createSessionToken(owner);

    const primary = await provision(origin, token, "Tab Phase 0 Payer");
    const repeated = await provision(origin, token, "Tab Phase 0 Payer");
    const differentSubject = await provision(origin, token, "Tab Phase 0 Subject Probe");

    expect(repeated.id).toBe(primary.id);
    expect(repeated.agentAddress).toBe(primary.agentAddress);
    expect(differentSubject.id).not.toBe(primary.id);
    expect(differentSubject.agentAddress).not.toBe(primary.agentAddress);

    console.log(
      "LIVE_MAGIC_PROVISION_EVIDENCE",
      JSON.stringify({
        differentSubjectAddress: differentSubject.agentAddress,
        differentSubjectDifferentWallet: true,
        ownerAddress: metadata.publicAddress,
        ownerEmailVerified: true,
        payerAddress: primary.agentAddress,
        payerAgentId: primary.id,
        repeatedProvisionAddress: repeated.agentAddress,
        repeatedProvisionSameWallet: true,
      }),
    );
  }, 45_000);
});
