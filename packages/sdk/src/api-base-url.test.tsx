import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeApiBaseUrl } from "./api-base-url";
import { PayButtonCore } from "./PayButton";
import { baseServices } from "./paybutton-test-fixtures";

describe("PayButton apiBaseUrl boundary", () => {
  it.each([
    "https://user:password@tab.example.test",
    "https://tab.example.test/private",
    "https://tab.example.test?tenant=other",
    "https://tab.example.test#fragment",
    "http://tab.example.test",
    "http://127.attacker.example",
    "http://127.0.0.1.attacker.example",
  ])("rejects %s", (apiBaseUrl) => {
    expect(() => normalizeApiBaseUrl(apiBaseUrl)).toThrowError(
      expect.objectContaining({ code: "INVALID_API_BASE_URL" }),
    );
  });

  it.each([
    ["https://tab.example.test/", "https://tab.example.test"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["http://127.0.0.2:3000", "http://127.0.0.2:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
  ])("normalizes the safe API root %s", (apiBaseUrl, expected) => {
    expect(normalizeApiBaseUrl(apiBaseUrl)).toBe(expected);
  });

  it("fails bootstrap before any checkout or identity service can run", async () => {
    const services = baseServices();

    render(
      <PayButtonCore
        apiBaseUrl="https://user:password@tab.example.test/private?leak=1#fragment"
        intentUrl="https://merchant.example.test/api/payment-intent"
        onSuccess={vi.fn()}
        publishableKey="pk_test_browser_key"
        services={services}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t connect");
    expect(services.loadCheckoutContext).not.toHaveBeenCalled();
    expect(services.loadMerchantIntent).not.toHaveBeenCalled();
    expect(services.restoreBuyer).not.toHaveBeenCalled();
    expect(services.startBuyerAuth).not.toHaveBeenCalled();
    expect(services.reportPayment).not.toHaveBeenCalled();
  });
});
