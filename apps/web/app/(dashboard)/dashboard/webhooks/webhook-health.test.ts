import { describe, expect, it } from "vitest";

import { webhookHealthView } from "./webhook-health";

describe("webhook health presentation", () => {
  it.each([
    ["listening", { className: "listening", label: "Listening" }],
    ["failing", { className: "failing", label: "Failing" }],
    ["awaiting", { className: "awaiting", label: "Awaiting a successful delivery" }],
  ] as const)("renders %s honestly", (health, expected) => {
    expect(webhookHealthView(health)).toEqual(expected);
  });
});
