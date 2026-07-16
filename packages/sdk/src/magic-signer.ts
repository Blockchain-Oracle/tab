import { getAddress, type Hex, isAddress, recoverMessageAddress, serializeSignature } from "viem";
import { recoverAuthorizationAddress } from "viem/utils";

export type MagicSigningPort = {
  rpcProvider: {
    request(input: { method: string; params: unknown[] }): PromiseLike<unknown>;
  };
  wallet: {
    sign7702Authorization(input: {
      chainId: number;
      contractAddress: string;
      nonce: number;
    }): PromiseLike<unknown>;
  };
};

export class InvalidMagicSignatureError extends Error {
  constructor() {
    super("Magic returned an invalid signature");
    this.name = "InvalidMagicSignatureError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hex(value: unknown, bytes: number): Hex {
  if (typeof value !== "string" || !new RegExp(`^0x[\\da-f]{${bytes * 2}}$`, "i").test(value)) {
    throw new InvalidMagicSignatureError();
  }
  return value as Hex;
}

function parity(value: unknown): 0 | 1 {
  if (value === 0 || value === 27) return 0;
  if (value === 1 || value === 28) return 1;
  throw new InvalidMagicSignatureError();
}

function sameAddress(left: string, right: string) {
  return isAddress(left) && isAddress(right) && getAddress(left) === getAddress(right);
}

export function createMagicPaymentSigner(client: MagicSigningPort, rawOwnerAddress: string) {
  if (!isAddress(rawOwnerAddress)) throw new InvalidMagicSignatureError();
  const ownerAddress = getAddress(rawOwnerAddress);

  return {
    async signAuthorization(input: {
      address: string;
      chainId: number;
      nonce: number;
      userOpHash: string;
    }) {
      if (
        !isAddress(input.address) ||
        !Number.isSafeInteger(input.chainId) ||
        !Number.isSafeInteger(input.nonce)
      ) {
        throw new InvalidMagicSignatureError();
      }
      hex(input.userOpHash, 32);
      const response = record(
        await client.wallet.sign7702Authorization({
          chainId: input.chainId,
          contractAddress: getAddress(input.address),
          nonce: input.nonce,
        }),
      );
      if (
        !response ||
        response.chainId !== input.chainId ||
        response.nonce !== input.nonce ||
        typeof response.contractAddress !== "string" ||
        !sameAddress(response.contractAddress, input.address)
      ) {
        throw new InvalidMagicSignatureError();
      }
      const signature = serializeSignature({
        r: hex(response.r, 32),
        s: hex(response.s, 32),
        yParity: parity(response.v),
      });
      const recovered = await recoverAuthorizationAddress({
        authorization: {
          address: getAddress(input.address),
          chainId: input.chainId,
          nonce: input.nonce,
        },
        signature,
      });
      if (!sameAddress(recovered, ownerAddress)) throw new InvalidMagicSignatureError();
      return signature;
    },

    async signRootHash(rootHash: string, requestedOwnerAddress: string) {
      const message = hex(rootHash, 32);
      if (!sameAddress(requestedOwnerAddress, ownerAddress)) {
        throw new InvalidMagicSignatureError();
      }
      const response = hex(
        await client.rpcProvider.request({
          method: "personal_sign",
          params: [message, ownerAddress],
        }),
        65,
      );
      const recovered = await recoverMessageAddress({
        message: { raw: message },
        signature: response,
      });
      if (!sameAddress(recovered, ownerAddress)) throw new InvalidMagicSignatureError();
      return response;
    },
  };
}
