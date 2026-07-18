import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

import type { PaymentProfile } from "./payment-profile.js";
import type { LeashRemoteSigner } from "./remote-signer.js";
import {
  ARBITRUM_NETWORK,
  BASE_NETWORK,
  BASE_SEPOLIA_NETWORK,
  selectLeashPaymentRequirements,
} from "./routing.js";

export function createLeashPaymentClient(
  signer: LeashRemoteSigner,
  paymentProfile: PaymentProfile,
) {
  const scheme = new ExactEvmScheme(signer);
  const client = new x402Client((version, requirements) =>
    selectLeashPaymentRequirements(paymentProfile, version, requirements),
  );
  if (paymentProfile === "base_sepolia_integration") {
    client.register(BASE_SEPOLIA_NETWORK, scheme);
  } else {
    client.register(BASE_NETWORK, scheme).register(ARBITRUM_NETWORK, scheme);
  }
  return client;
}
