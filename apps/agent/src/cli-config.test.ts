import { describe, expect, it } from "vitest";

import { CliConfigurationError, parseLeashCliConfig } from "./cli-config.js";

const validEnvironment = {
  LEASH_API_BASE_URL: "https://tab.example.test",
  LEASH_API_KEY: `leash_sk_${"a".repeat(43)}`,
};

describe("Leash MCP CLI configuration", () => {
  it("parses the required environment and one absolute HTTP upstream", () => {
    expect(
      parseLeashCliConfig(["--upstream", "https://mcp.example.test/rpc"], validEnvironment),
    ).toEqual({
      apiBaseUrl: "https://tab.example.test/",
      apiKey: validEnvironment.LEASH_API_KEY,
      upstreamUrl: "https://mcp.example.test/rpc",
    });
  });

  it("supports the standalone paid_fetch server", () => {
    expect(parseLeashCliConfig([], validEnvironment)).toEqual({
      apiBaseUrl: "https://tab.example.test/",
      apiKey: validEnvironment.LEASH_API_KEY,
      upstreamUrl: null,
    });
  });

  it.each([
    [{}, []],
    [{ ...validEnvironment, LEASH_API_KEY: "secret" }, []],
    [{ ...validEnvironment, LEASH_API_BASE_URL: "tab.example.test" }, []],
    [{ ...validEnvironment, LEASH_API_BASE_URL: "ftp://tab.example.test" }, []],
    [{ ...validEnvironment, LEASH_API_BASE_URL: "https://tab.example.test/api" }, []],
    [validEnvironment, ["--upstream"]],
    [validEnvironment, ["--upstream", "/mcp"]],
    [validEnvironment, ["--upstream", "file:///tmp/mcp"]],
    [validEnvironment, ["--unknown"]],
    [validEnvironment, ["--upstream", "https://one.test", "extra"]],
  ])("rejects malformed or ambiguous input", (environment, arguments_) => {
    expect(() => parseLeashCliConfig(arguments_, environment)).toThrow(CliConfigurationError);
  });
});
