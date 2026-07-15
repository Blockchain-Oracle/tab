import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerDatabase } from "../db/server";
import { SESSION_COOKIE_NAME } from "./session";
import {
  InactiveMerchantSessionError,
  InvalidMerchantSessionError,
  loadMerchantSession,
} from "./session-principal";

export async function getCurrentMerchant() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
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

export async function requireCurrentMerchant() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/login");
  return merchant;
}
