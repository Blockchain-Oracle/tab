import type { NextRequest } from "next/server";

import { getServerDatabase } from "../db/server";
import { SESSION_COOKIE_NAME } from "./session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "./session-principal";

export async function authenticateMerchantRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;

  try {
    return await loadMerchantSession(getServerDatabase().db, token);
  } catch (error) {
    if (
      error instanceof InvalidMerchantSessionError ||
      error instanceof InactiveMerchantSessionError
    ) {
      return undefined;
    }
    throw error;
  }
}
