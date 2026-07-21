import { createFaucetFunder, executeGrant, type FaucetGrantReport } from "@tab/faucet";
import { isAddress } from "viem";

import type { Database } from "../db/client";
import { faucetGrants } from "../db/faucet-schema";
import { consumeRateLimits } from "../http/rate-limit";
import { FaucetUnavailableError, faucetConfig } from "./claim-grant";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;

export class CheckoutFaucetAddressError extends Error {
  constructor() {
    super("A valid 0x recipient address is required.");
    this.name = "CheckoutFaucetAddressError";
  }
}

/**
 * In-flow buyer funding for TEST-mode checkout only. The route gates on a
 * test publishable key before this runs; the engine itself is chain-bound
 * to Base Sepolia, so no configuration can point this at real money.
 * Throttled per recipient address, per merchant, and per client IP.
 */
export async function claimCheckoutTestFunds(
  db: Database,
  input: { address: string; clientIp: string; merchantId: string },
): Promise<FaucetGrantReport> {
  const config = faucetConfig();
  if (!isAddress(input.address)) throw new CheckoutFaucetAddressError();
  const recipient = input.address;

  // Preflight BEFORE consuming rate slots — infra failures must not burn
  // a buyer's limited claims.
  const funder = createFaucetFunder(config);
  const treasury = await funder.preflight();
  if (!treasury.funded) {
    throw new FaucetUnavailableError("The faucet treasury cannot cover a full grant right now.");
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
    await consumeRateLimits(
      transaction,
      [
        { limit: 3, scope: "faucet:recipient", subject: recipient.toLowerCase(), windowMs: DAY_MS },
        { limit: 25, scope: "faucet:merchant", subject: input.merchantId, windowMs: DAY_MS },
        { limit: 20, scope: "faucet:ip", subject: input.clientIp, windowMs: HOUR_MS },
      ],
      now,
    );
  });

  const report = await executeGrant(funder, recipient);

  await db.insert(faucetGrants).values({
    merchantId: input.merchantId,
    recipient,
    report,
  });

  return report;
}
