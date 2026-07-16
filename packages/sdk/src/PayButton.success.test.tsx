import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OpenedPayment, PaymentReportResponse } from "./checkout-api";
import { PayButtonCore } from "./PayButton";
import {
  baseServices,
  buyer,
  context,
  intent,
  openedPayment,
  universalAccount,
} from "./paybutton-test-fixtures";

describe("PayButton success boundary", () => {
  it("reaches optimistic success before the durable server report returns", async () => {
    const user = userEvent.setup();
    const services = baseServices();
    const liveIntent = { ...intent, mode: "live" as const };
    const liveContext = {
      ...context,
      capabilities: { livePaymentExecution: true },
      mode: "live" as const,
    };
    const liveOpened: OpenedPayment = {
      ...openedPayment,
      payment: { ...openedPayment.payment, env: "live", livemode: true },
    };
    const tokenChanges = { totalPaidAmountInUSD: "12.00" };
    services.loadCheckoutContext.mockResolvedValue(liveContext);
    services.loadMerchantIntent.mockResolvedValue({
      intent: liveIntent,
      intentToken: "signed.live.intent.token",
    });
    services.openPayment.mockResolvedValue(liveOpened);
    services.restoreBuyer.mockResolvedValue(buyer);
    services.loadAccount.mockResolvedValue({
      balanceUsd: 20,
      depositAddress: buyer.ownerAddress,
      universalAccount,
    });
    services.executePayment.mockResolvedValue({
      tokenChanges,
      transactionId: "particle-transaction-id",
    });
    let resolveReport!: (value: PaymentReportResponse) => void;
    services.reportPayment.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReport = resolve;
        }),
    );
    const onSuccess = vi.fn();

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={onSuccess}
        publishableKey="pk_live_browser_key"
        services={services}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Pay $12.00" }));
    const dialog = await screen.findByRole("dialog", { name: "Checkout" });
    await within(dialog).findByText("$20.00 available");
    await user.click(within(dialog).getByRole("button", { name: "Pay $12.00" }));

    expect(await within(dialog).findByText("Payment complete")).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith("particle-transaction-id", tokenChanges);
    expect(services.reportPayment).toHaveBeenCalledWith({
      apiBaseUrl: "https://tab.example.test",
      buyerDidToken: buyer.didToken,
      intent: liveIntent,
      paymentId: openedPayment.paymentId,
      publishableKey: "pk_live_browser_key",
      tokenChanges,
      transactionId: "particle-transaction-id",
    });
    resolveReport({
      payment: {
        id: openedPayment.paymentId,
        reportedTransactionId: "particle-transaction-id",
        status: "pending",
        verification: { method: null, verifiedAt: null },
      },
      verification: {
        code: "LIVE_SETTLEMENT_VERIFICATION_BLOCKED",
        message: "Live payment evidence was recorded.",
      },
    });
  });
});
