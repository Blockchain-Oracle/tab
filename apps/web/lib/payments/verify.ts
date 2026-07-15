export type LiveVerificationTrigger = "cron_sweep" | "inline";

export interface ReportedLivePayment {
  amountUsd: string;
  id: string;
  payerAddress: string;
  receiver: string;
  reportedTokenChanges: unknown[];
  reportedTransactionId: string;
  tokenAddress: string;
  tokenChainId: number;
}

export interface PendingLiveVerification {
  blocker: "B-04";
  status: "blocked";
}

export function liveSettlementVerificationAvailable(): boolean {
  return false;
}

export async function verifyReportedLivePayment(
  _payment: ReportedLivePayment,
  _trigger: LiveVerificationTrigger,
): Promise<PendingLiveVerification> {
  return { blocker: "B-04", status: "blocked" };
}
