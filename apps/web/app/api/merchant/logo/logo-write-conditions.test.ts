import { BlobNotFoundError } from "@vercel/blob";
import { describe, expect, it, vi } from "vitest";

import { LOGO_UPLOAD_TOKEN_TTL_MS, logoWriteConditions } from "./logo-write-conditions";

describe("logo conditional-write token policy", () => {
  it("binds an existing logo token to the current ETag", async () => {
    const readCurrent = vi.fn(async () => ({ etag: "current-etag" }));

    await expect(
      logoWriteConditions("merchant-logos/id/logo", "token", 1_000, readCurrent),
    ).resolves.toEqual({
      allowOverwrite: true,
      ifMatch: "current-etag",
      validUntil: 1_000 + LOGO_UPLOAD_TOKEN_TTL_MS,
    });
  });

  it("allows one create when the deterministic object does not exist", async () => {
    const readCurrent = vi.fn(async () => {
      throw new BlobNotFoundError();
    });

    await expect(
      logoWriteConditions("merchant-logos/id/logo", "token", 1_000, readCurrent),
    ).resolves.toEqual({
      allowOverwrite: false,
      validUntil: 1_000 + LOGO_UPLOAD_TOKEN_TTL_MS,
    });
  });

  it("does not disguise storage outages as a missing object", async () => {
    const storageFailure = new Error("storage unavailable");
    const readCurrent = vi.fn(async () => {
      throw storageFailure;
    });

    await expect(
      logoWriteConditions("merchant-logos/id/logo", "token", 1_000, readCurrent),
    ).rejects.toBe(storageFailure);
  });
});
