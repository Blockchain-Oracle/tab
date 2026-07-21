import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CanonicalTestTokenChange } from "./checkout-api";
import type { OtpCallbacks } from "./magic";
import { PayButtonCore } from "./PayButton";
import { baseServices, buyer, openedPayment, universalAccount } from "./paybutton-test-fixtures";

describe("PayButton", () => {
  it("reads amount from the intent, reuses Magic, and exposes the real Add Funds address", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const services = baseServices();
    services.restoreBuyer.mockResolvedValue(buyer);
    services.loadAccount
      .mockResolvedValueOnce({
        balanceUsd: 8.5,
        depositAddress: buyer.ownerAddress,
        universalAccount,
      })
      .mockResolvedValueOnce({
        balanceUsd: 20,
        depositAddress: buyer.ownerAddress,
        universalAccount,
      });

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={vi.fn()}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    const button = await screen.findByRole("button", { name: "Pay $12.00" });
    await user.click(button);

    const dialog = await screen.findByRole("dialog", { name: "Checkout" });
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByText("Confirmed Merchant")).toBeInTheDocument();
    expect(within(dialog).getByText("$8.50 available")).toBeInTheDocument();
    expect(within(dialog).getByText(/\$3\.50 short/)).toBeInTheDocument();
    expect(services.startBuyerAuth).not.toHaveBeenCalled();
    expect(services.loadMerchantIntent).toHaveBeenCalledTimes(2);
    expect(services.openPayment).toHaveBeenCalledWith({
      apiBaseUrl: "https://tab.example.test",
      intentToken: "signed.intent.token",
      publishableKey: "pk_test_browser_key",
    });

    await user.click(within(dialog).getByRole("button", { name: "Add funds" }));
    expect(within(dialog).getByText(buyer.ownerAddress)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Send test USDC to this address. Sandbox funds — no real value."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Copy address" }));
    expect(writeText).toHaveBeenCalledWith(buyer.ownerAddress);

    await user.click(within(dialog).getByRole("button", { name: "Check balance again" }));
    expect(await within(dialog).findByText("$20.00 available")).toBeInTheDocument();
    expect(services.restoreBuyer).toHaveBeenCalledOnce();

    await user.click(within(dialog).getByRole("button", { name: "Close checkout" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const restoredButton = screen.getByRole("button", { name: "Pay $12.00" });
    expect(restoredButton).toBeEnabled();
    expect(restoredButton).toHaveFocus();
  });

  it("runs headless OTP and commits an explicitly simulated test payment without broadcasting", async () => {
    const user = userEvent.setup();
    const services = baseServices();
    services.restoreBuyer.mockResolvedValue(undefined);
    services.loadAccount.mockResolvedValue({
      balanceUsd: 20,
      depositAddress: buyer.ownerAddress,
      universalAccount,
    });
    services.createTestPayment.mockReturnValue({
      tokenChanges: { simulation: "simulated_test" },
      transactionId: "test_checkout_transaction",
    });
    const canonicalTokenChanges = [
      {
        amountAtomic: "12000000",
        chainId: 42161,
        receiver: "0x1111111111111111111111111111111111111111",
        simulation: "simulated_test",
        tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      },
    ] satisfies [CanonicalTestTokenChange];
    services.reportPayment.mockResolvedValue({
      payment: {
        id: openedPayment.paymentId,
        reportedTransactionId: "test_checkout_transaction",
        status: "settled",
        tokenChanges: canonicalTokenChanges,
        verification: { method: "simulated_test", verifiedAt: new Date().toISOString() },
      },
      testMode: {
        message: "Test payments are simulated and do not move real funds.",
        simulated: true,
      },
    });
    let resolveBuyer!: (value: typeof buyer) => void;
    const result = new Promise<typeof buyer>((resolve) => {
      resolveBuyer = resolve;
    });
    const verify = vi.fn(() => resolveBuyer(buyer));
    services.startBuyerAuth.mockImplementation(
      async (_context: unknown, _email: string, callbacks: OtpCallbacks) => {
        queueMicrotask(() => callbacks.onOtpSent?.());
        return { cancel: vi.fn(), result, verify };
      },
    );
    const onSuccess = vi.fn();

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={onSuccess}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Pay $12.00" }));
    const dialog = await screen.findByRole("dialog", { name: "Checkout" });
    await user.type(within(dialog).getByLabelText("Email address"), "buyer@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(await within(dialog).findByLabelText("Code digit 1")).toHaveFocus();
    for (const [index, digit] of [..."641728"].entries()) {
      await user.type(await within(dialog).findByLabelText(`Code digit ${index + 1}`), digit);
      if (index === 0) expect(within(dialog).getByLabelText("Code digit 2")).toHaveFocus();
    }
    await vi.waitFor(() => expect(verify).toHaveBeenCalledWith("641728"));
    await within(dialog).findByText("$20.00 available");

    await user.click(within(dialog).getByRole("button", { name: "Pay $12.00" }));
    expect(await within(dialog).findByText("Payment complete")).toBeInTheDocument();
    expect(services.executePayment).not.toHaveBeenCalled();
    expect(services.reportPayment).toHaveBeenCalledWith({
      apiBaseUrl: "https://tab.example.test",
      buyerDidToken: buyer.didToken,
      intent: expect.objectContaining({ amount: "12.00", mode: "test" }),
      paymentId: openedPayment.paymentId,
      publishableKey: "pk_test_browser_key",
      tokenChanges: { simulation: "simulated_test" },
      transactionId: "test_checkout_transaction",
    });
    expect(onSuccess).toHaveBeenCalledWith("test_checkout_transaction", canonicalTokenChanges);
  });
});
