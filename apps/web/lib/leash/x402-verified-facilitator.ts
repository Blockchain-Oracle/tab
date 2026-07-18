import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";

import { fingerprintX402Payment, paymentFingerprintMatches } from "./x402-payment-fingerprint";
import { verifyX402PaymentSignature } from "./x402-payment-replay";
import {
  sameX402AttemptAuthorization,
  sameX402SettlementAuthorization,
  settlementFromAttempt,
  type X402AuthorizationIdentity,
  x402AuthorizationIdentity,
  x402IdentityKey,
} from "./x402-replay-identity";
import type { DurableX402Attempt } from "./x402-settlement-attempt-store";
import type { SettlementProofResult } from "./x402-settlement-proof";
import type { X402AttemptRecovery } from "./x402-settlement-recovery";
import {
  normalizeX402TestnetSettlement,
  normalizeX402TestnetSettlementAttempt,
  type X402TestnetResourceConfig,
  type X402TestnetSettlement,
  type X402TestnetSettlementAttempt,
} from "./x402-testnet-resource";
import { VerifiedReplayCache } from "./x402-verified-replay-cache";

type DurableSettlement = { paymentFingerprint: string; settlement: X402TestnetSettlement };

export interface VerifiedX402FacilitatorDependencies {
  beginAttempt(
    attempt: X402TestnetSettlementAttempt,
    paymentFingerprint: string,
  ): Promise<
    | { attempt: DurableX402Attempt; created: true }
    | { attempt: DurableX402Attempt | null; created: false }
  >;
  commitVerified(settlement: X402TestnetSettlement, paymentFingerprint: string): Promise<void>;
  loadAttempt(identity: X402AuthorizationIdentity): Promise<DurableX402Attempt | null>;
  loadFinal(identity: X402AuthorizationIdentity): Promise<DurableSettlement | null>;
  loadRetryable(identity: X402AuthorizationIdentity): Promise<DurableSettlement | null>;
  noteAttemptRetry(
    attempt: DurableX402Attempt,
    reason: "receipt_not_propagated" | "rpc_unavailable",
  ): Promise<void>;
  persistAttemptResult(
    settlement: X402TestnetSettlement,
    paymentFingerprint: string,
  ): Promise<void>;
  persistRetryable(
    settlement: X402TestnetSettlement,
    retry: {
      attempts: number;
      paymentFingerprint: string;
      reason: "receipt_not_propagated" | "rpc_unavailable";
    },
  ): Promise<void>;
  recoverAttempt(attempt: DurableX402Attempt): Promise<X402AttemptRecovery>;
  now?(): number;
  signatureVerifier?(payload: PaymentPayload, requirements: PaymentRequirements): Promise<boolean>;
  sleep?(milliseconds: number): Promise<void>;
  verificationDelaysMs?: readonly number[];
  verifiedReplayCapacity?: number;
  verifiedReplayTtlMs?: number;
  verifySettlement(settlement: X402TestnetSettlement): Promise<SettlementProofResult>;
}

export class X402SettlementVerificationError extends Error {
  readonly code:
    | "X402_SETTLEMENT_PROOF_INVALID"
    | "X402_SETTLEMENT_PROOF_RETRYABLE"
    | "X402_SETTLEMENT_REPLAY_CONFLICT";

