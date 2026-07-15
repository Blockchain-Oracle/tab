import { timingSafeEqual } from "node:crypto";

export function cronAuthorizationIsValid(authorization: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorization, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
