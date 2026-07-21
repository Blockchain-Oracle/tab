import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { normalizeApiBaseUrl } from "./api-base-url";
import { assertOpenedPaymentMatchesIntent, type CheckoutContext } from "./checkout-api";
import {
  type CheckoutModel,
  type ControllerOptions,
  type ControllerRuntime,
  checkoutErrorView,
  initialModel,
} from "./checkout-controller-model";
import type { BuyerAuthAttempt, BuyerRuntime } from "./checkout-services";
import { checkoutReducer, initialCheckoutState } from "./checkout-state";
import { useCheckoutAuth } from "./use-checkout-auth";
import { useCheckoutPayment } from "./use-checkout-payment";

export { formatAmount } from "./checkout-controller-model";

export function useCheckoutController(options: ControllerOptions) {
  const { apiBaseUrl, intentUrl, onSuccess, publishableKey, services } = options;
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [model, setModel] = useState(initialModel);
  const authAttempt = useRef<BuyerAuthAttempt | undefined>(undefined);
  const busy = useRef(false);
  const run = useRef(0);
  const runtime = useMemo<ControllerRuntime>(() => ({ authAttempt, busy, run }), []);
  const patch = useCallback((value: Partial<CheckoutModel>) => {
    setModel((current) => ({ ...current, ...value }));
  }, []);
  const showFailure = useCallback(
    (error: unknown, confirming = false) => {
      patch({ error: checkoutErrorView(error, confirming) });
      dispatch({ type: "failed" });
    },
    [patch],
  );

  const bootstrap = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const safeApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
        const [context, intentResponse] = await Promise.all([
          services.loadCheckoutContext(
            { apiBaseUrl: safeApiBaseUrl, publishableKey },
            signal ? { signal } : undefined,
          ),
          services.loadMerchantIntent(intentUrl, signal ? { signal } : undefined),
        ]);
        if (context.mode !== intentResponse.intent.mode) throw new Error("Checkout mode mismatch");
        patch({ context, error: undefined, intentResponse });
        dispatch({ type: "bootstrap-ready" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) showFailure(error);
      }
    },
    [apiBaseUrl, intentUrl, patch, publishableKey, services, showFailure],
  );

  useEffect(() => {
    const controller = new AbortController();
    void bootstrap(controller.signal);
    return () => {
      controller.abort();
      runtime.run.current += 1;
      runtime.authAttempt.current?.cancel();
    };
  }, [bootstrap, runtime]);

  const readBalance = useCallback(
    async (context: CheckoutContext, buyer: BuyerRuntime, activeRun: number, amount: string) => {
      try {
        const account = await services.loadAccount(context, buyer, { apiBaseUrl, publishableKey });
        if (activeRun !== runtime.run.current) return;
        patch({ account });
        const required = Number(amount);
        dispatch({
          sufficient: Number.isFinite(required) && account.balanceUsd >= required,
          type: "balance-resolved",
        });
      } catch (error) {
        if (activeRun === runtime.run.current) showFailure(error);
      }
    },
    [apiBaseUrl, patch, publishableKey, runtime, services, showFailure],
  );

  const getTestFunds = useCallback(async () => {
    const buyer = model.buyer;
    if (!buyer || model.context?.mode !== "test") {
      throw new Error("Test funds exist only in test mode.");
    }
    return services.claimTestFunds({
      apiBaseUrl,
      buyerDidToken: buyer.didToken,
      publishableKey,
    });
  }, [apiBaseUrl, model.buyer, model.context, publishableKey, services]);

  const acceptBuyer = useCallback(
    async (buyer: BuyerRuntime, context: CheckoutContext, activeRun: number, amount: string) => {
      if (activeRun !== runtime.run.current) return;
      patch({ buyer });
      dispatch({ type: "auth-succeeded" });
      await readBalance(context, buyer, activeRun, amount);
    },
    [patch, readBalance, runtime],
  );

  const start = useCallback(async () => {
    if (runtime.busy.current || !model.context) return;
    runtime.busy.current = true;
    const activeRun = ++runtime.run.current;
    dispatch({ type: "pay-started" });
    try {
      const safeApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
      const intentResponse = await services.loadMerchantIntent(intentUrl);
      if (intentResponse.intent.mode !== model.context.mode)
        throw new Error("Checkout mode mismatch");
      const opened = await services.openPayment({
        apiBaseUrl: safeApiBaseUrl,
        intentToken: intentResponse.intentToken,
        publishableKey,
      });
      assertOpenedPaymentMatchesIntent(opened, intentResponse.intent);
      if (activeRun !== runtime.run.current) return;
      patch({ account: undefined, error: undefined, intentResponse, opened, otpIssue: undefined });
      const buyer = await services.restoreBuyer(model.context);
      if (activeRun !== runtime.run.current) return;
      if (buyer) await acceptBuyer(buyer, model.context, activeRun, intentResponse.intent.amount);
      else dispatch({ type: "auth-required" });
    } catch (error) {
      if (activeRun === runtime.run.current) showFailure(error);
    } finally {
      runtime.busy.current = false;
    }
  }, [
    acceptBuyer,
    apiBaseUrl,
    intentUrl,
    model.context,
    patch,
    publishableKey,
    services,
    runtime,
    showFailure,
  ]);
  const auth = useCheckoutAuth({ acceptBuyer, dispatch, model, patch, runtime, services });
  const payment = useCheckoutPayment({
    apiBaseUrl,
    bootstrap,
    dispatch,
    model,
    onSuccess,
    patch,
    publishableKey,
    readBalance,
    runtime,
    services,
    showFailure,
    start,
  });

  return {
    ...auth,
    ...payment,
    dispatch,
    getTestFunds,
    model,
    setEmail: (email: string) => patch({ email }),
    start,
    state,
  };
}
