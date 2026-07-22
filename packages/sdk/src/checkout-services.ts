import type { UniversalAccount } from "@particle-network/universal-account-sdk";

import {
  type CheckoutContext,
  loadCheckoutContext,
  loadMerchantIntent,
  type MerchantIntentResponse,
  type OpenedPayment,
  openPayment,
  type PaymentIntent,
  type PaymentReportResponse,
  reportPayment,
} from "./checkout-api";
import { executePayment, type PaymentSigner, type UniversalAccountPort } from "./execute";
import {
  type BuyerWalletSession,
  createMagicPaymentSigner,
  getMagicClient,
  type OtpCallbacks,
  restoreMagicSession,
  startMagicEmailOtp,
} from "./magic";
import {
  claimTestFunds,
  loadTestBalance,
  MIN_GAS_WEI,
  type TestFundsGrant,
  testUsdBalance,
} from "./test-rail-api";

export type BuyerRuntime = BuyerWalletSession & { signer: PaymentSigner };

export type AccountRuntime = {
  balanceUsd: number;
  depositAddress: string;
  /** Null on the test rail — Testnet never loads the Particle SDK. */
  universalAccount: UniversalAccountPort | null;
};

export type BuyerAuthAttempt = {
  cancel(): void;
  result: Promise<BuyerRuntime>;
  verify(otp: string): void;
};

type SignalOptions = { signal?: AbortSignal };

export type CheckoutServices = {
  executeTestPayment(input: {
    buyer: BuyerRuntime;
    intent: PaymentIntent;
    publishableKey: string;
  }): Promise<{
    tokenChanges: object;
    transactionId: string;
  }>;
  claimTestFunds(input: {
    apiBaseUrl: string;
    buyerDidToken: string;
    publishableKey: string;
  }): Promise<TestFundsGrant>;
  executePayment(input: {
    account: AccountRuntime;
    buyer: BuyerRuntime;
    intent: PaymentIntent;
  }): Promise<{ tokenChanges: object; transactionId: string }>;
  loadAccount(
    context: CheckoutContext,
    buyer: BuyerRuntime,
    api: { apiBaseUrl: string; publishableKey: string },
  ): Promise<AccountRuntime>;
  loadCheckoutContext(
    input: { apiBaseUrl: string; publishableKey: string },
    options?: SignalOptions,
  ): Promise<CheckoutContext>;
  loadMerchantIntent(intentUrl: string, options?: SignalOptions): Promise<MerchantIntentResponse>;
  openPayment(
    input: { apiBaseUrl: string; intentToken: string; publishableKey: string },
    options?: SignalOptions,
  ): Promise<OpenedPayment>;
  reportPayment(input: {
    apiBaseUrl: string;
    buyerDidToken: string;
    paymentId: string;
    publishableKey: string;
    intent: PaymentIntent;
    tokenChanges: object;
    transactionId: string;
  }): Promise<PaymentReportResponse>;
  restoreBuyer(context: CheckoutContext): Promise<BuyerRuntime | undefined>;
  startBuyerAuth(
    context: CheckoutContext,
    email: string,
    callbacks: OtpCallbacks,
  ): Promise<BuyerAuthAttempt>;
};

async function withSigner(
  session: BuyerWalletSession,
  client: Awaited<ReturnType<typeof getMagicClient>>,
): Promise<BuyerRuntime> {
  return {
    ...session,
    signer: createMagicPaymentSigner(client, session.ownerAddress),
  };
}

export const defaultCheckoutServices: CheckoutServices = {
  async executeTestPayment(input) {
    // Real sandbox settlement: the buyer's Magic EOA moves Base Sepolia USDC.
    const { executeTestPayment } = await import("./test-payment");
    return executeTestPayment({
      amount: input.intent.amount,
      ownerAddress: input.buyer.ownerAddress,
      publishableKey: input.publishableKey,
      receiver: input.intent.receiver,
    });
  },
  claimTestFunds,
  async executePayment(input) {
    if (!input.account.universalAccount) {
      // Test-rail accounts never reach live execution: test settlements go
      // through executeTestPayment, so reaching here is an invariant violation.
      throw new Error("Live execution requires a Universal Account.");
    }
    return executePayment({
      amount: input.intent.amount,
      ownerAddress: input.buyer.ownerAddress,
      receiver: input.intent.receiver,
      signer: input.buyer.signer,
      token: input.intent.token,
      universalAccount: input.account.universalAccount,
    });
  },
  async loadAccount(context, buyer, api) {
    if (context.mode === "test") {
      // Test rail: the balance is the buyer's REAL Base Sepolia USDC, read
      // on-chain by the Tab API. No mainnet figure under a testnet label,
      // and the Particle SDK never loads for a test checkout.
      const { gasWei, usdcAtomic } = await loadTestBalance({ address: buyer.ownerAddress, ...api });
      // A wallet with USDC but no gas cannot move it: surface it as spendable
      // zero so the existing insufficient -> faucet claim path (which grants
      // gas AND USDC, legs skipping independently) repairs both.
      const spendable = gasWei >= MIN_GAS_WEI ? testUsdBalance(usdcAtomic) : 0;
      return {
        balanceUsd: spendable,
        depositAddress: buyer.ownerAddress,
        universalAccount: null,
      };
    }
    // Lazy: the Particle Universal Account SDK loads only once a buyer has
    // authenticated. Merchants embedding <PayButton> never ship it up front.
    const { createUniversalAccountClient, readAccountSnapshot } = await import("./ua");
    const universalAccount = createUniversalAccountClient(
      context.clientConfig.particle,
      buyer.ownerAddress,
    );
    const snapshot = await readAccountSnapshot(universalAccount, buyer.ownerAddress);
    return { ...snapshot, universalAccount: universalAccount as UniversalAccount };
  },
  loadCheckoutContext,
  loadMerchantIntent,
  openPayment,
  reportPayment,
  async restoreBuyer(context) {
    const client = await getMagicClient(context.clientConfig.magicPublishableKey);
    const session = await restoreMagicSession(client);
    return session ? withSigner(session, client) : undefined;
  },
  async startBuyerAuth(context, email, callbacks) {
    const client = await getMagicClient(context.clientConfig.magicPublishableKey);
    const attempt = startMagicEmailOtp(client, email, callbacks);
    return {
      cancel: attempt.cancel,
      result: attempt.result.then((session) => withSigner(session, client)),
      verify: attempt.verify,
    };
  },
};
