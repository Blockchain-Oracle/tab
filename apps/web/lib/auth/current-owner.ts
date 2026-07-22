import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerDatabase } from "../db/server";
import {
  InactiveOwnerSessionError,
  InvalidOwnerSessionError,
  loadOwnerSession,
} from "./owner-session";
import { SESSION_COOKIE_NAME } from "./session";

export async function getCurrentOwner() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
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

export async function requireCurrentOwner() {
  const owner = await getCurrentOwner();
  if (owner) return owner;
  // A token with the wrong scope means a signed-in user landed on the other
  // surface — re-scope silently instead of dumping them at a login screen.
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  redirect(token ? "/api/workspace/enter?scope=owner" : "/agents/login");
}
