import { isDeepStrictEqual } from "node:util";

import { and, eq, or } from "drizzle-orm";

import type { Database } from "../db/client";
import { x402ResourceSettlements } from "../db/schema";
import {
  InvalidX402SettlementEvidenceError,
  normalizeX402ResourceSettlement,
  type X402ResourceSettlementInput,
} from "./x402-settlement-normalization";
import type { X402TestnetSettlement } from "./x402-testnet-resource";

export {
  InvalidX402SettlementEvidenceError,
  normalizeX402ResourceSettlement,
  X402_EXPLORER_TX_BASE,
  X402_FACILITATOR_URL,
  X402_TESTNET_ASSET,
  X402_TESTNET_NETWORK,
  type X402ResourceSettlementInput,
  x402ResourceInputFromSettlement,
} from "./x402-settlement-normalization";

export class X402SettlementConflictError extends Error {
  readonly code = "X402_SETTLEMENT_CONFLICT";

  constructor() {
    super("The x402 settlement identity already has different evidence.");
    this.name = "X402SettlementConflictError";
  }
}

function sameEvidence(
  existing: typeof x402ResourceSettlements.$inferSelect,
  expected: ReturnType<typeof normalizeX402ResourceSettlement>,
) {
  return (
    existing.amountAtomic === expected.amountAtomic &&
    existing.asset === expected.asset &&
    existing.authorizationValidAfter.getTime() === expected.authorizationValidAfter.getTime() &&
    existing.authorizationValidBefore.getTime() === expected.authorizationValidBefore.getTime() &&
    existing.endpoint === expected.endpoint &&
    existing.explorerUrl === expected.explorerUrl &&
    existing.facilitatorUrl === expected.facilitatorUrl &&
    isDeepStrictEqual(existing.facilitatorResponse, expected.facilitatorResponse) &&
    existing.network === expected.network &&
    existing.nonce === expected.nonce &&
    existing.payee === expected.payee &&
    existing.payer === expected.payer &&
    existing.paymentFingerprint === expected.paymentFingerprint &&
    existing.paymentIdentifier === expected.paymentIdentifier &&
    existing.receiptId === expected.receiptId &&
    existing.testFunds === true &&
    existing.txHash === expected.txHash
  );
}

function settlementIdentity(values: ReturnType<typeof normalizeX402ResourceSettlement>) {
  return or(
    and(
      eq(x402ResourceSettlements.network, values.network),
      eq(x402ResourceSettlements.txHash, values.txHash),
    ),
    and(
      eq(x402ResourceSettlements.network, values.network),
      eq(x402ResourceSettlements.payer, values.payer),
      eq(x402ResourceSettlements.nonce, values.nonce),
    ),
    ...(values.receiptId ? [eq(x402ResourceSettlements.receiptId, values.receiptId)] : []),
    ...(values.paymentIdentifier
      ? [
          and(
            eq(x402ResourceSettlements.network, values.network),
            eq(x402ResourceSettlements.paymentIdentifier, values.paymentIdentifier),
          ),
        ]
      : []),
  );
}

async function findExistingSettlement(
  database: Database,
  values: ReturnType<typeof normalizeX402ResourceSettlement>,
) {
  return database.select().from(x402ResourceSettlements).where(settlementIdentity(values)).limit(2);
}

export async function recordX402ResourceSettlement(
  database: Database,
  input: X402ResourceSettlementInput,
) {
  const normalized = normalizeX402ResourceSettlement(input);
  if (normalized.paymentFingerprint === null) throw new InvalidX402SettlementEvidenceError();
  const values = { ...normalized, paymentFingerprint: normalized.paymentFingerprint };
  const beforeInsert = await findExistingSettlement(database, values);
  if (beforeInsert.length > 0) {
    if (beforeInsert.length !== 1 || !beforeInsert[0] || !sameEvidence(beforeInsert[0], values)) {
      throw new X402SettlementConflictError();
    }
    return { created: false as const, settlement: beforeInsert[0] };
  }

  const [inserted] = await database
    .insert(x402ResourceSettlements)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (inserted) return { created: true as const, settlement: inserted };

  // Another process may have inserted the identity after the preflight read.
  const existing = await findExistingSettlement(database, values);
  if (existing.length !== 1 || !existing[0] || !sameEvidence(existing[0], values)) {
    throw new X402SettlementConflictError();
  }
  return { created: false as const, settlement: existing[0] };
}

export async function findFinalX402ResourceSettlement(
  database: Database,
  identity: { network: string; nonce: string; payer: string },
) {
  const [row] = await database
    .select()
    .from(x402ResourceSettlements)
    .where(
      and(
        eq(x402ResourceSettlements.network, identity.network as "eip155:84532"),
        eq(x402ResourceSettlements.payer, identity.payer),
        eq(x402ResourceSettlements.nonce, identity.nonce.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row?.paymentFingerprint) return null;
  const settlement: X402TestnetSettlement = {
    amount: "1000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    authorizationValidAfter: BigInt(row.authorizationValidAfter.getTime() / 1_000).toString(),
    authorizationValidBefore: BigInt(row.authorizationValidBefore.getTime() / 1_000).toString(),
    endpoint: row.endpoint,
    facilitatorResponse: row.facilitatorResponse as X402TestnetSettlement["facilitatorResponse"],
    facilitatorUrl: "https://x402.org/facilitator",
    network: "eip155:84532",
    nonce: row.nonce as `0x${string}`,
    payee: row.payee as `0x${string}`,
    payer: row.payer as `0x${string}`,
    testFunds: true,
    transactionHash: row.txHash as `0x${string}`,
  };
  return { paymentFingerprint: row.paymentFingerprint, settlement };
}
