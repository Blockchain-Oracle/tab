import { describe, expect, it } from "vitest";

import {
  createUniversalAccountClient,
  InvalidUniversalAccountError,
  readAccountSnapshot,
} from "./ua";

describe("Particle Universal Account server adapter", () => {
  it("exports the verified V2 read helpers for first-party server surfaces", () => {
    expect(createUniversalAccountClient).toBeTypeOf("function");
    expect(readAccountSnapshot).toBeTypeOf("function");
    expect(InvalidUniversalAccountError).toBeTypeOf("function");
  });
});
