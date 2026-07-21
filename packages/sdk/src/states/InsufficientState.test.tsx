import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TestFundsGrant } from "../test-rail-api";
import { InsufficientState } from "./InsufficientState";

function renderState(overrides: Partial<Parameters<typeof InsufficientState>[0]> = {}) {
  const onRecheck = vi.fn();
  const onAddFunds = vi.fn();
  render(
    <InsufficientState
      balance="0.00"
      mode="test"
      onAddFunds={onAddFunds}
      onCancel={vi.fn()}
      onRecheck={onRecheck}
      shortfall="1.00"
      {...overrides}
    />,
  );
  return { onAddFunds, onRecheck };
}

describe("InsufficientState test-mode funding", () => {
  it("rechecks the balance only after a grant verifiably delivered USDC", async () => {
    const user = userEvent.setup();
    const grant: TestFundsGrant = {
      legs: [{ asset: "usdc", state: "funded", txHash: "0xabc" }],
      state: "partial",
    };
    const { onRecheck } = renderState({ onGetTestFunds: vi.fn().mockResolvedValue(grant) });

    await user.click(screen.getByRole("button", { name: "Get free test funds" }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("shows the blocker verbatim when the USDC leg failed — no recheck", async () => {
    const user = userEvent.setup();
    const grant: TestFundsGrant = {
      legs: [{ asset: "usdc", blocker: "The faucet treasury is empty.", state: "failed" }],
      state: "unavailable",
    };
    const { onRecheck } = renderState({ onGetTestFunds: vi.fn().mockResolvedValue(grant) });

    await user.click(screen.getByRole("button", { name: "Get free test funds" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The faucet treasury is empty.");
    expect(onRecheck).not.toHaveBeenCalled();
  });

  it("keeps live mode on the manual add-funds path — no faucet offer", () => {
    renderState({ mode: "live", onGetTestFunds: undefined });
    expect(screen.queryByText("Get free test funds")).toBeNull();
    expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
  });
});
