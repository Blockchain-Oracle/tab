"use client";

import { useMemo } from "react";

import { type AuthFlow, authCopy } from "./auth-copy";
import { precheckFailure } from "./auth-errors";
import { createEmailOtpAuthApi } from "./auth-request";
import { useEmailOtpAuth } from "./use-email-otp-auth";

type MerchantAuthOptions = {
  configured: boolean;
  flow: AuthFlow;
  publishableKey: string;
};

export function useMerchantAuth({ configured, flow, publishableKey }: MerchantAuthOptions) {
  const api = useMemo(
    () =>
      createEmailOtpAuthApi({
        extraBody: { flow },
        precheckPath: "/api/auth/precheck",
        verifyPath: "/api/auth/verify",
      }),
    [flow],
  );

  return useEmailOtpAuth({
    api,
    configured,
    genericError: authCopy[flow].genericError,
    mapPrecheckError: (error) => precheckFailure(error, flow),
    publishableKey,
  });
}
