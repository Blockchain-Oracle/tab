import { describe, expect, it } from "vitest";

import type { Database } from "../db/client";
import { formatShareAmount, readShareableReceipt } from "./share-card";

describe("shareable receipt read", () => {
  it("rejects malformed ids before touching the database", async () => {
    const db = new Proxy(
      {},
      {
        get() {
          throw new Error("database must not be queried for malformed ids");
        },
      },
    ) as Database;
    for (const bad of ["", "abc", "../../etc/passwd", "1; drop table receipts"]) {
      expect(await readShareableReceipt(db, bad)).toBeNull();
    }
  });

  it("formats amounts as currency without inventing precision", () => {
    expect(formatShareAmount("1.000000")).toBe("$1.00");
    expect(formatShareAmount("0.100000")).toBe("$0.10");
    expect(formatShareAmount("not-a-number")).toBe("$not-a-number");
  });
});
