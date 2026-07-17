import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InvalidNotificationInputError,
  parseNotificationMutation,
  parseNotificationQuery,
} from "./notification-input";

describe("notification request parsing", () => {
  it("parses strict list filters with explicit defaults", () => {
    const agentId = randomUUID();
    const cursorId = randomUUID();
    const cursorTime = "2026-07-17T10:00:00.000Z";
    const cursor = Buffer.from(JSON.stringify({ createdAt: cursorTime, id: cursorId })).toString(
      "base64url",
    );

    expect(
      parseNotificationQuery(
        new URLSearchParams({
          agentId,
          cursor,
          limit: "25",
          read: "unread",
          resolution: "active",
          tier: "3",
          type: "cap_blocked",
        }),
      ),
    ).toEqual({
      agentId,
      cursor: { createdAt: new Date(cursorTime), id: cursorId },
      limit: 25,
      read: "unread",
      resolution: "active",
      tier: "3",
      type: "cap_blocked",
    });
    expect(parseNotificationQuery(new URLSearchParams({ agentId }))).toEqual({
      agentId,
      cursor: undefined,
      limit: 50,
      read: "all",
      resolution: "all",
      tier: undefined,
      type: undefined,
    });
  });

  it.each([
    new URLSearchParams(),
    new URLSearchParams({ agentId: "not-a-uuid" }),
    new URLSearchParams({ agentId: randomUUID(), tier: "1" }),
    new URLSearchParams({ agentId: randomUUID(), read: "yes" }),
    new URLSearchParams({ agentId: randomUUID(), resolution: "pending" }),
    new URLSearchParams({ agentId: randomUUID(), type: "settled" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "0" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "101" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "1.5" }),
    new URLSearchParams({ agentId: randomUUID(), cursor: "not-a-cursor" }),
    new URLSearchParams({ agentId: randomUUID(), cursor: "a".repeat(257) }),
    new URLSearchParams({ agentId: randomUUID(), surprise: "true" }),
    new URLSearchParams(`agentId=${randomUUID()}&tier=2&tier=3`),
  ])("rejects malformed or ambiguous list input", (query) => {
    expect(() => parseNotificationQuery(query)).toThrow(InvalidNotificationInputError);
  });

  it("accepts only exact mark-one and read-all mutation shapes", () => {
    const agentId = randomUUID();
    const notificationId = randomUUID();

    expect(parseNotificationMutation({ action: "read_one", agentId, notificationId })).toEqual({
      action: "read_one",
      agentId,
      notificationId,
    });
    expect(parseNotificationMutation({ action: "read_all", agentId })).toEqual({
      action: "read_all",
      agentId,
    });
  });

  it.each([
    undefined,
    { action: "read_one", agentId: randomUUID() },
    { action: "read_one", agentId: randomUUID(), notificationId: "bad" },
    { action: "read_all", agentId: randomUUID(), notificationId: randomUUID() },
    { action: "delete", agentId: randomUUID() },
    { action: "read_all", agentId: randomUUID(), extra: true },
  ])("rejects malformed mutation input", (input) => {
    expect(() => parseNotificationMutation(input)).toThrow(InvalidNotificationInputError);
  });
});
