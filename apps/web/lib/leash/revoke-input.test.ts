import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InvalidRevokeInputError, parseRevokeRequest } from "./revoke-input";

describe("revocation request parsing", () => {
  it.each([
    ["pause", undefined],
    ["resume", undefined],
    ["freeze", undefined],
    ["unfreeze", undefined],
    ["cancel", "CANCEL"],
    ["nuclear", "Research agent"],
  ] as const)("accepts the exact %s action shape", (action, confirmation) => {
    const agentId = randomUUID();
    expect(
      parseRevokeRequest({
        action,
        agentId,
        ...(confirmation === undefined ? {} : { confirmation }),
      }),
    ).toEqual({ action, agentId, ...(confirmation === undefined ? {} : { confirmation }) });
  });

  it("accepts every non-empty nuclear confirmation the agent-name schema can store", () => {
    const agentId = randomUUID();
    const confirmation = ` ${"a".repeat(240)} `;

    expect(parseRevokeRequest({ action: "nuclear", agentId, confirmation })).toEqual({
      action: "nuclear",
      agentId,
      confirmation,
    });
  });

  it.each([
    undefined,
    {},
    { action: "pause", agentId: "bad" },
    { action: "pause", agentId: randomUUID(), confirmation: "extra" },
    { action: "cancel", agentId: randomUUID() },
    { action: "cancel", agentId: randomUUID(), confirmation: "cancel" },
    { action: "nuclear", agentId: randomUUID(), confirmation: "" },
    { action: "delete", agentId: randomUUID() },
    { action: "pause", agentId: randomUUID(), extra: true },
  ])("rejects malformed, ambiguous, or unsafe revocation input", (input) => {
    expect(() => parseRevokeRequest(input)).toThrow(InvalidRevokeInputError);
  });
});
