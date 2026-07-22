"use client";

import { PayButton } from "@runtab/sdk";
import { TabMark } from "@tab/ui";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_TAB_API_BASE_URL ?? "https://app.runtab.xyz";
const HOUSE_PK = process.env.NEXT_PUBLIC_PLAYGROUND_PK ?? "";
const DOCS_URL = "https://docs.runtab.xyz";
const PK_PATTERN = /^pk_test_[A-Za-z0-9_-]+$/;

function snippet(pk: string) {
  return `import { PayButton } from "@runtab/sdk";

<PayButton
  apiBaseUrl="${API_BASE_URL}"
  publishableKey="${pk || "pk_test_…"}"
  intentUrl="/api/payment-intent"
  onSuccess={(transactionId) => done(transactionId)}
/>`;
}

export function Playground() {
  const params = useSearchParams();
  const linkedPk = params.get("pk")?.trim() ?? "";
  const [customPk, setCustomPk] = useState(PK_PATTERN.test(linkedPk) ? linkedPk : "");
  const [draft, setDraft] = useState(customPk);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState<string | null>(null);

  const activePk = customPk || HOUSE_PK;
  const usingOwnKey = Boolean(customPk);
  const intentUrl = useMemo(
    () =>
      `${API_BASE_URL}/api/v1/checkout/playground-intent?pk=${encodeURIComponent(activePk)}&amount=1.00`,
    [activePk],
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet(activePk));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Selection still works.
    }
  }

  function applyDraft() {
    const value = draft.trim();
    if (value === "") {
      setCustomPk("");
      return;
    }
    if (PK_PATTERN.test(value)) setCustomPk(value);
  }

  return (
    <main className="page">
      <header className="top">
        <a className="wordmark" href="https://runtab.xyz">
          <TabMark size={22} />
          <span>tab</span>
          <span className="tag">PLAYGROUND</span>
        </a>
        <nav>
          <a href={DOCS_URL}>Docs</a>
          <a href="https://app.runtab.xyz/signup">Get your own keys</a>
        </nav>
      </header>

      <section className="hero">
        <h1>
          Pay with nothing but an email. <em>For real.</em>
        </h1>
        <p>
          This is a live checkout on Base Sepolia — real wallet, real sandbox USDC, real transaction
          hash. No signup, no wallet, no card. Try it, then copy the code that runs it.
        </p>
      </section>

      <section className="modes" aria-label="Whose keys power this page">
        <div className={usingOwnKey ? "mode" : "mode active"}>
          <b>Tab Coffee</b>
          <span>The house shop — zero setup, just pay.</span>
        </div>
        <div className={usingOwnKey ? "mode active" : "mode"}>
          <b>Your storefront</b>
          <span>
            Paste your <code>pk_test</code> key (or arrive from your dashboard) and this page
            becomes your shop — payments land in your dashboard, your webhooks fire.
          </span>
          <div className="keyRow">
            <input
              aria-label="Your publishable test key"
              onBlur={applyDraft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && applyDraft()}
              placeholder="pk_test_…"
              spellCheck={false}
              value={draft}
            />
            <button onClick={applyDraft} type="button">
              Use it
            </button>
          </div>
        </div>
        <div className="mode locked">
          <b>Mainnet</b>
          <span>Unlocks after live money-mover verification. No fake switches before then.</span>
        </div>
      </section>

      <section className="split">
        <div className="shop">
          <div className="shopCard">
            <span className="shopEmoji" aria-hidden="true">
              ☕
            </span>
            <h2>{usingOwnKey ? "Your test storefront" : "Tab Coffee"}</h2>
            <p className="price">$1.00</p>
            <p className="note">
              Empty wallet? The checkout hands you sandbox funds without leaving the sheet.
            </p>
            {activePk ? (
              <PayButton
                apiBaseUrl={API_BASE_URL}
                intentUrl={intentUrl}
                key={activePk}
                onSuccess={(transactionId) => setPaid(transactionId)}
                publishableKey={activePk}
              />
            ) : (
              <p className="note">House key not configured.</p>
            )}
            {paid ? (
              <p className="receipt">
                Paid ✓{" "}
                <a
                  href={`https://sepolia.basescan.org/tx/${paid}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  see it on Basescan ↗
                </a>
              </p>
            ) : null}
          </div>
          <p className="honesty">
            This is a testnet — every settlement is a real on-chain transaction.
          </p>
        </div>

        <div className="code">
          <div className="codeHead">
            <span className="mono">checkout.tsx — the code running this page</span>
            <button onClick={() => void copyCode()} type="button">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mono">
            <code>{snippet(activePk)}</code>
          </pre>
          <p className="codeNote">
            Your server mints the signed intent (
            <a href={`${DOCS_URL}/docs/quickstart`}>two more lines</a>) — the browser can never
            change the price. Full starter:{" "}
            <a href="https://github.com/Blockchain-Oracle/tab/tree/master/examples/storefront-next">
              examples/storefront-next
            </a>
            .
          </p>
        </div>
      </section>

      <footer className="foot">
        <span>
          Tab — invisible payments, for you and for your AI ·{" "}
          <a href="https://runtab.xyz">runtab.xyz</a>
        </span>
      </footer>
    </main>
  );
}
