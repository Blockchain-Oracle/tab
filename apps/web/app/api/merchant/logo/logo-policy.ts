export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function logoUploadRequestIsAllowed(pathname: string, merchantId: string) {
  return pathname === `merchant-logos/${merchantId}/logo`;
}

export function completedLogoIsAllowed(
  blob: { contentType: string; etag: string; pathname: string; size?: number },
  merchantId: string,
  expectedEtag: string,
) {
  return (
    uuid.test(merchantId) &&
    blob.etag === expectedEtag &&
    blob.pathname === `merchant-logos/${merchantId}/logo` &&
    LOGO_CONTENT_TYPES.includes(blob.contentType as (typeof LOGO_CONTENT_TYPES)[number]) &&
    (blob.size === undefined || blob.size <= MAX_LOGO_BYTES)
  );
}
