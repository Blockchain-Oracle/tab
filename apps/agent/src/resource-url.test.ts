import { describe, expect, it } from "vitest";

import { InvalidPaymentResourceUrlError, redactPaymentResourceUrl } from "./resource-url.js";

function credentialedResourceUrl(value: string) {
  const url = new URL(value);
  url.username = "wire-user";
  url.password = "wire-pass";
  url.searchParams.set("token", "secret");
  url.hash = "fragment";
  return url.toString();
}

describe("payment resource URL redaction", () => {
  it("keeps the canonical HTTP path and meaningful port but removes secrets", () => {
    expect(
      redactPaymentResourceUrl(
        credentialedResourceUrl("https://PAYMENTS.EXAMPLE.TEST:8443/tool/pay"),
      ),
    ).toBe("https://payments.example.test:8443/tool/pay");
  });

  it("canonicalizes an MCP resource identifier without leaking its secrets", () => {
    expect(
      redactPaymentResourceUrl(credentialedResourceUrl("mcp://TOOL.EXAMPLE.TEST:8443/tool/pay")),
    ).toBe("mcp://tool.example.test:8443/tool/pay");
  });

  it.each([
    "",
    "/relative",
    "not a URL",
    "ftp://tool/pay",
    "file:///tmp/payment",
  ])("rejects unsupported or non-absolute resource provenance: %s", (value) => {
    expect(() => redactPaymentResourceUrl(value)).toThrow(InvalidPaymentResourceUrlError);
  });

  it.each([
    ["host", `https://${"a".repeat(254)}/pay`],
    ["URL", `https://tool.example/${"a".repeat(2_048)}`],
  ])("rejects an overlong resource %s", (_label, value) => {
    expect(() => redactPaymentResourceUrl(value)).toThrow(InvalidPaymentResourceUrlError);
  });
});
