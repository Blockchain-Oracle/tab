type MagicSessionUser = {
  getIdToken(): PromiseLike<string | null>;
  isLoggedIn(): PromiseLike<boolean>;
};

export async function getPersistedMagicDidToken(user: MagicSessionUser) {
  if (!(await user.isLoggedIn())) return undefined;

  const didToken = await user.getIdToken();
  if (!didToken) throw new Error("Magic did not return a DID token");
  return didToken;
}
