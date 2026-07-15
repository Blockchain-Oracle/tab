import { BlobNotFoundError, head } from "@vercel/blob";

type ReadCurrentLogo = (pathname: string, token: string) => Promise<{ etag: string }>;

export const LOGO_UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

const readCurrentLogo: ReadCurrentLogo = (pathname, token) => head(pathname, { token });

export async function logoWriteConditions(
  pathname: string,
  token: string,
  now = Date.now(),
  readCurrent: ReadCurrentLogo = readCurrentLogo,
) {
  const validUntil = now + LOGO_UPLOAD_TOKEN_TTL_MS;

  try {
    const current = await readCurrent(pathname, token);
    return { allowOverwrite: true, ifMatch: current.etag, validUntil };
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return { allowOverwrite: false, validUntil };
    }
    throw error;
  }
}
