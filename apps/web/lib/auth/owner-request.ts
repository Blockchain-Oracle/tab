import "server-only";

import type { NextRequest } from "next/server";

import { getServerDatabase } from "../db/server";
import {
  InactiveOwnerSessionError,
  InvalidOwnerSessionError,
  loadOwnerSession,
} from "./owner-session";
import { SESSION_COOKIE_NAME } from "./session";

export async function authenticateOwnerRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;

  try {
    return await loadOwnerSession(getServerDatabase().db, token);
  } catch (error) {
    if (error instanceof InvalidOwnerSessionError || error instanceof InactiveOwnerSessionError) {
      return undefined;
    }
    throw error;
  }
}
