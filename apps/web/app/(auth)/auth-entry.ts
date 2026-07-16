type AuthEntryOptions = {
  isCurrent: () => boolean;
  onAuthenticated: (redirectTo: string) => void;
  onChallenge: () => void;
  onPrecheckRejected: (error: unknown) => void;
  precheck: () => Promise<void>;
  readDidToken: () => Promise<string | undefined>;
  verifyDidToken: (didToken: string) => Promise<string>;
};

export async function runAuthEntry(options: AuthEntryOptions) {
  try {
    await options.precheck();
  } catch (error) {
    if (options.isCurrent()) options.onPrecheckRejected(error);
    return;
  }
  if (!options.isCurrent()) return;

  const didToken = await options.readDidToken();
  if (!options.isCurrent()) return;
  if (!didToken) {
    options.onChallenge();
    return;
  }

  const redirectTo = await options.verifyDidToken(didToken);
  if (options.isCurrent()) options.onAuthenticated(redirectTo);
}
