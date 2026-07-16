import { useCallback } from "react";
import type {
  CheckoutDispatch,
  CheckoutModel,
  ControllerRuntime,
  PatchModel,
} from "./checkout-controller-model";
import type { CheckoutServices } from "./checkout-services";
import { PaymentExecutionBlockedError } from "./execute";

type Options = {
  apiBaseUrl: string;
  bootstrap(signal?: AbortSignal): Promise<void>;
  dispatch: CheckoutDispatch;
  model: CheckoutModel;
  onSuccess: (transactionId: string, tokenChanges: object) => void;
  patch: PatchModel;
  publishableKey: string;
  readBalance(
    context: NonNullable<CheckoutModel["context"]>,
    buyer: NonNullable<CheckoutModel["buyer"]>,
    activeRun: number,
    amount: string,
  ): Promise<void>;
  runtime: ControllerRuntime;
  services: CheckoutServices;
  showFailure(error: unknown, confirming?: boolean): void;
  start(): Promise<void>;
};

export function useCheckoutPayment(options: Options) {
  const { dispatch, model, patch, runtime } = options;
  const cancel = useCallback(() => {
    runtime.run.current += 1;
    runtime.busy.current = false;
    runtime.authAttempt.current?.cancel();
    runtime.authAttempt.current = undefined;
    patch({
      account: undefined,
      buyer: undefined,
      error: undefined,
      opened: undefined,
      otpIssue: undefined,
    });
    dispatch({ type: "cancelled" });
  }, [dispatch, patch, runtime]);

  const recheck = useCallback(async () => {
    const { account, buyer, context, intentResponse } = model;
    if (runtime.busy.current || !account || !buyer || !context || !intentResponse) return;
    runtime.busy.current = true;
    const activeRun = ++runtime.run.current;
    dispatch({ type: "balance-recheck-started" });
    await options.readBalance(context, buyer, activeRun, intentResponse.intent.amount);
    runtime.busy.current = false;
  }, [dispatch, model, options.readBalance, runtime]);

  const confirm = useCallback(async () => {
    const { account, buyer, context, intentResponse, opened } = model;
    if (runtime.busy.current || !account || !buyer || !context || !intentResponse || !opened) {
      return;
    }
    runtime.busy.current = true;
    const activeRun = runtime.run.current;
    dispatch({ type: "confirmation-started" });
    try {
      if (context.mode === "test") {
        const result = options.services.createTestPayment({
          intent: intentResponse.intent,
          paymentId: opened.paymentId,
        });
        const report = await options.services.reportPayment({
          apiBaseUrl: options.apiBaseUrl,
          buyerDidToken: buyer.didToken,
          intent: intentResponse.intent,
          paymentId: opened.paymentId,
          publishableKey: options.publishableKey,
          tokenChanges: result.tokenChanges,
          transactionId: result.transactionId,
        });
        if (
          activeRun !== runtime.run.current ||
          report.payment.status !== "settled" ||
          !("testMode" in report) ||
          report.testMode.simulated !== true
        ) {
          throw new Error("Test settlement was not committed");
        }
        dispatch({ type: "payment-succeeded" });
        try {
          options.onSuccess(report.payment.reportedTransactionId, report.payment.tokenChanges);
        } catch {
          // Merchant callbacks do not change a completed test payment's state.
        }
        return;
      }
      if (!context.capabilities.livePaymentExecution) {
        throw new PaymentExecutionBlockedError();
      }
      const result = await options.services.executePayment({
        account,
        buyer,
        intent: intentResponse.intent,
      });
      if (activeRun !== runtime.run.current) return;
      dispatch({ type: "payment-succeeded" });
      try {
        options.onSuccess(result.transactionId, result.tokenChanges);
      } catch {
        // Merchant callbacks do not change a completed payment's state.
      }
      try {
        await options.services.reportPayment({
          apiBaseUrl: options.apiBaseUrl,
          buyerDidToken: buyer.didToken,
          intent: intentResponse.intent,
          paymentId: opened.paymentId,
          publishableKey: options.publishableKey,
          tokenChanges: result.tokenChanges,
          transactionId: result.transactionId,
        });
      } catch {
        // Live execution is B-04 blocked. Before unlock, Phase 10 must add durable report retry:
        // an opened row without committed transaction evidence cannot be recovered by the sweep.
      }
    } catch (error) {
      if (activeRun === runtime.run.current) options.showFailure(error, true);
    } finally {
      runtime.busy.current = false;
    }
  }, [dispatch, model, options, runtime]);

  const retry = useCallback(() => {
    if (!model.context || !model.intentResponse) {
      dispatch({ type: "bootstrap-started" });
      void options.bootstrap();
      return;
    }
    void options.start();
  }, [dispatch, model.context, model.intentResponse, options]);

  return { cancel, confirm, recheck, retry };
}
