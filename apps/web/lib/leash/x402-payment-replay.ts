import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { isAddressEqual, recoverTypedDataAddress } from "viem";

const AUTHORIZATION_TYPES = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

function stringField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error("The x402 replay authority is invalid.");
  }
  return value;
}

export async function verifyX402PaymentSignature(
  paymentPayload: PaymentPayload,
  requirements: PaymentRequirements,
) {
  try {
    const authorization = paymentPayload.payload.authorization;
    if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
      return false;
    }
    const fields = authorization as Record<string, unknown>;
    const extra = requirements.extra;
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
    const signature = paymentPayload.payload.signature;
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
    const recovered = await recoverTypedDataAddress({
      domain: {
        chainId: 84532,
        name: stringField(extra, "name"),
        verifyingContract: requirements.asset as `0x${string}`,
        version: stringField(extra, "version"),
      },
      message: {
        from: stringField(fields, "from") as `0x${string}`,
        nonce: stringField(fields, "nonce") as `0x${string}`,
        to: stringField(fields, "to") as `0x${string}`,
        validAfter: BigInt(stringField(fields, "validAfter")),
        validBefore: BigInt(stringField(fields, "validBefore")),
        value: BigInt(stringField(fields, "value")),
      },
      primaryType: "TransferWithAuthorization",
      signature: signature as `0x${string}`,
      types: { TransferWithAuthorization: AUTHORIZATION_TYPES },
    });
    return isAddressEqual(recovered, stringField(fields, "from") as `0x${string}`);
  } catch {
    return false;
  }
}
