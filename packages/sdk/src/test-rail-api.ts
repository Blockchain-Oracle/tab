import { normalizeApiBaseUrl } from "./api-base-url";
import { authHeaders, responseJson } from "./checkout-api";
import { record } from "./checkout-parsers";
import { CheckoutApiError } from "./checkout-types";

/**
 * Test-rail reads and grants. In test mode the checkout's money truth is
 * the buyer's REAL Base Sepolia USDC — read on-chain by the Tab API — and
 * an empty wallet can claim starter test funds without leaving the flow.
 * None of this exists in live mode.
 */

export type TestFundsLeg = {
  asset: "gas" | "usdc";
  blocker?: string;
  explorerTxUrl?: string;
  state: "already-funded" | "failed" | "funded" | "unavailable";
  txHash?: string;
};

export type TestFundsGrant = {
  legs: TestFundsLeg[];
  state: "funded" | "partial" | "unavailable";
};

type RequestOptions = { request?: typeof fetch; signal?: AbortSignal };

const LEG_STATES = new Set(["already-funded", "failed", "funded", "unavailable"]);
const GRANT_STATES = new Set(["funded", "partial", "unavailable"]);

function invalid(): never {
  throw new CheckoutApiError("INVALID_RESPONSE", "Tab returned an invalid response.", 200);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function parseTestBalance(value: unknown): { usdcAtomic: bigint } {
  const balance = record(record(value)?.balance);
  const usdcAtomic = balance?.usdcAtomic;
  if (typeof usdcAtomic !== "string" || !/^\d+$/.test(usdcAtomic)) invalid();
  return { usdcAtomic: BigInt(usdcAtomic) };
}

export function parseTestFundsGrant(value: unknown): TestFundsGrant {
  const grant = record(record(value)?.grant);
  const legs = grant?.legs;
  if (
    !grant ||
    typeof grant.state !== "string" ||
    !GRANT_STATES.has(grant.state) ||
    !Array.isArray(legs)
  ) {
    invalid();
  }
  return {
    legs: legs.map((entry) => {
      const leg = record(entry);
      if (
        !leg ||
        (leg.asset !== "gas" && leg.asset !== "usdc") ||
        typeof leg.state !== "string" ||
        !LEG_STATES.has(leg.state)
      ) {
        invalid();
      }
      return {
        asset: leg.asset,
        state: leg.state as TestFundsLeg["state"],
        ...(optionalString(leg.blocker) !== undefined ? { blocker: leg.blocker as string } : {}),
        ...(optionalString(leg.explorerTxUrl) !== undefined
          ? { explorerTxUrl: leg.explorerTxUrl as string }
          : {}),
        ...(optionalString(leg.txHash) !== undefined ? { txHash: leg.txHash as string } : {}),
      };
    }),
    state: grant.state as TestFundsGrant["state"],
  };
}

/** Did the grant verifiably put USDC at the address (or find it there)? */
export function grantDeliveredUsdc(grant: TestFundsGrant) {
  return grant.legs.some(
    (leg) => leg.asset === "usdc" && (leg.state === "funded" || leg.state === "already-funded"),
  );
}

/** Base Sepolia USDC has 6 decimals; the checkout compares in dollars. */
export function testUsdBalance(usdcAtomic: bigint): number {
  return Number(usdcAtomic) / 1_000_000;
}

export async function loadTestBalance(
  input: { address: string; apiBaseUrl: string; publishableKey: string },
  options: RequestOptions = {},
) {
  const url = new URL("/api/v1/checkout/test-balance", normalizeApiBaseUrl(input.apiBaseUrl));
  url.searchParams.set("address", input.address);
  const response = await (options.request ?? fetch)(url.toString(), {
    headers: authHeaders(input.publishableKey),
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseTestBalance(await responseJson(response));
}

export async function claimTestFunds(
  input: { apiBaseUrl: string; buyerDidToken: string; publishableKey: string },
  options: RequestOptions = {},
) {
  const url = new URL(
    "/api/v1/checkout/test-funds",
    normalizeApiBaseUrl(input.apiBaseUrl),
  ).toString();
  const response = await (options.request ?? fetch)(url, {
    body: JSON.stringify({ buyerDidToken: input.buyerDidToken }),
    headers: { ...authHeaders(input.publishableKey), "content-type": "application/json" },
    method: "POST",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseTestFundsGrant(await responseJson(response));
}
