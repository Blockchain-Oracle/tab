import { describe, expect, it } from "vitest";

import { parseWebhookEndpointUrl } from "./endpoint-url";

describe("webhook endpoint URL policy", () => {
  it("accepts a normalized public HTTPS endpoint", () => {
    expect(parseWebhookEndpointUrl("https://merchant.example.com/hooks/tab?source=checkout")).toBe(
      "https://merchant.example.com/hooks/tab?source=checkout",
    );
  });

  it("requires an explicit process-controlled seam for local HTTP integration", () => {
    expect(() => parseWebhookEndpointUrl("http://127.0.0.1:3000/hooks/tab", "test")).toThrow();
    expect(
      parseWebhookEndpointUrl("http://127.0.0.1:3000/hooks/tab", "test", {
        allowLocalHttp: true,
      }),
    ).toBe("http://127.0.0.1:3000/hooks/tab");
    expect(() => parseWebhookEndpointUrl("http://127.0.0.1:3000/hooks/tab", "live")).toThrow();
  });

  it.each([
    "http://merchant.example.com/hooks/tab",
    "https://localhost/hooks/tab",
    "https://localhost./hooks/tab",
    "https://127.0.0.1/hooks/tab",
    "https://[::1]/hooks/tab",
    "https://10.0.0.1/hooks/tab",
    "https://user:password@merchant.example.com/hooks/tab",
    "https://merchant.example.com/hooks/tab#secret",
    "not a url",
  ])("rejects unsafe endpoint %s", (value) => {
    expect(() => parseWebhookEndpointUrl(value)).toThrow();
  });
});