  constructor(code: X402SettlementVerificationError["code"]) {
    super(
      code === "X402_SETTLEMENT_PROOF_RETRYABLE"
        ? "Settlement confirmation is pending independent verification."
        : "Settlement failed independent verification.",
    );
    this.code = code;
    this.name = "X402SettlementVerificationError";
  }
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class VerifiedX402Facilitator implements FacilitatorClient {
  private readonly verifiedReplays: VerifiedReplayCache<DurableSettlement>;

  constructor(
    private readonly delegate: FacilitatorClient,
    private readonly config: X402TestnetResourceConfig,
    private readonly dependencies: VerifiedX402FacilitatorDependencies,
  ) {
    this.verifiedReplays = new VerifiedReplayCache({
      ...(dependencies.verifiedReplayCapacity === undefined
        ? {}
        : { capacity: dependencies.verifiedReplayCapacity }),
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      ...(dependencies.verifiedReplayTtlMs === undefined
        ? {}
        : { ttlMs: dependencies.verifiedReplayTtlMs }),
    });
  }

  getSupported() {
    return this.delegate.getSupported();
  }

  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) {
    const identity = x402AuthorizationIdentity(paymentPayload, paymentRequirements);
    const evidence = await this.loadEvidence(identity);
    if (!evidence) return this.delegate.verify(paymentPayload, paymentRequirements);
    const fingerprint = fingerprintX402Payment(paymentPayload);
    await this.requireExactReplay(evidence, fingerprint, paymentPayload, paymentRequirements);
    const settlement = await this.settlementForEvidence(evidence, fingerprint);
    await this.verifyAndCache(identity, settlement, fingerprint, evidence);
    return { isValid: true, payer: settlement.payer };
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) {
    const identity = x402AuthorizationIdentity(paymentPayload, paymentRequirements);
    const fingerprint = fingerprintX402Payment(paymentPayload);
    const evidence = await this.loadEvidence(identity);
    if (evidence) {
      await this.requireExactReplay(evidence, fingerprint, paymentPayload, paymentRequirements);
      const settlement = await this.settlementForEvidence(evidence, fingerprint);
      const key = x402IdentityKey(identity);
      const verified = this.verifiedReplays.take(key, fingerprint);
      if (verified) {
        await this.dependencies.commitVerified(settlement, fingerprint);
      } else {
        await this.verifyAndCommit(settlement, fingerprint, evidence);
      }
      return settlement.facilitatorResponse as SettleResponse;
    }

    const attempt = normalizeX402TestnetSettlementAttempt(
      this.config,
      paymentPayload,
      paymentRequirements,
    );
    if (!(await this.verifyPaymentSignature(paymentPayload, paymentRequirements))) {
      throw new X402SettlementVerificationError("X402_SETTLEMENT_REPLAY_CONFLICT");
    }
    const begun = await this.dependencies.beginAttempt(attempt, fingerprint);
    if (!begun.created) {
      throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_RETRYABLE");
    }
    const result = await this.delegate.settle(paymentPayload, paymentRequirements);
    if (!result.success) return result;
    const settlement = normalizeX402TestnetSettlement(this.config, {
      declaredExtensions: {},
      paymentPayload,
      requirements: paymentRequirements,
      result,
    });
    await this.dependencies.persistAttemptResult(settlement, fingerprint);
    await this.verifyAndCommit(settlement, fingerprint, {
      attempt: begun.attempt,
      kind: "attempt",
    });
    return result;
  }

  private async loadEvidence(identity: X402AuthorizationIdentity) {
    const final = await this.dependencies.loadFinal(identity);
    if (final) return { ...final, kind: "settlement" as const };
    const retryable = await this.dependencies.loadRetryable(identity);
    if (retryable) return { ...retryable, kind: "settlement" as const };
    const attempt = await this.dependencies.loadAttempt(identity);
    return attempt ? { attempt, kind: "attempt" as const } : null;
  }

  private async requireExactReplay(
    evidence: NonNullable<Awaited<ReturnType<VerifiedX402Facilitator["loadEvidence"]>>>,
    fingerprint: string,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ) {
    const storedFingerprint =
      evidence.kind === "settlement"
        ? evidence.paymentFingerprint
        : evidence.attempt.paymentFingerprint;
    const sameAuthorization =
      evidence.kind === "settlement"
        ? sameX402SettlementAuthorization(evidence.settlement, this.config, payload, requirements)
        : sameX402AttemptAuthorization(evidence.attempt, this.config, payload, requirements);
    if (
      !paymentFingerprintMatches(storedFingerprint, fingerprint) ||
      !sameAuthorization ||
      !(await this.verifyPaymentSignature(payload, requirements))
    ) {
      throw new X402SettlementVerificationError("X402_SETTLEMENT_REPLAY_CONFLICT");
    }
  }

