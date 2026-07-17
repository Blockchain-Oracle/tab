import { runAuthEntry } from "../../(auth)/auth-entry";
import { getPersistedMagicDidToken } from "../../(auth)/magic-session";

type MagicUser = Parameters<typeof getPersistedMagicDidToken>[0];

type LeashAuthEntryOptions = {
  isCurrent: () => boolean;
  onAuthenticated: (redirectTo: string) => void;
  onChallenge: () => void;
  onPrecheckRejected: (error: unknown) => void;
  precheck: () => Promise<void>;
  user: MagicUser;
  verifyDidToken: (didToken: string) => Promise<string>;
};

export function runLeashAuthEntry(options: LeashAuthEntryOptions) {
  return runAuthEntry({
    isCurrent: options.isCurrent,
    onAuthenticated: options.onAuthenticated,
    onChallenge: options.onChallenge,
    onPrecheckRejected: options.onPrecheckRejected,
    precheck: options.precheck,
    readDidToken: () => getPersistedMagicDidToken(options.user),
    verifyDidToken: options.verifyDidToken,
  });
}
