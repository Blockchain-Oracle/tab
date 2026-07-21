import { NextResponse } from "next/server";

export const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

/** JSON response with the canonical no-store cache policy. */
export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS, status });
}

/** Canonical API error envelope: `{ error: { code, message } }` + no-store. */
export function jsonError(code: string, message: string, status: number) {
  return jsonNoStore({ error: { code, message } }, status);
}
