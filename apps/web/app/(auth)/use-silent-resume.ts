"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getMagicClient } from "../../lib/auth/magic-client";
import { getPersistedMagicIdentity } from "./magic-session";

const RESUME_DEADLINE_MS = 4_000;

export type SilentResumeStatus = "checking" | "idle" | "resuming";

type Options = {
  enabled: boolean;
  /** Prefill the email form when resume fails with a known address. */
  onKnownEmail?: (email: string) => void;
  publishableKey: string;
  verify: (didToken: string, email: string, options: { signal: AbortSignal }) => Promise<string>;
};

/**
 * Mount-time silent resume: when a persisted Magic session exists, verify it
 * server-side and enter without any typing. Every failure is silent — the
 * visitor never asked for anything, so they simply see the email form.
 */
export function useSilentResume({ enabled, onKnownEmail, publishableKey, verify }: Options) {
  const router = useRouter();
  const [status, setStatus] = useState<SilentResumeStatus>(enabled ? "checking" : "idle");
  const [email, setEmail] = useState<string>();
  const ran = useRef(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once probe; verify/onKnownEmail/router are stable for its lifetime and re-running on their identity would re-trigger auth.
  useEffect(() => {
    if (!enabled || !publishableKey || ran.current) {
      if (!enabled || !publishableKey) setStatus("idle");
      return;
    }
    ran.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const deadline = setTimeout(() => controller.abort(), RESUME_DEADLINE_MS);

    void (async () => {
      let knownEmail: string | undefined;
      try {
        const client = getMagicClient(publishableKey);
        const identity = await getPersistedMagicIdentity(client.user);
        if (!identity || controller.signal.aborted) {
          setStatus("idle");
          return;
        }
        knownEmail = identity.email;
        setEmail(identity.email);
        setStatus("resuming");
        const redirectTo = await verify(identity.didToken, identity.email, {
          signal: controller.signal,
        });
        router.replace(redirectTo);
        router.refresh();
      } catch {
        if (knownEmail) onKnownEmail?.(knownEmail);
        setStatus("idle");
      } finally {
        clearTimeout(deadline);
      }
    })();

    return () => {
      clearTimeout(deadline);
      controller.abort();
    };
  }, [enabled, publishableKey]);

  function dismiss() {
    abortRef.current?.abort();
    try {
      void getMagicClient(publishableKey).user.logout();
    } catch {
      // Dismiss must never surface an error; the form is shown regardless.
    }
    setStatus("idle");
  }

  return { dismiss, email, status };
}
