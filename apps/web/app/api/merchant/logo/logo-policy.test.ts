import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { completedLogoIsAllowed, logoUploadRequestIsAllowed, MAX_LOGO_BYTES } from "./logo-policy";

describe("merchant logo policy", () => {
  it("authorizes only the signed tenant's canonical upload path", () => {
    const merchantId = randomUUID();
    const otherMerchantId = randomUUID();

    expect(logoUploadRequestIsAllowed(`merchant-logos/${merchantId}/logo`, merchantId)).toBe(true);
    expect(logoUploadRequestIsAllowed(`merchant-logos/${merchantId}/logo.svg`, merchantId)).toBe(
      false,
    );
    expect(
      logoUploadRequestIsAllowed(`merchant-logos/${otherMerchantId}/logo.png`, merchantId),
    ).toBe(false);
  });

  it("accepts only tenant-owned JPG or PNG blobs within the size limit", () => {
    const merchantId = randomUUID();
    const valid = {
      contentType: "image/png",
      etag: "uploaded-etag",
      pathname: `merchant-logos/${merchantId}/logo`,
      size: MAX_LOGO_BYTES,
    };

    expect(completedLogoIsAllowed(valid, merchantId, "uploaded-etag")).toBe(true);
    expect(completedLogoIsAllowed(valid, merchantId, "different-etag")).toBe(false);
    expect(
      completedLogoIsAllowed({ ...valid, contentType: "image/svg+xml" }, merchantId, valid.etag),
    ).toBe(false);
    expect(
      completedLogoIsAllowed({ ...valid, size: MAX_LOGO_BYTES + 1 }, merchantId, valid.etag),
    ).toBe(false);
    expect(
      completedLogoIsAllowed(
        { ...valid, pathname: `merchant-logos/${randomUUID()}/logo` },
        merchantId,
        valid.etag,
      ),
    ).toBe(false);
  });
});
