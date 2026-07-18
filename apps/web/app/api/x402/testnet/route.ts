import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../lib/db/server";
import { HardenedHTTPFacilitatorClient } from "../../../../lib/leash/x402-facilitator-client";
import {
  beginX402SettlementAttempt,
  findX402SettlementAttempt,
  noteX402SettlementAttemptRetry,
  saveX402SettlementAttemptResult,
} from "../../../../lib/leash/x402-settlement-attempt-store";
import { commitVerifiedX402ResourceSettlement } from "../../../../lib/leash/x402-settlement-convergence";
import {
  findRetryableX402ResourceSettlement,
  saveRetryableX402ResourceSettlement,
} from "../../../../lib/leash/x402-settlement-outbox";
import { verifySuccessfulSettlementProof } from "../../../../lib/leash/x402-settlement-proof";
import {
  readX402SettlementStartBlock,
  recoverX402SettlementAttempt,
} from "../../../../lib/leash/x402-settlement-recovery";
import { findFinalX402ResourceSettlement } from "../../../../lib/leash/x402-settlement-store";
import { buildX402TestnetNextGet } from "../../../../lib/leash/x402-testnet-next";
import {
  readX402TestnetResourceConfig,
  TEST_FUNDS_LABEL,
  X402_TESTNET_FACILITATOR,
  X402TestnetConfigurationError,
} from "../../../../lib/leash/x402-testnet-resource";
import { readBaseSepoliaRpcUrl } from "../../../../lib/leash/x402-testnet-rpc";
import { VerifiedX402Facilitator } from "../../../../lib/leash/x402-verified-facilitator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configuredGet() {
  const config = readX402TestnetResourceConfig();
  const database = getServerDatabase().db;
  const rpcUrl = readBaseSepoliaRpcUrl();
  const facilitator = new VerifiedX402Facilitator(
    new HardenedHTTPFacilitatorClient({ url: X402_TESTNET_FACILITATOR }),
    config,
    {
      beginAttempt: async (attempt, paymentFingerprint) => {
        const startBlock = await readX402SettlementStartBlock(rpcUrl);
        return beginX402SettlementAttempt(database, attempt, paymentFingerprint, startBlock);
      },
      commitVerified: async (settlement, paymentFingerprint) => {
        await commitVerifiedX402ResourceSettlement(database, settlement, paymentFingerprint);
      },
      loadAttempt: (identity) => findX402SettlementAttempt(database, identity),
      loadFinal: (identity) => findFinalX402ResourceSettlement(database, identity),
      loadRetryable: (identity) => findRetryableX402ResourceSettlement(database, identity),
      noteAttemptRetry: (attempt, reason) =>
        noteX402SettlementAttemptRetry(database, attempt, reason),
      persistAttemptResult: (settlement, paymentFingerprint) =>
        saveX402SettlementAttemptResult(database, settlement, paymentFingerprint).then(
          () => undefined,
        ),
      persistRetryable: (settlement, retry) =>
        saveRetryableX402ResourceSettlement(database, settlement, retry).then(() => undefined),
      recoverAttempt: (attempt) => recoverX402SettlementAttempt(attempt, rpcUrl),
      verifySettlement: (settlement) =>
        verifySuccessfulSettlementProof({
          amountAtomic: settlement.amount,
          asset: settlement.asset,
          network: settlement.network,
          nonce: settlement.nonce,
          payee: settlement.payee,
          payer: settlement.payer,
          rpcUrl,
          transactionHash: settlement.transactionHash,
        }),
    },
  );
  return buildX402TestnetNextGet(config, {
    facilitator,
  });
}

let get: ReturnType<typeof configuredGet> | undefined;

export async function GET(request: NextRequest) {
  try {
    get ??= configuredGet();
    return await get(request);
  } catch (error) {
    if (!(error instanceof X402TestnetConfigurationError)) throw error;
    return NextResponse.json(
      {
        error: "X402_TESTNET_NOT_CONFIGURED",
        label: TEST_FUNDS_LABEL,
        testFunds: true,
      },
      { headers: { "cache-control": "no-store" }, status: 503 },
    );
  }
}
