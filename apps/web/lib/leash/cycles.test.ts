import { describe, expect, it } from "vitest";

import { deriveCycleWindow } from "./cycles";

describe("UTC cap-cycle boundaries", () => {
  it("rolls daily at the exact anchored boundary", () => {
    expect(
      deriveCycleWindow(
        new Date("2026-07-01T00:00:00.000Z"),
        "daily",
        new Date("2026-07-03T00:00:00.000Z"),
      ),
    ).toEqual({
      nextResetAt: new Date("2026-07-04T00:00:00.000Z"),
      startedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
  });

  it("advances across missed weekly periods without moving the anchor", () => {
    expect(
      deriveCycleWindow(
        new Date("2026-01-05T08:30:00.000Z"),
        "weekly",
        new Date("2026-01-27T12:00:00.000Z"),
      ),
    ).toEqual({
      nextResetAt: new Date("2026-02-02T00:00:00.000Z"),
      startedAt: new Date("2026-01-26T00:00:00.000Z"),
    });
  });

  it("keeps a month-end UTC anchor after a shorter month", () => {
    expect(
      deriveCycleWindow(
        new Date("2026-01-31T10:15:00.000Z"),
        "monthly",
        new Date("2026-03-31T10:15:00.000Z"),
      ),
    ).toEqual({
      nextResetAt: new Date("2026-04-30T00:00:00.000Z"),
      startedAt: new Date("2026-03-31T00:00:00.000Z"),
    });
  });

  it("normalizes a daily schedule to UTC midnight", () => {
    expect(
      deriveCycleWindow(
        new Date("2026-07-01T18:45:00.000Z"),
        "daily",
        new Date("2026-07-03T12:00:00.000Z"),
      ),
    ).toEqual({
      nextResetAt: new Date("2026-07-04T00:00:00.000Z"),
      startedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
  });

  it("never schedules a rollover for a manual-only cycle", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z");
    expect(deriveCycleWindow(anchor, "never", new Date("2030-01-01T00:00:00.000Z"))).toEqual({
      nextResetAt: null,
      startedAt: anchor,
    });
  });
});
