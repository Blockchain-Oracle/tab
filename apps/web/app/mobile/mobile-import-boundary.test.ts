import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const restricted = /(?:magic-sdk|@magic-sdk|@particle-network|@x402|\bviem\b|wallet|signer)/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(?:ts|tsx)$/.test(entry) || entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      return [];
    }
    return [path];
  });
}

describe("mobile security boundary", () => {
  it("imports no wallet, signing, Particle, Magic, viem, or x402 capability", () => {
    const imports = sourceFiles(import.meta.dirname)
      .flatMap((path) => readFileSync(path, "utf8").match(/^import .*$/gm) ?? [])
      .join("\n");

    expect(imports).not.toMatch(restricted);
  });
});
