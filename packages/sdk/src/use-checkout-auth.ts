import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CheckoutDispatch,
  CheckoutModel,
  ControllerRuntime,
  PatchModel,
} from "./checkout-controller-model";
import type { BuyerRuntime, CheckoutServices } from "./checkout-services";
import { type BuyerFailure, buyerErrorCopy } from "./copy";
import type { OtpIssue } from "./states/AuthState";

const AUTH_RETRY_COOLDOWN_MS = 30_000;

type AcceptBuyer = (
  buyer: BuyerRuntime,
  context: NonNullable<CheckoutModel["context"]>,
  activeRun: number,
  amount: string,
) => Promise<void>;

type Options = {
  acceptBuyer: AcceptBuyer;
  dispatch: CheckoutDispatch;
  model: CheckoutModel;
  patch: PatchModel;
  runtime: ControllerRuntime;
  services: CheckoutServices;
};

export function useCheckoutAuth(options: Options) {
  const { acceptBuyer, dispatch, model, patch, runtime, services } = options;
  const [authCooldownActive, setAuthCooldownActive] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );
  const armCooldown = useCallback(() => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    setAuthCooldownActive(true);
    cooldownTimer.current = setTimeout(() => {
      cooldownTimer.current = undefined;
      setAuthCooldownActive(false);
    }, AUTH_RETRY_COOLDOWN_MS);
  }, []);
  const showAuthFailure = useCallback(() => {
    const detail: BuyerFailure = { broadcastStarted: false, kind: "auth-failed" };
    patch({ error: { ...buyerErrorCopy(detail), retryable: true } });
    dispatch({ type: "failed" });
  }, [dispatch, patch]);

  const submitEmail = useCallback(async () => {
    const context = model.context;
    const intentResponse = model.intentResponse;
    if (authCooldownActive || runtime.busy.current || !context || !intentResponse) return;
    runtime.busy.current = true;
    const activeRun = runtime.run.current;
    dispatch({ type: "email-submitted" });
    patch({ otpIssue: undefined });
    const isActive = () => activeRun === runtime.run.current;
    const authFailed = () => {
      if (isActive()) showAuthFailure();
    };
    const issue = (otpIssue: Exclude<OtpIssue, undefined>) => {
      if (!isActive()) return;
      patch({ otpIssue });
      dispatch({ type: "otp-rejected" });
    };
    // A new device is a recoverable waiting state: Magic emails an approval
    // link and the SAME attempt resolves once the buyer approves. Keep the
    // attempt alive and show the waiting panel instead of failing.
    const deviceApproval = () => {
      if (isActive()) dispatch({ type: "device-approval-needed" });
    };
    try {
      const attempt = await services.startBuyerAuth(context, model.email, {
        onDeviceApproval: deviceApproval,
        onExpired: () => issue("expired"),
        onInvalid: () => issue("invalid"),
        onOtpSent: () => {
          if (isActive()) dispatch({ type: "otp-sent" });
        },
        onRateLimited: () => {
          armCooldown();
          issue("rate-limited");
        },
        onUnsupported: authFailed,
      });
      if (!isActive()) {
        attempt.cancel();
        return;
      }
      runtime.authAttempt.current = attempt;
      void attempt.result
        .then((buyer) => acceptBuyer(buyer, context, activeRun, intentResponse.intent.amount))
        .catch(authFailed);
    } catch {
      authFailed();
    } finally {
      runtime.busy.current = false;
    }
  }, [
    acceptBuyer,
    armCooldown,
    authCooldownActive,
    dispatch,
    model,
    patch,
    runtime,
    services,
    showAuthFailure,
  ]);

  const submitOtp = useCallback(
    (otp: string) => {
      if (!/^\d{6}$/.test(otp)) return;
      patch({ otpIssue: undefined });
      dispatch({ otp, type: "otp-changed" });
      dispatch({ type: "otp-submitted" });
      try {
        runtime.authAttempt.current?.verify(otp);
      } catch {
        showAuthFailure();
      }
    },
    [dispatch, patch, runtime, showAuthFailure],
  );

  const restartAuth = useCallback(() => {
    if (authCooldownActive) return;
    runtime.run.current += 1;
    runtime.authAttempt.current?.cancel();
    runtime.authAttempt.current = undefined;
    patch({ otpIssue: undefined });
    dispatch({ type: "auth-restarted" });
  }, [authCooldownActive, dispatch, patch, runtime]);

  return { authCooldownActive, restartAuth, submitEmail, submitOtp };
}
