import { describe, expect, it } from "vitest";

import { CliConfigurationError, parseLeashCliConfig } from "./cli-config.js";

const validEnvironment = {
  TAB_API_BASE_URL: "https://tab.example.test",
  TAB_AGENT_KEY: `agent_sk_${"a".repeat(43)}`,
};

describe("Tab MCP CLI configuration", () => {
  it("parses the required environment and one absolute HTTP upstream", () => {
    expect(
      parseLeashCliConfig(["--upstream", "https://mcp.example.test/rpc"], validEnvironment),
    ).toEqual({
      allowDevelopmentLoopback: false,
      apiBaseUrl: "https://tab.example.test/",
      apiKey: validEnvironment.TAB_AGENT_KEY,
      upstreamUrl: "https://mcp.example.test/rpc",
    });
  });

  it("supports the standalone paid_fetch server", () => {
    expect(parseLeashCliConfig([], validEnvironment)).toEqual({
      allowDevelopmentLoopback: false,
      apiBaseUrl: "https://tab.example.test/",
      apiKey: validEnvironment.TAB_AGENT_KEY,
      upstreamUrl: null,
    });
  });

  it("requires an exact explicit development flag before accepting a loopback upstream", () => {
    expect(() =>
      parseLeashCliConfig(["--upstream", "http://127.0.0.1:8787/mcp"], validEnvironment),
    ).toThrow(CliConfigurationError);
    expect(
      parseLeashCliConfig(["--upstream", "http://127.0.0.1:8787/mcp"], {
        ...validEnvironment,
        TAB_ALLOW_DEVELOPMENT_LOOPBACK: "1",
      }),
    ).toMatchObject({
      allowDevelopmentLoopback: true,
      upstreamUrl: "http://127.0.0.1:8787/mcp",
    });
    expect(() =>
      parseLeashCliConfig([], {
        ...validEnvironment,
        TAB_ALLOW_DEVELOPMENT_LOOPBACK: "true",
      }),
    ).toThrow(CliConfigurationError);
  });

  it("rejects plaintext or private remote MCP upstreams", () => {
    for (const upstream of [
      "http://seller.example/mcp",
      "https://10.0.0.2/mcp",
      "https://metadata.google.internal/mcp",
    ]) {
      expect(() => parseLeashCliConfig(["--upstream", upstream], validEnvironment)).toThrow(
        "--upstream must use HTTPS, except for loopback development.",
      );
    }
  });

  it("allows cleartext control-plane traffic only on loopback development origins", () => {
    expect(
      parseLeashCliConfig([], { ...validEnvironment, TAB_API_BASE_URL: "http://127.0.0.1:8787" }),
    ).toMatchObject({ apiBaseUrl: "http://127.0.0.1:8787/" });
    expect(() =>
      parseLeashCliConfig([], {
        ...validEnvironment,
        TAB_API_BASE_URL: "http://tab.example.test",
      }),
    ).toThrow(CliConfigurationError);
  });

  it.each([
    [{}, []],
    [{ ...validEnvironment, TAB_AGENT_KEY: "secret" }, []],
    [{ ...validEnvironment, TAB_API_BASE_URL: "tab.example.test" }, []],
    [{ ...validEnvironment, TAB_API_BASE_URL: "ftp://tab.example.test" }, []],
    [{ ...validEnvironment, TAB_API_BASE_URL: "https://tab.example.test/api" }, []],
    [validEnvironment, ["--upstream"]],
    [validEnvironment, ["--upstream", "/mcp"]],
    [validEnvironment, ["--upstream", "file:///tmp/mcp"]],
    [validEnvironment, ["--unknown"]],
    [validEnvironment, ["--upstream", "https://one.test", "extra"]],
  ])("rejects malformed or ambiguous input", (environment, arguments_) => {
    expect(() => parseLeashCliConfig(arguments_, environment)).toThrow(CliConfigurationError);
  });
});
