import { type Mock, vi } from "vitest";

import type { OpenedPayment } from "./checkout-api";
import type { BuyerRuntime, CheckoutServices } from "./checkout-services";
import type { PaymentSigner, UniversalAccountPort } from "./execute";

type MockedCheckoutServices = {
  [Key in keyof CheckoutServices]: Mock<CheckoutServices[Key]>;
};

export const intent = {
  amount: "12.00",
  currency: "USD" as const,
  mode: "test" as const,
  receiver: "0x2222222222222222222222222222222222222222",
  token: {
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainId: 84532 as const,
  },
};

export const context = {
  capabilities: { livePaymentExecution: false },
  clientConfig: {
    magicPublishableKey: "pk_live_magic_public",
    particle: {
      projectAppUuid: "particle-app",
      projectClientKey: "particle-client",
      projectId: "particle-project",
    },
  },
  merchant: { businessName: "Confirmed Merchant", logoUrl: null },
  mode: "test" as const,
};

const signer: PaymentSigner = {
  signAuthorization: vi.fn<PaymentSigner["signAuthorization"]>(),
  signRootHash: vi.fn<PaymentSigner["signRootHash"]>(),
};

export const buyer: BuyerRuntime = {
  didToken: "buyer.did.token",
  email: "buyer@example.test",
  ownerAddress: "0x1111111111111111111111111111111111111111",
  signer,
};

export const universalAccount: UniversalAccountPort = {
  createTransferTransaction: vi.fn<UniversalAccountPort["createTransferTransaction"]>(),
  sendTransaction: vi.fn<UniversalAccountPort["sendTransaction"]>(),
};

export const openedPayment: OpenedPayment = {
  payment: { ...intent, env: "test", livemode: false, status: "pending" },
  paymentId: "1d15cc1f-30a7-4f28-9d33-b93f4fd806aa",
  refCode: "TAB-2J7VNW4Q",
};

export function baseServices(): MockedCheckoutServices {
  return {
    claimTestFunds: vi.fn(),
    executeTestPayment: vi.fn(),
    executePayment: vi.fn(),
    loadAccount: vi.fn(),
    loadCheckoutContext: vi.fn().mockResolvedValue(context),
    loadMerchantIntent: vi.fn().mockResolvedValue({ intent, intentToken: "signed.intent.token" }),
    openPayment: vi.fn().mockResolvedValue(openedPayment),
    reportPayment: vi.fn(),
    restoreBuyer: vi.fn(),
    startBuyerAuth: vi.fn(),
  };
}
