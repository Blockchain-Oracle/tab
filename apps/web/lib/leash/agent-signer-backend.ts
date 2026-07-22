import type { Database } from "../db/client";
import { createMagicExpressClient, isMagicExpressConfigured } from "./magic-express";
import { isTabSignerConfigured, TabSignerClient } from "./tab-signer";

/**
 * Signer backend selection. Default: the Tab-hosted signer (works today).
 * Set AGENT_SIGNER_BACKEND=magic to route provisioning + signing through
 * Magic Server Wallets once the account is enabled for it — no other code
 * changes needed; both backends speak the same contract.
 */
export function agentSignerBackend() {
  return process.env.AGENT_SIGNER_BACKEND === "magic" ? "magic" : "tab";
}

export function createAgentSignerClient(db: Database) {
  return agentSignerBackend() === "magic" ? createMagicExpressClient() : new TabSignerClient(db);
}

export function isAgentSignerConfigured() {
  return agentSignerBackend() === "magic" ? isMagicExpressConfigured() : isTabSignerConfigured();
}
