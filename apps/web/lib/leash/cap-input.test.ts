import { describe, expect, it } from "vitest";

import { InvalidCapInputError, parseCapMutation } from "./cap-input";

const agentId = "11111111-1111-4111-8111-111111111111";

describe("Agent cap mutation input", () => {
  it.each([
    ["10", "1000"],
    ["10.5", "1050"],
    ["0.01", "1"],
    ["999999999999999999.99", "99999999999999999999"],
  ])("parses %s USD into exact integer cents", (amount, amountUsdCents) => {
    expect(parseCapMutation({ agentId, amount, frequency: "daily" })).toEqual({
      agentId,
      amountUsdCents,
      frequency: "daily",
    });
  });

  it.each([
    "daily",
    "weekly",
    "monthly",
    "never",
  ] as const)("accepts the canonical %s frequency", (frequency) => {
    expect(parseCapMutation({ agentId, amount: "1.00", frequency }).frequency).toBe(frequency);
  });

  it.each([
    {},
    { agentId, amount: "1", frequency: "custom" },
    { agentId, amount: "0", frequency: "daily" },
    { agentId, amount: "-1", frequency: "daily" },
    { agentId, amount: "1.001", frequency: "daily" },
    { agentId, amount: "1e2", frequency: "daily" },
    { agentId, amount: "1", extra: true, frequency: "daily" },
    { agentId: "not-a-uuid", amount: "1", frequency: "daily" },
    { agentId, amount: "1000000000000000000", frequency: "daily" },
  ])("rejects malformed or out-of-range input %#", (value) => {
    expect(() => parseCapMutation(value)).toThrow(InvalidCapInputError);
  });
});
