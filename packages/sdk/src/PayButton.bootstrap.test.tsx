import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PayButtonCore } from "./PayButton";
import { baseServices } from "./paybutton-test-fixtures";

describe("PayButton bootstrap failures", () => {
  it("renders accessible network copy and retries the real bootstrap", async () => {
    const user = userEvent.setup();
    const loadCheckoutContext = vi.fn().mockRejectedValue(new TypeError("offline"));
    const services = baseServices();
    services.loadCheckoutContext = loadCheckoutContext;

    render(
      <PayButtonCore
        apiBaseUrl="https://tab.example.test"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={vi.fn()}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t connect");
    expect(screen.getByRole("alert")).toHaveTextContent("You have not been charged");
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(loadCheckoutContext).toHaveBeenCalledTimes(2));
  });
});
