"use client";

import { useMemo } from "react";

import { AuthRequestError, createEmailOtpAuthApi } from "../../(auth)/auth-request";
import { useEmailOtpAuth } from "../../(auth)/use-email-otp-auth";

type LeashAuthOptions = {
  configured: boolean;
  publishableKey: string;
};

const genericError = "Couldn’t log you in. Try again.";

export function useLeashAuth({ configured, publishableKey }: LeashAuthOptions) {
  const api = useMemo(
    () =>
      createEmailOtpAuthApi({
        precheckPath: "/api/agents/auth/precheck",
        verifyPath: "/api/agents/auth/verify",
      }),
    [],
  );

  const auth = useEmailOtpAuth({
    api,
    configured,
    genericError,
    mapPrecheckError: (error) => ({
      code: error instanceof AuthRequestError ? error.code : "AUTH_REQUEST_FAILED",
      message: error instanceof AuthRequestError ? error.message : genericError,
    }),
    publishableKey,
  });

  return { ...auth, emailError: auth.emailError?.message };
}