  private verifyPaymentSignature(payload: PaymentPayload, requirements: PaymentRequirements) {
    return (this.dependencies.signatureVerifier ?? verifyX402PaymentSignature)(
      payload,
      requirements,
    );
  }

  private async settlementForEvidence(
    evidence: NonNullable<Awaited<ReturnType<VerifiedX402Facilitator["loadEvidence"]>>>,
    fingerprint: string,
  ) {
    if (evidence.kind === "settlement") return evidence.settlement;
    const stored = settlementFromAttempt(evidence.attempt);
    if (stored) return stored;
    const recovery = await this.dependencies.recoverAttempt(evidence.attempt);
    if (recovery.status === "verified") {
      await this.dependencies.persistAttemptResult(recovery.settlement, fingerprint);
      return recovery.settlement;
    }
    if (recovery.status === "retryable") {
      await this.dependencies.noteAttemptRetry(evidence.attempt, recovery.reason);
      throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_RETRYABLE");
    }
    if (recovery.status === "pending") {
      await this.dependencies.noteAttemptRetry(evidence.attempt, "receipt_not_propagated");
      throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_RETRYABLE");
    }
    throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_INVALID");
  }

  private async verifyBounded(settlement: X402TestnetSettlement) {
    const delays = this.dependencies.verificationDelaysMs ?? [100, 300];
    const sleep = this.dependencies.sleep ?? defaultSleep;
    let proof: SettlementProofResult;
    for (let attempt = 0; ; attempt += 1) {
      proof = await this.dependencies.verifySettlement(settlement);
      if (proof.status !== "retryable") return { attempts: attempt + 1, result: proof };
      const delay = delays[attempt];
      if (delay === undefined) return { attempts: attempt + 1, result: proof };
      await sleep(delay);
    }
  }

  private async verifyAndCache(
    identity: X402AuthorizationIdentity,
    settlement: X402TestnetSettlement,
    fingerprint: string,
    evidence: { attempt: DurableX402Attempt; kind: "attempt" } | { kind: "settlement" },
  ) {
    const proof = await this.verifyBounded(settlement);
    if (proof.result.status === "verified") {
      this.verifiedReplays.set(x402IdentityKey(identity), {
        paymentFingerprint: fingerprint,
        settlement,
      });
      return;
    }
    await this.handleUnverified(settlement, fingerprint, proof, evidence);
  }

  private async verifyAndCommit(
    settlement: X402TestnetSettlement,
    fingerprint: string,
    evidence: { attempt: DurableX402Attempt; kind: "attempt" } | { kind: "settlement" },
  ) {
    const proof = await this.verifyBounded(settlement);
    if (proof.result.status === "verified") {
      await this.dependencies.commitVerified(settlement, fingerprint);
      return;
    }
    await this.handleUnverified(settlement, fingerprint, proof, evidence);
  }

  private async handleUnverified(
    settlement: X402TestnetSettlement,
    fingerprint: string,
    proof: Awaited<ReturnType<VerifiedX402Facilitator["verifyBounded"]>>,
    evidence: { attempt: DurableX402Attempt; kind: "attempt" } | { kind: "settlement" },
  ): Promise<never> {
    if (proof.result.status === "invalid") {
      throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_INVALID");
    }
    if (proof.result.status === "verified") throw new Error("Unexpected verified settlement.");
    if (evidence.kind === "attempt") {
      await this.dependencies.noteAttemptRetry(evidence.attempt, proof.result.reason);
    }
    await this.dependencies.persistRetryable(settlement, {
      attempts: proof.attempts,
      paymentFingerprint: fingerprint,
      reason: proof.result.reason,
    });
    throw new X402SettlementVerificationError("X402_SETTLEMENT_PROOF_RETRYABLE");
  }
}
