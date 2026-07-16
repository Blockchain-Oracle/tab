import type { ITransaction } from "@particle-network/universal-account-sdk";

type ExpectedAuthority = { ownerAddress: string; receiver: string };

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[\da-f]{40}$/i.test(value);
}

function sameAddress(actual: unknown, expected: string) {
  return isAddress(actual) && actual.toLowerCase() === expected.toLowerCase();
}

export function preparedTransactionIssue(
  transaction: ITransaction,
  expected: ExpectedAuthority,
): string | undefined {
  if (transaction.tag !== "transfer_v2") return "Unexpected transaction type";
  if (!sameAddress(transaction.receiver, expected.receiver)) return "Receiver mismatch";
  if (!sameAddress(transaction.sender, expected.ownerAddress)) return "Sender mismatch";
  if (!sameAddress(transaction.smartAccountOptions?.ownerAddress, expected.ownerAddress)) {
    return "Owner mismatch";
  }
  if (!sameAddress(transaction.smartAccountOptions?.senderAddress, expected.ownerAddress)) {
    return "Account mismatch";
  }
  for (const userOp of transaction.userOps) {
    if (!sameAddress(userOp.userOp?.sender, expected.ownerAddress))
      return "Operation sender mismatch";
    const delegate = userOp.eip7702Auth?.address;
    if (delegate && (!isAddress(delegate) || /^0x0{40}$/i.test(delegate))) {
      return "Invalid authorization target";
    }
  }
  return undefined;
}
