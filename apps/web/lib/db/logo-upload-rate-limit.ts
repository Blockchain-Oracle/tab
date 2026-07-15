import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "./client";
import { merchants } from "./schema";

export const LOGO_UPLOAD_GRANT_LIMIT = 10;
export const LOGO_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export async function consumeLogoUploadGrant(db: Database, merchantId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - LOGO_UPLOAD_WINDOW_MS);
  const windowExpired = or(
    isNull(merchants.logoUploadWindowStartedAt),
    lt(merchants.logoUploadWindowStartedAt, cutoff),
  );

  const [updated] = await db
    .update(merchants)
    .set({
      logoUploadCount: sql`case
        when ${windowExpired} then 1
        else ${merchants.logoUploadCount} + 1
      end`,
      logoUploadWindowStartedAt: sql`case
        when ${windowExpired} then ${sql.param(now, merchants.logoUploadWindowStartedAt)}
        else ${merchants.logoUploadWindowStartedAt}
      end`,
    })
    .where(
      and(
        eq(merchants.id, merchantId),
        or(windowExpired, lt(merchants.logoUploadCount, LOGO_UPLOAD_GRANT_LIMIT)),
      ),
    )
    .returning({ id: merchants.id });

  return Boolean(updated);
}
