import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

import type { LeashRemoteSigner } from "./remote-signer.js";
import { ARBITRUM_NETWORK, BASE_NETWORK, selectLeashPaymentRequirements } from "./routing.js";

export function createLeashPaymentClient(signer: LeashRemoteSigner) {
  const scheme = new ExactEvmScheme(signer);
  return new x402Client(selectLeashPaymentRequirements)
    .register(BASE_NETWORK, scheme)
    .register(ARBITRUM_NETWORK, scheme)
    .onPaymentResponse((context) => signer.reportSettledPayment(context));
}
