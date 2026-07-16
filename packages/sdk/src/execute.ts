import type { ITransaction } from "@particle-network/universal-account-sdk";

import { preparedTransactionIssue } from "./execute-validation";

declare const process: { env: { NEXT_PUBLIC_SPIKE_COMPLETE?: string | undefined } } | undefined;

export const PAYMENT_EXECUTION_BLOCKED = "PAYMENT_EXECUTION_BLOCKED";

export class PaymentExecutionBlockedError extends Error {
  readonly code = PAYMENT_EXECUTION_BLOCKED;

  constructor() {
    super(PAYMENT_EXECUTION_BLOCKED);
    this.name = "PaymentExecutionBlockedError";
  }
}

export class InvalidPaymentExecutionError extends Error {
  readonly broadcastStarted: boolean;
  readonly phase: ExecutionPhase;
  readonly providerCode: number | undefined;
  readonly providerData: unknown;

  constructor(message: string, phase: ExecutionPhase, cause?: unknown) {
    super(message);
    this.name = "InvalidPaymentExecutionError";
    this.phase = phase;
    this.broadcastStarted = phase === "broadcast" || phase === "result";
    const provider = providerError(cause);
    this.providerCode = provider.code;
    this.providerData = provider.data;
  }
}

export type ExecutionPhase = "authorize" | "broadcast" | "prepare" | "result";

export type UniversalAccountPort = {
  createTransferTransaction(input: {
    amount: string;
    receiver: string;
    token: { address: string; chainId: number };
  }): Promise<ITransaction>;
  sendTransaction(
    transaction: ITransaction,
    signature: string,
    authorizations?: Array<{ signature: string; userOpHash: string }>,
  ): Promise<unknown>;
};

export type PaymentSigner = {
  signAuthorization(input: {
    address: string;
    chainId: number;
    nonce: number;
    userOpHash: string;
  }): Promise<string>;
  signRootHash(rootHash: string, ownerAddress: string): Promise<string>;
};

export type ExecutePaymentInput = {
  amount: string;
  ownerAddress: string;
  receiver: string;
  signer: PaymentSigner;
  token: { address: string; chainId: number };
  universalAccount: UniversalAccountPort;
};

function fundedSpikeComplete() {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_SPIKE_COMPLETE === "true";
}

function providerError(value: unknown): { code: number | undefined; data: unknown } {
  if (!value || typeof value !== "object") return { code: undefined, data: undefined };
  const record = value as { code?: unknown; data?: unknown };
  return { code: typeof record.code === "number" ? record.code : undefined, data: record.data };
}

function phaseError(error: unknown, phase: ExecutionPhase) {
  if (error instanceof InvalidPaymentExecutionError) return error;
  return new InvalidPaymentExecutionError("Payment execution failed", phase, error);
}

function hash(value: string, phase: ExecutionPhase) {
  if (!/^0x[\da-f]{64}$/i.test(value)) {
    throw new InvalidPaymentExecutionError("Invalid hash", phase);
  }
  return value;
}

function signature(value: string, phase: ExecutionPhase) {
  if (!/^0x[\da-f]{130}$/i.test(value)) {
    throw new InvalidPaymentExecutionError("Invalid signature", phase);
  }
  return value;
}

function result(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidPaymentExecutionError("Payment result is unavailable", "result");
  }
  const record = value as Record<string, unknown>;
  const tokenChanges = record.tokenChanges;
  if (
    typeof record.transactionId !== "string" ||
    !record.transactionId.trim() ||
    !tokenChanges ||
    typeof tokenChanges !== "object" ||
    Array.isArray(tokenChanges) ||
    Object.keys(tokenChanges).length === 0
  ) {
    throw new InvalidPaymentExecutionError("Payment result is unavailable", "result");
  }
  return { tokenChanges, transactionId: record.transactionId };
}

export async function executePayment(input: ExecutePaymentInput) {
  if (!fundedSpikeComplete()) throw new PaymentExecutionBlockedError();

  let transaction: ITransaction;
  try {
    transaction = await input.universalAccount.createTransferTransaction({
      amount: input.amount,
      receiver: input.receiver,
      token: input.token,
    });
    hash(transaction.rootHash, "prepare");
    const issue = preparedTransactionIssue(transaction, input);
    if (issue) throw new InvalidPaymentExecutionError(issue, "prepare");
  } catch (error) {
    throw phaseError(error, "prepare");
  }

  const authorizations: Array<{ signature: string; userOpHash: string }> = [];
  const signatureByAuthorization = new Map<string, string>();
  let rootSignature: string;
  try {
    for (const userOp of transaction.userOps) {
      const authorization = userOp.eip7702Auth;
      if (!authorization || userOp.eip7702Delegated) continue;
      const userOpHash = hash(userOp.userOpHash, "authorize");
      if (authorization.chainId !== userOp.chainId) {
        throw new InvalidPaymentExecutionError("Authorization chain mismatch", "authorize");
      }
      const key = `${authorization.chainId}:${authorization.nonce}:${authorization.address.toLowerCase()}`;
      let signed = signatureByAuthorization.get(key);
      if (!signed) {
        signed = signature(
          await input.signer.signAuthorization({ ...authorization, userOpHash }),
          "authorize",
        );
        signatureByAuthorization.set(key, signed);
      }
      authorizations.push({ signature: signed, userOpHash });
    }
    rootSignature = signature(
      await input.signer.signRootHash(transaction.rootHash, input.ownerAddress),
      "authorize",
    );
  } catch (error) {
    throw phaseError(error, "authorize");
  }

  let response: unknown;
  try {
    response = await input.universalAccount.sendTransaction(
      transaction,
      rootSignature,
      authorizations,
    );
  } catch (error) {
    throw phaseError(error, "broadcast");
  }
  return result(response);
}
