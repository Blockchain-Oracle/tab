import { describe, expect, it } from "vitest";

import { AuthAttemptGate } from "./auth-attempt";

describe("auth attempt lifecycle", () => {
  it("makes overlapping prechecks last-request-wins", () => {
    const gate = new AuthAttemptGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("invalidates a pending precheck when the auth surface unmounts", () => {
    const gate = new AuthAttemptGate();
    const attempt = gate.begin();

    gate.cancel();

    expect(attempt.signal.aborted).toBe(true);
    expect(attempt.isCurrent()).toBe(false);
  });
});
