import { describe, expect, it } from "vitest";

import { parseLeashCliConfig } from "../../../../../agent/src/cli-config.js";
import {
  buildLeashMcpConfiguration,
  LEASH_KEY_PLACEHOLDER,
  resolveLeashApiOrigin,
} from "./connect-config";

const realKey = `leash_sk_${"a".repeat(43)}`;

function parseRenderedConfiguration(configuration: ReturnType<typeof buildLeashMcpConfiguration>) {
  const rendered = configuration.mcpServers.leash;
  return parseLeashCliConfig(rendered.args ?? [], {
    ...rendered.env,
    LEASH_API_KEY:
      rendered.env.LEASH_API_KEY === LEASH_KEY_PLACEHOLDER ? realKey : rendered.env.LEASH_API_KEY,
  });
}

describe("Connect MCP configuration", () => {
  it("renders both required environment keys for the real standalone CLI mode", () => {
    const configuration = buildLeashMcpConfiguration("https://tab.example.test");

    expect(configuration.mcpServers.leash).toEqual({
      command: "leash-mcp",
      env: {
        LEASH_API_BASE_URL: "https://tab.example.test",
        LEASH_API_KEY: LEASH_KEY_PLACEHOLDER,
      },
    });
    expect(parseRenderedConfiguration(configuration)).toEqual({
      apiBaseUrl: "https://tab.example.test/",
      apiKey: realKey,
      upstreamUrl: null,
    });
  });

  it("renders the real proxy arguments accepted by the CLI parser", () => {
    const configuration = buildLeashMcpConfiguration(
      "https://tab.example.test",
      "https://existing-mcp.example.test/rpc",
    );

    expect(configuration.mcpServers.leash.args).toEqual([
      "--upstream",
      "https://existing-mcp.example.test/rpc",
    ]);
    expect(parseRenderedConfiguration(configuration)).toMatchObject({
      upstreamUrl: "https://existing-mcp.example.test/rpc",
    });
  });

  it("canonicalizes the configured deployment origin and blocks absent or unsafe values", () => {
    expect(resolveLeashApiOrigin("https://tab.example.test/")).toEqual({
      apiBaseUrl: "https://tab.example.test",
      issue: null,
    });
    expect(resolveLeashApiOrigin(undefined)).toMatchObject({ apiBaseUrl: null });
    expect(resolveLeashApiOrigin("https://tab.example.test/path")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveLeashApiOrigin("https://user:secret@tab.example.test")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveLeashApiOrigin("http://tab.example.test")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveLeashApiOrigin("http://localhost:3000")).toEqual({
      apiBaseUrl: "http://localhost:3000",
      issue: null,
    });
    expect(resolveLeashApiOrigin("http://127.0.0.1:3000")).toEqual({
      apiBaseUrl: "http://127.0.0.1:3000",
      issue: null,
    });
  });
});
