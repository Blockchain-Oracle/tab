"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CodeBlock, type CodeLang } from "../../../../components/code-block";
import styles from "./quickstart.module.css";

type StepKey =
  | "add_pay_button"
  | "configure_webhook"
  | "create_api_key"
  | "go_live"
  | "install"
  | "intent_endpoint"
  | "test_payment"
  | "verify_webhook";

type WebhookDeliveryResult =
  | "delivered"
  | "failed"
  | "gave_up"
  | "pending"
  | "retrying"
  | "timeout";

type QuickstartState = {
  completedCount: number;
  firstTestPayment: {
    amountUsd: string;
    responseTimeMs: number | null;
    webhookResult: WebhookDeliveryResult | null;
  } | null;
  maskedSecretKey: string | null;
  publishableKey: string | null;
  receivingAddress: string | null;
  steps: Array<{
    completion: "derived" | "manual";
    done: boolean;
    key: StepKey;
    title: string;
  }>;
  webhookUrl: string | null;
};

function usd(value: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value),
  );
}

export function formatWebhookDeliverySummary(
  result: WebhookDeliveryResult | null,
  responseTimeMs: number | null,
) {
  if (result === "delivered") {
    return responseTimeMs === null
      ? "webhook delivered"
      : `webhook delivered in ${responseTimeMs}ms`;
  }
  if (result === "retrying") return "webhook retry scheduled";
  if (result === "gave_up") return "webhook delivery gave up";
  if (result === "failed") return "webhook delivery failed";
  if (result === "timeout") return "webhook delivery timed out";
  if (result === "pending") return "webhook delivery pending";
  return "webhook not sent";
}

export function tabServerSnippet(appUrl: string, maskedSecretKey: string | null) {
  return `// Server environment: TAB_API_BASE_URL=${appUrl}
import { Tab } from "@runtab/sdk";

const tab = new Tab(process.env.TAB_SECRET_KEY!);
await tab.payments.list();
// Dashboard key: ${maskedSecretKey ?? "not created"}`;
}

function stepContent(key: StepKey, state: QuickstartState, appUrl: string) {
  const values: Record<
    StepKey,
    { code?: string; description: string; href?: string; lang?: CodeLang; note?: string }
  > = {
    install: {
      code: "npm install @runtab/sdk",
      description: "Add the checkout component to your merchant application.",
      lang: "shell",
    },
    create_api_key: {
      code: tabServerSnippet(appUrl, state.maskedSecretKey),
      lang: "ts",
      description: "Secret keys stay on your server and are shown only once.",
      href: "/dashboard/keys",
    },
    intent_endpoint: {
      code: `const response = await fetch("${appUrl}/api/v1/payment-intents", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.TAB_SECRET_KEY}\`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({ amount: "1.00", intentUrl: request.url })\n});\nreturn Response.json(await response.json(), { status: response.status });\n// Receiving address: ${state.receivingAddress ?? "not configured"}`,
      lang: "ts",
      description: "Your server signs the amount and Tab derives the receiving address and asset.",
    },
    add_pay_button: {
      code: `<PayButton\n  apiBaseUrl="${appUrl}"\n  publishableKey="${state.publishableKey ?? "<YOUR_PUBLISHABLE_KEY>"}"\n  intentUrl="/api/demo/intent"\n  onSuccess={(transactionId, tokenChanges) =>\n    showOrderConfirmation(transactionId, tokenChanges)}\n/>`,
      lang: "ts",
      description: "The component handles identity, balance, confirmation, and completion.",
    },
    configure_webhook: {
      code: state.webhookUrl ?? "https://your-server.example/webhooks/tab",
      description: "Webhooks are the trusted fulfillment signal after settlement.",
      href: "/dashboard/webhooks",
    },
    verify_webhook: {
      description: "Send a real signed test delivery and receive a successful response.",
      href: "/dashboard/webhooks",
    },
    test_payment: {
      description: "Open your tenant-specific demo and complete a clearly labeled test payment.",
      href: "/demo",
    },
    go_live: {
      description: "Review the real readiness checks before enabling Mainnet.",
      href: "/dashboard/go-live",
      note: "Use a live secret key in production. Test keys never move real funds.",
    },
  };
  return values[key];
}

export function QuickstartList({ appUrl, state }: { appUrl: string; state: QuickstartState }) {
  const router = useRouter();
  const [busy, setBusy] = useState<StepKey>();
  const [error, setError] = useState<string>();
  const activeIndex = state.steps.findIndex((step) => !step.done);

  async function markDone(key: StepKey) {
    if (busy) return;
    setBusy(key);
    setError(undefined);
    try {
      const response = await fetch(`/api/quickstart/steps/${key}/complete`, { method: "POST" });
      if (!response.ok) throw new Error("Progress update failed");
      router.refresh();
    } catch {
      setError("Progress was not saved. Try again without leaving this page.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1>Quickstart</h1>
          <p>From install to your first settled payment. One action per step.</p>
        </div>
        <span>{state.completedCount} of 8 steps complete</span>
      </header>

      {state.firstTestPayment ? (
        <section className={styles.milestone} aria-label="First test payment received">
          <span className={styles.milestoneCheck} aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>
              {state.firstTestPayment.webhookResult === "delivered"
                ? "Test payment received. Your integration is working."
                : "Test payment received. Check webhook delivery."}
            </strong>
            <p>
              {usd(state.firstTestPayment.amountUsd)} test payment ·{" "}
              {formatWebhookDeliverySummary(
                state.firstTestPayment.webhookResult,
                state.firstTestPayment.responseTimeMs,
              )}
            </p>
          </div>
          <Link href="/dashboard/go-live">Review Go Live</Link>
        </section>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      <ol className={styles.steps}>
        {state.steps.map((step, index) => {
          const content = stepContent(step.key, state, appUrl);
          const active = index === activeIndex;
          return (
            <li className={active ? styles.activeStep : styles.step} key={step.key}>
              <span className={step.done ? styles.doneMark : styles.stepMark} aria-hidden="true">
                {step.done ? "✓" : index + 1}
              </span>
              <div className={styles.stepBody}>
                <div className={styles.stepHeading}>
                  <strong>{step.title}</strong>
                  {step.done ? <span className={styles.doneLabel}>Done</span> : null}
                  {!step.done && step.completion === "manual" ? (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void markDone(step.key)}
                      type="button"
                    >
                      {busy === step.key ? "Saving…" : "Mark done"}
                    </button>
                  ) : null}
                  {!step.done && content.href ? <Link href={content.href}>Continue</Link> : null}
                </div>
                <p>{content.description}</p>
                {content.code ? (
                  <CodeBlock code={content.code} lang={content.lang ?? "text"} />
                ) : null}
                {content.note ? <small>{content.note}</small> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
