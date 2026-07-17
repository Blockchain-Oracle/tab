import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  encodeReceiptCursor,
  InvalidReceiptInputError,
  parseReceiptId,
  parseReceiptQuery,
} from "./receipt-input";

describe("receipt request parsing", () => {
  it("parses a bounded owner feed query and an opaque precision-safe cursor", () => {
    const agentId = randomUUID();
    const cursorId = randomUUID();
    const createdAt = new Date("2026-07-17T10:00:00.123Z");
    const cursor = encodeReceiptCursor({ createdAt, id: cursorId });

    expect(parseReceiptQuery(new URLSearchParams({ agentId, cursor, limit: "25" }))).toEqual({
      agentId,
      cursor: { createdAt, id: cursorId },
      limit: 25,
    });
    expect(parseReceiptQuery(new URLSearchParams({ agentId }))).toEqual({
      agentId,
      cursor: undefined,
      limit: 50,
    });
    expect(parseReceiptId(cursorId)).toBe(cursorId);
  });

  it.each([
    new URLSearchParams(),
    new URLSearchParams({ agentId: "not-a-uuid" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "0" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "101" }),
    new URLSearchParams({ agentId: randomUUID(), limit: "1.5" }),
    new URLSearchParams({ agentId: randomUUID(), cursor: "not-a-cursor" }),
    new URLSearchParams({ agentId: randomUUID(), cursor: "a".repeat(257) }),
    new URLSearchParams({ agentId: randomUUID(), status: "settled" }),
    new URLSearchParams(`agentId=${randomUUID()}&limit=2&limit=3`),
  ])("rejects malformed or ambiguous feed input", (query) => {
    expect(() => parseReceiptQuery(query)).toThrow(InvalidReceiptInputError);
  });

  it.each([
    "",
    "bad",
    "00000000-0000-0000-0000-000000000000",
  ])("rejects an invalid receipt id", (receiptId) => {
    expect(() => parseReceiptId(receiptId)).toThrow(InvalidReceiptInputError);
  });
});
