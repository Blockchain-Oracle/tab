import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENTROPY_BYTES = 5;

function encodeSuffix(entropy: Uint8Array) {
  let buffer = 0;
  let bitCount = 0;
  let suffix = "";
  for (const byte of entropy) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      suffix += CROCKFORD_BASE32[(buffer >> bitCount) & 31];
      buffer &= (1 << bitCount) - 1;
    }
  }
  return suffix;
}

export function mintPaymentRefCode(entropy: Uint8Array = randomBytes(ENTROPY_BYTES)) {
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error("Payment references require exactly 5 random bytes");
  }

  return `TAB-${encodeSuffix(entropy)}`;
}
