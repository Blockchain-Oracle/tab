import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BUYER_COPY, buyerErrorCopy } from "./copy";

const BANNED_BUYER_WORDS =
  /\b(chain|gas|bridge|arbitrum|eoa|token|sign(?:ed|ing)?)\b|wallet address/i;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(strings);
}

describe("buyer copy", () => {
  it("contains no banned implementation vocabulary", () => {
    for (const copy of strings(BUYER_COPY)) {
      expect(copy).not.toMatch(BANNED_BUYER_WORDS);
    }
  });

  it("keeps banned implementation vocabulary out of every buyer UI source", () => {
    const sourceRoot = `${process.cwd()}/src/`;
    const stateRoot = `${sourceRoot}states`;
    const files = ["PayButton.tsx", "CheckoutShell.tsx"].map((name) => `${sourceRoot}${name}`);
    files.push(
      ...readdirSync(stateRoot)
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => `${stateRoot}/${name}`),
    );
    for (const file of files) expect(readFileSync(file, "utf8")).not.toMatch(BANNED_BUYER_WORDS);
  });

  it("only promises no charge for a failure known to be pre-broadcast", () => {
    expect(buyerErrorCopy({ kind: "execution-blocked", broadcastStarted: false }).body).toContain(
      "not been charged",
    );
    expect(buyerErrorCopy({ kind: "payment-failed", broadcastStarted: true }).body).not.toContain(
      "not been charged",
    );
  });
});
