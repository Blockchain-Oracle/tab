import type { TokenChainId } from "./token-identity";

export type CheckoutMode = "live" | "test";

export type PaymentIntent = {
  amount: string;
  currency: "USD";
  mode: CheckoutMode;
  receiver: string;
  token: { address: string; chainId: TokenChainId };
};

export type MerchantIntentResponse = {
  intent: PaymentIntent;
  intentToken: string;
};

export type CheckoutContext = {
  capabilities: { livePaymentExecution: boolean };
  clientConfig: {
    magicPublishableKey: string;
    particle: {
      projectAppUuid: string;
      projectClientKey: string;
      projectId: string;
    };
  };
  merchant: { businessName: string | null; logoUrl: string | null };
  mode: CheckoutMode;
};

export type OpenedPayment = {
  payment: {
    amount: string;
    currency: "USD";
    env: CheckoutMode;
    livemode: boolean;
    receiver: string;
    status: "pending";
    token: { address: string; chainId: TokenChainId };
  };
  paymentId: string;
  refCode: string;
};

export type CanonicalTestTokenChange = {
  amountAtomic: string;
  chainId: TokenChainId;
  receiver: string;
  tokenAddress: string;
};

type PaymentReportBase = {
  id: string;
  reportedTransactionId: string;
};

export type PaymentReportResponse =
  | {
      payment: PaymentReportBase & {
        status: "settled";
        tokenChanges: [CanonicalTestTokenChange];
        verification: { method: "rpc"; verifiedAt: string };
      };
      testMode: { message: string; network: "eip155:84532" };
    }
  | {
      payment: PaymentReportBase & {
        status: "pending";
        verification: { method: null; verifiedAt: null };
      };
      verification: {
        code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED" | "TEST_SETTLEMENT_PENDING";
        message: string;
      };
    };

export class CheckoutApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CheckoutApiError";
  }
}
