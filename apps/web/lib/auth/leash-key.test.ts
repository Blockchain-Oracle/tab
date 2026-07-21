import { describe, expect, it } from "vitest";

import {
  generateLeashKey,
  hashLeashKey,
  InvalidLeashKeyError,
  readBearerLeashKey,
} from "./leash-key";

describe("agent key material", () => {
  it("generates 256-bit show-once material and hash-at-rest metadata", () => {
    const first = generateLeashKey();
    const second = generateLeashKey();

    expect(first.secret).toMatch(/^agent_sk_[A-Za-z0-9_-]{43}$/);
    expect(first).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      last4: first.secret.slice(-4),
      prefix: "agent_sk_",
    });
    expect(first.hash).toBe(hashLeashKey(first.secret));
    expect(second.secret).not.toBe(first.secret);
    expect(second.hash).not.toBe(first.hash);
  });

  it("accepts only an exact bearer credential and returns generic failures", () => {
    const generated = generateLeashKey();
    expect(readBearerLeashKey(`Bearer ${generated.secret}`)).toBe(generated.secret);
    expect(readBearerLeashKey(`bearer ${generated.secret}`)).toBe(generated.secret);

    for (const header of [
      null,
      generated.secret,
      `Bearer  ${generated.secret}`,
      `Bearer ${generated.secret}x`,
      `Bearer ${generated.secret}\n`,
      `Bearer ${generated.secret.toUpperCase()}`,
    ]) {
      expect(() => readBearerLeashKey(header)).toThrow(InvalidLeashKeyError);
    }
  });
});
