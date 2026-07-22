import { useCallback, useEffect, useRef } from "react";
import type {
  CheckoutDispatch,
  CheckoutModel,
  ControllerRuntime,
  PatchModel,
} from "./checkout-controller-model";
import type { CheckoutServices } from "./checkout-services";
import { PaymentExecutionBlockedError } from "./execute";

/** After this long in `confirming`, the UI switches to the honest
 * "still working — money may be in flight" state. The payment itself keeps
 * running; this is presentation, never a timeout on the transaction. */
const CONFIRMING_DELAY_NOTICE_MS = 20_000;

const REPORT_RETRY_DELAYS_MS = [1_000, 4_000, 10_000] as const;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const delayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearDelayNotice = useCallback(() => {
    if (delayTimer.current) {
      clearTimeout(delayTimer.current);
      delayTimer.current = undefined;
    }
  }, []);
  useEffect(() => clearDelayNotice, [clearDelayNotice]);

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
    clearDelayNotice();
    delayTimer.current = setTimeout(() => {
      if (activeRun === runtime.run.current) dispatch({ type: "confirmation-delayed" });
    }, CONFIRMING_DELAY_NOTICE_MS);
    try {
      if (context.mode === "test") {
        const result = await options.services.executeTestPayment({
          buyer,
          intent: intentResponse.intent,
          publishableKey: options.publishableKey,
        });
        // The transfer is real; the server re-verifies it via RPC. A 202
        // (receipt not yet indexed) is retried on the same backoff the live
        // rail uses — sent money must never go unreported.
        let report: Awaited<ReturnType<typeof options.services.reportPayment>> | undefined;
        for (let attempt = 0; attempt <= REPORT_RETRY_DELAYS_MS.length; attempt += 1) {
          report = await options.services.reportPayment({
            apiBaseUrl: options.apiBaseUrl,
            buyerDidToken: buyer.didToken,
            intent: intentResponse.intent,
            paymentId: opened.paymentId,
            publishableKey: options.publishableKey,
            tokenChanges: result.tokenChanges,
            transactionId: result.transactionId,
          });
          if (report.payment.status === "settled") break;
          const delay = REPORT_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) break;
          await wait(delay);
        }
        if (
          activeRun !== runtime.run.current ||
          report?.payment.status !== "settled" ||
          !("testMode" in report)
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
      // Executed money must never go unreported: retry with backoff so a
      // transient network blip cannot orphan real transaction evidence.
      for (let attempt = 0; attempt <= REPORT_RETRY_DELAYS_MS.length; attempt += 1) {
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
          break;
        } catch {
          const delay = REPORT_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) {
            // Live execution stays B-04 blocked; before unlock, Phase 10 adds
            // a durable server-side sweep for the exhausted-retries case.
            break;
          }
          await wait(delay);
        }
      }
    } catch (error) {
      if (activeRun === runtime.run.current) options.showFailure(error, true);
    } finally {
      clearDelayNotice();
      runtime.busy.current = false;
    }
  }, [clearDelayNotice, dispatch, model, options, runtime]);

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
