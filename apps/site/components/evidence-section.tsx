import { Reveal } from "./reveal";

const RECEIPT_ROWS = [
  { label: "amount", value: "[amount] USDC" },
  { label: "network", value: "Base Sepolia · eip155:84532" },
  { label: "payer", value: "[agent address]" },
  { label: "challenge", value: "observed" },
  { label: "policy", value: "passed before signature" },
  { label: "settlement", value: "[transaction id]" },
] as const;

/** Receipt anatomy: submitted is not settled; evidence is the interface. */
export function EvidenceSection() {
  return (
    <section aria-labelledby="evidence-title" className="band evidence-band">
      <div className="container checkout-grid">
        <Reveal className="reveal receipt-wrap" delayMs={100}>
          <figure aria-label="Illustration of a Tab receipt" className="receipt">
            <figcaption className="eyebrow sheet-eyebrow">
              Product illustration · no financial data
            </figcaption>
            <dl className="receipt-rows mono">
              {RECEIPT_ROWS.map((row) => (
                <div className="receipt-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <Reveal className="stamp receipt-stamp" delayMs={520}>
              <span className="stamp-seal">Verified</span>
            </Reveal>
          </figure>
        </Reveal>

        <div className="checkout-copy">
          <p className="eyebrow">Evidence, not theatre</p>
          <h2 className="section-title" id="evidence-title">
            Submitted is not settled. Tab shows the difference.
          </h2>
          <p className="section-sub">
            Every payment carries its own paper trail: the challenge, the policy decision, the
            signature, the settlement, and independent verification — each shown only when it really
            happened. No state is ever invented.
          </p>
          <ul className="checkout-points">
            <li>Real transaction ids, linked to public explorers</li>
            <li>Verification is a separate, continuing check</li>
            <li>Failures state whether money may have moved</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
