type MagicSessionUser = {
  getIdToken(): PromiseLike<string | null>;
  isLoggedIn(): PromiseLike<boolean>;
};

type MagicIdentityUser = MagicSessionUser & {
  getInfo(): PromiseLike<{ email?: string | null }>;
};

export async function getPersistedMagicDidToken(user: MagicSessionUser) {
  if (!(await user.isLoggedIn())) return undefined;

  const didToken = await user.getIdToken();
  if (!didToken) throw new Error("Magic did not return a DID token");
  return didToken;
}

/**
 * Persisted Magic identity for silent resume: token + the email Magic knows,
 * so a returning user re-enters without typing anything. Returns undefined
 * when no persisted login exists or the email is unavailable.
 */
export async function getPersistedMagicIdentity(user: MagicIdentityUser) {
  const didToken = await getPersistedMagicDidToken(user);
  if (!didToken) return undefined;

  const info = await user.getInfo();
  const email = info.email?.trim().toLowerCase();
  if (!email) return undefined;

  return { didToken, email };
}
