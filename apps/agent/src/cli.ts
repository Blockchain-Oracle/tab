#!/usr/bin/env node

import { LeashConnectError } from "./bootstrap.js";
import { CliConfigurationError, parseLeashCliConfig } from "./cli-config.js";
import { startLeashMcp } from "./runtime.js";

function startupMessage(error: unknown) {
  if (error instanceof CliConfigurationError || error instanceof LeashConnectError) {
    return error.message;
  }
  return "Leash MCP could not start.";
}

async function main() {
  const config = parseLeashCliConfig(process.argv.slice(2), process.env);
  const runtime = await startLeashMcp({ config });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void runtime.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.stdin.once("end", close);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`leash-mcp: ${startupMessage(error)}\n`);
  process.exitCode = 1;
}
