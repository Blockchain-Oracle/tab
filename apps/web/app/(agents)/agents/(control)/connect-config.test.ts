import { describe, expect, it } from "vitest";

import { parseLeashCliConfig } from "../../../../../agent/src/cli-config.js";
import {
  buildTabMcpConfiguration,
  LEASH_KEY_PLACEHOLDER,
  resolveTabApiOrigin,
} from "./connect-config";

const realKey = `agent_sk_${"a".repeat(43)}`;

function parseRenderedConfiguration(configuration: ReturnType<typeof buildTabMcpConfiguration>) {
  const rendered = configuration.mcpServers.tab;
  // npx consumes ["-y", "@runtab/mcp"]; the CLI parser sees what follows.
  expect(rendered.command).toBe("npx");
  expect(rendered.args.slice(0, 2)).toEqual(["-y", "@runtab/mcp"]);
  return parseLeashCliConfig(rendered.args.slice(2), {
    ...rendered.env,
    TAB_AGENT_KEY:
      rendered.env.TAB_AGENT_KEY === LEASH_KEY_PLACEHOLDER ? realKey : rendered.env.TAB_AGENT_KEY,
  });
}

describe("Connect MCP configuration", () => {
  it("renders both required environment keys for the real standalone CLI mode", () => {
    const configuration = buildTabMcpConfiguration("https://tab.example.test");

    expect(configuration.mcpServers.tab).toEqual({
      args: ["-y", "@runtab/mcp"],
      command: "npx",
      env: {
        TAB_AGENT_KEY: LEASH_KEY_PLACEHOLDER,
        // Self-hosted origin differs from the default, so it is spelled out.
        TAB_API_BASE_URL: "https://tab.example.test",
      },
    });
    expect(parseRenderedConfiguration(configuration)).toEqual({
      allowDevelopmentLoopback: false,
      apiBaseUrl: "https://tab.example.test/",
      apiKey: realKey,
      upstreamUrl: null,
    });
  });

  it("renders the real proxy arguments accepted by the CLI parser", () => {
    const configuration = buildTabMcpConfiguration(
      "https://tab.example.test",
      "https://existing-mcp.example.test/rpc",
    );

    expect(configuration.mcpServers.tab.args).toEqual([
      "-y",
      "@runtab/mcp",
      "--upstream",
      "https://existing-mcp.example.test/rpc",
    ]);
    expect(parseRenderedConfiguration(configuration)).toMatchObject({
      upstreamUrl: "https://existing-mcp.example.test/rpc",
    });
  });

  it("canonicalizes the configured deployment origin and blocks absent or unsafe values", () => {
    expect(resolveTabApiOrigin("https://tab.example.test/")).toEqual({
      apiBaseUrl: "https://tab.example.test",
      issue: null,
    });
    expect(resolveTabApiOrigin(undefined)).toMatchObject({ apiBaseUrl: null });
    expect(resolveTabApiOrigin("https://tab.example.test/path")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveTabApiOrigin("https://user:secret@tab.example.test")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveTabApiOrigin("http://tab.example.test")).toMatchObject({
      apiBaseUrl: null,
    });
    expect(resolveTabApiOrigin("http://localhost:3000")).toEqual({
      apiBaseUrl: "http://localhost:3000",
      issue: null,
    });
    expect(resolveTabApiOrigin("http://127.0.0.1:3000")).toEqual({
      apiBaseUrl: "http://127.0.0.1:3000",
      issue: null,
    });
  });
});
