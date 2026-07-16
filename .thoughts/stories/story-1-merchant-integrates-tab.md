# Story: Merchant integrates Tab

> Traces to: R-TAB-1, R-TAB-2, R-TAB-3, AC-TAB-4. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As a merchant / developer,
I want to install one SDK package, drop a single `<PayButton>` into my product page, create a server-side payment-intent endpoint that pins my receiving address, token, and Arbitrum One as the settlement chain, and configure a webhook URL,
so that I can accept crypto payments without writing payment logic, managing wallets, or knowing anything about blockchains — and receive a webhook receipt as my order-fulfillment trigger, exactly as I would with Stripe.

---

## Acceptance Criteria

**From R-TAB-1 — Drop-in component:**
- The merchant integrates by installing one package (`packages/sdk`) and placing one component (`<PayButton>`) in their JSX. No payment state machine, auth logic, or chain interaction is written in the merchant's app.
- `<PayButton>` accepts `intentUrl` (a URL pointing to the merchant's payment-intent endpoint) and `onSuccess(transactionId, tokenChanges)` as its props. No other payment-related props are required to produce a working button.
- The component is fully self-contained: it renders its own idle, auth, processing, success, and error states without the merchant providing state-transition logic.

**From R-TAB-2 — Server payment-intent endpoint:**
- The merchant's intent endpoint returns `{ amount, receiver, token: { chainId: 42161, address: TOKEN }, currency }`. The `<PayButton>` reads this response before initiating payment; the buyer never supplies or overrides these fields.
- `amount` is computed and set by the merchant's server. A client-supplied or buyer-modified amount is not accepted.
- `receiver` is the merchant's own wallet address. The buyer cannot redirect settlement to a different address.
- `token.chainId` is `42161` (Arbitrum One). Settlement always lands on Arbitrum One for this integration; the buyer cannot select a different chain.

**From R-TAB-3 — Webhook delivery:**
- On settlement, the Tab server POSTs to the merchant's configured webhook URL with a body containing `transactionId` and `tokenChanges`, sourced from the `TransactionResult` returned by `ua.sendTransaction`.
- `tokenChanges` in the webhook body reflects the credited amount at the merchant's Arbitrum One address — this is the merchant's authoritative fulfillment signal (analog of Stripe's `payment_intent.succeeded`).

**From AC-TAB-4 — Webhook receipt fires:**
- After verified settlement, Tab dispatches the first webhook POST inline. Each HTTP attempt waits at most 10 seconds for a response.
- Delivery makes exactly three total HTTP attempts: attempt 1 inline, attempt 2 after 1 minute, and attempt 3 after 4 minutes. A third failure immediately records terminal `gave_up`; no fourth request is made.
- The `transactionId` and `tokenChanges` in the webhook body match the payment amount and the merchant's configured address on Arbitrum One (`chainId: 42161`).
- The `onSuccess` callback in the buyer's browser fires with the same `transactionId` and `tokenChanges` values that are delivered to the merchant's webhook.

---

## Scenarios

### Scenario 1 — Happy path: merchant completes integration and webhook fires

```
Given a merchant has a receiving wallet address and has installed packages/sdk
And the merchant has placed <PayButton intentUrl="/api/pay/intent" onSuccess={handleSuccess} /> on their product page
And the merchant's /api/pay/intent endpoint returns:
  { amount: "5.00", receiver: "0xMERCHANT", token: { chainId: 42161, address: TOKEN }, currency: "USD" }
And a webhook URL is configured in the Tab server

When a buyer completes a payment through the <PayButton>

Then the Tab server POSTs to the configured webhook URL
And the webhook body contains transactionId and tokenChanges
And tokenChanges shows a positive credit to 0xMERCHANT on Arbitrum One (chainId: 42161)
And the onSuccess callback fires in the buyer's browser with the same transactionId and tokenChanges
```

### Scenario 2 — Server controls price: buyer cannot alter amount

```
Given the merchant's intent endpoint returns amount: "5.00"
And a buyer (or attacker) attempts to supply a different amount client-side before payment is submitted

When the payment is processed

Then the amount used in the on-chain transfer is 5.00 as returned by the intent endpoint
And the webhook payload reflects the server-authoritative amount, not the client-supplied value
```

### Scenario 3 — Webhook payload is settlement-accurate

```
Given the merchant's intent endpoint pins receiver: "0xMERCHANT" and token.chainId: 42161

When the buyer completes payment and the Tab server delivers the webhook

Then the webhook body's tokenChanges includes a credit entry for 0xMERCHANT on chainId 42161
And the transactionId in the webhook body is the same identifier returned by ua.sendTransaction
And the transactionId is non-empty and uniquely identifies the on-chain settlement
```

---

## Notes

- The `<PayButton>` is self-contained by design. The Stripe mental model maps cleanly: the merchant's only server-side responsibilities are (1) an intent endpoint returning payment parameters and (2) a webhook handler consuming `transactionId` + `tokenChanges`. Auth, chain abstraction, state machine, and signing are entirely inside the SDK.
- Amount, receiver, token address, and chainId are all server-authoritative. The intent endpoint is the single source of truth for payment parameters; the component is a display-and-trigger surface, not an authority for any financial field.
- The webhook payload is derived from `TransactionResult.transactionId` and `TransactionResult.tokenChanges` — the exact fields returned by the Particle UA `sendTransaction` call. The merchant must not invent or assume other field names.
- `chainId: 42161` (Arbitrum One) is the pinned settlement chain for Tab. The merchant does not select a chain; it is fixed by the product.
- The fulfillment trigger is the webhook POST, not the `onSuccess` callback. The `onSuccess` callback runs in the buyer's browser — if the buyer closes the tab immediately after payment, the webhook still fires and fulfillment proceeds. Merchants must treat the webhook as the canonical fulfillment signal, not the browser callback.
- "Merchant configuring a webhook URL" is described in R-TAB-3 as a server-side configuration on the Tab server; the spec does not describe where or how this is configured (e.g., env var, Tab dashboard, SDK init option) — see Open Questions.

---

## Resolved Decisions

1. **Webhook timeout and retry policy (2026-07-16):** exactly three total HTTP attempts — inline, +1 minute, +4 minutes — with a 10-second response timeout per attempt and immediate terminal `gave_up` after the third failure.

## Open Questions

1. What is the install command / published package name for `packages/sdk`? R-TAB-1 names the monorepo package path but does not specify the npm registry name or install command a merchant uses.
2. Where does the merchant configure the webhook URL? R-TAB-3 says the Tab server POSTs to "the merchant's configured webhook URL" but does not specify whether configuration is via env var, a Tab SDK init option, a per-intent field, or a separate dashboard. This is the first thing a merchant needs to know after installing the package.
3. What exact USDC (or USDT) token address should the merchant specify in the intent endpoint's `token.address` field? Spec OQ-4 flags this as unresolved: the Particle quickstart uses USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`) but the product description says USDC. The confirmed address must be documented before any merchant can write a working intent endpoint.
