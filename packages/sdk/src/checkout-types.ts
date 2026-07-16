export type CheckoutMode = "live" | "test";

export type PaymentIntent = {
  amount: string;
  currency: "USD";
  mode: CheckoutMode;
  receiver: string;
  token: { address: string; chainId: 42161 };
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
    token: { address: string; chainId: 42161 };
  };
  paymentId: string;
  refCode: string;
};

export type CanonicalTestTokenChange = {
  amountAtomic: string;
  chainId: 42161;
  receiver: string;
  simulation: "simulated_test";
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
        verification: { method: "simulated_test"; verifiedAt: string };
      };
      testMode: { message: string; simulated: true };
    }
  | {
      payment: PaymentReportBase & {
        status: "pending";
        verification: { method: null; verifiedAt: null };
      };
      verification: { code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED"; message: string };
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
