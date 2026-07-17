import { describe, expect, it } from "vitest";

import { canonicalResourceIdentity } from "./resource-identity";

describe("canonical notification resource identity", () => {
  it("uses one tagged host identity across HTTP schemes and paths", () => {
    const first = canonicalResourceIdentity("https://api.vendor.test/pay", "api.vendor.test");
    const second = canonicalResourceIdentity("http://api.vendor.test/export", "api.vendor.test");

    expect(first).toEqual({
      resourceIdentityKind: "http_host",
      resourceKey: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(second.resourceKey).toBe(first.resourceKey);
  });

  it("uses the canonical MCP URL so tools sharing a host remain distinct", () => {
    const search = canonicalResourceIdentity("mcp://tool/search", "tool");
    const exportTool = canonicalResourceIdentity("mcp://tool/export", "tool");

    expect(search.resourceIdentityKind).toBe("mcp_resource");
    expect(exportTool.resourceKey).not.toBe(search.resourceKey);
  });

  it.each([
    ["credentials", "mcp://user:pass@tool/search", "tool"],
    ["query", "mcp://tool/search?secret=value", "tool"],
    ["host mismatch", "mcp://tool/search", "other"],
    ["unsupported protocol", "ftp://tool/search", "tool"],
  ])("rejects a non-canonical %s input", (_label, resourceUrl, resourceHost) => {
    expect(() => canonicalResourceIdentity(resourceUrl, resourceHost)).toThrow(
      /resource identity/i,
    );
  });
});
