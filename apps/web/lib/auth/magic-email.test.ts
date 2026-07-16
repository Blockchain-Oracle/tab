import { describe, expect, it } from "vitest";

import { magicEmailMatchesRequest } from "./magic-email";

describe("Magic email binding", () => {
  it("accepts the verified Magic identity for the requested email", () => {
    expect(magicEmailMatchesRequest("merchant@example.com", " Merchant@Example.com ")).toBe(true);
  });

  it("rejects a persisted Magic identity belonging to another email", () => {
    expect(magicEmailMatchesRequest("owner@example.com", "merchant@example.com")).toBe(false);
  });
});
