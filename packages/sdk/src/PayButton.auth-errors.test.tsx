import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OtpCallbacks } from "./magic";
import { PayButtonCore } from "./PayButton";
import { baseServices } from "./paybutton-test-fixtures";

describe("PayButton authentication errors", () => {
  afterEach(() => vi.useRealTimers());

  it("invalidates a cancelled expired-code attempt before its rejection settles", async () => {
    const user = userEvent.setup();
    const services = baseServices();
    let rejectResult: (reason?: unknown) => void = () => undefined;
    const result = new Promise<never>((_resolve, reject) => {
      rejectResult = reject;
    });
    const cancel = vi.fn(() => rejectResult(new Error("Magic flow cancelled")));
    services.restoreBuyer.mockResolvedValue(undefined);
    services.startBuyerAuth.mockImplementation(
      async (_context: unknown, _email: string, callbacks: OtpCallbacks) => {
        callbacks.onOtpSent?.();
        return {
          cancel,
          result,
          verify: vi.fn(() => callbacks.onExpired?.()),
        };
      },
    );

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={vi.fn()}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Pay $12.00" }));
    const dialog = await screen.findByRole("dialog", { name: "Checkout" });
    await user.type(within(dialog).getByLabelText("Email address"), "buyer@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));
    for (const [index, digit] of [..."123456"].entries()) {
      await user.type(within(dialog).getByLabelText(`Code digit ${index + 1}`), digit);
    }

    expect(await within(dialog).findByText(/code has expired/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Start over" }));
    expect(within(dialog).getByLabelText("Email address")).toHaveValue("buyer@example.test");
    expect(cancel).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(within(dialog).queryByText("Something went wrong")).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText("Email address")).toBeInTheDocument();
    });
  });

  it("does not offer an immediate retry after Magic throttles the attempt", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const services = baseServices();
    const cancel = vi.fn();
    services.restoreBuyer.mockResolvedValue(undefined);
    services.startBuyerAuth.mockImplementation(
      async (_context: unknown, _email: string, callbacks: OtpCallbacks) => {
        callbacks.onRateLimited?.();
        return { cancel, result: new Promise(() => undefined), verify: vi.fn() };
      },
    );

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={vi.fn()}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Pay $12.00" }));
    const dialog = await screen.findByRole("dialog", { name: "Checkout" });
    await user.type(within(dialog).getByLabelText("Email address"), "buyer@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(await within(dialog).findByText(/Too many attempts/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Start over" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Close checkout" }));
    await user.click(screen.getByRole("button", { name: "Pay $12.00" }));
    const reopened = await screen.findByRole("dialog", { name: "Checkout" });
    expect(within(reopened).getByRole("button", { name: "Continue" })).toBeDisabled();

    await act(async () => vi.advanceTimersByTime(30_000));
    expect(within(reopened).getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
