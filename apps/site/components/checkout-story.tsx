import { BaseMark, TabMark } from "@tab/ui";

import { Reveal } from "./reveal";

/**
 * Human checkout story with an illustrative sheet whose geometry mirrors the
 * real SDK checkout. Labeled as illustration; no financial data.
 */
export function CheckoutStory() {
  return (
    <section aria-labelledby="checkout-title" className="band checkout-band">
      <div className="container checkout-grid">
        <div className="checkout-copy">
          <p className="eyebrow">For you</p>
          <h2 className="section-title" id="checkout-title">
            Checkout that feels like email, not a wallet.
          </h2>
          <p className="section-sub">
            Buyers type an email, enter a six-digit code, and pay. No extension, no seed phrase, no
            gas surprise. Balances live on real chains; complexity doesn’t reach the buyer.
          </p>
          <ul className="checkout-points">
            <li>Email + one-time code — nothing to install</li>
            <li>One balance across supported chains</li>
            <li>Testnet is always labeled, never simulated</li>
          </ul>
        </div>

        <Reveal className="reveal checkout-figure" delayMs={120}>
          <figure aria-label="Illustration of the Tab checkout sheet" className="sheet">
            <figcaption className="eyebrow sheet-eyebrow">
              Product illustration · no financial data
            </figcaption>
            <div className="sheet-head">
              <span className="sheet-brand">
                <TabMark size={16} />
                <span className="wordmark-text sheet-wordmark">tab</span>
              </span>
              <span className="sheet-merchant">Example Merchant</span>
            </div>
            <p className="sheet-amount mono">$12.00</p>
            <ol aria-hidden="true" className="sheet-stages mono">
              <li data-state="done">Email</li>
              <li data-state="done">Code</li>
              <li data-state="active">Balance</li>
              <li>Pay</li>
            </ol>
            <div className="sheet-chip">
              <BaseMark size={16} />
              <span>Base Sepolia</span>
              <span className="sheet-chip-note">Testnet</span>
            </div>
            <span aria-hidden="true" className="btn btn-primary sheet-pay">
              Pay $12.00
            </span>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
