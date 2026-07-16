# Story: Merchant integrates Tab

> Traces to: R-TAB-1, R-TAB-2, R-TAB-3, R-TAB-11, R-TAB-13, AC-TAB-4. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As a merchant / developer,
I want to install one SDK package, drop a single `<PayButton>` into my product page, relay a short-lived Tab-signed payment intent from my server, and configure a webhook URL,
so that I can accept crypto payments without writing payment logic, managing wallets, or knowing anything about blockchains — and receive a webhook receipt as my order-fulfillment trigger, exactly as I would with Stripe.

---

## Acceptance Criteria

**From R-TAB-1 — Drop-in component:**
- The merchant integrates by installing one package (`packages/sdk`) and placing one component (`<PayButton>`) in their JSX. No payment state machine, auth logic, or chain interaction is written in the merchant's app.
- `<PayButton>` requires `apiBaseUrl`, `publishableKey`, `intentUrl`, and `onSuccess(transactionId, tokenChanges)`. Amount, receiver, settlement token, chain, and mode are never component props.
- The component is fully self-contained: it renders its own idle, auth, processing, success, and error states without the merchant providing state-transition logic.

**From R-TAB-2 — Server payment-intent authority:**
- The merchant's server computes the amount, then calls sk-authenticated `POST /api/v1/payment-intents` with the exact body `{ amount, intentUrl }`.
- Tab derives the merchant, environment, current registered receiving address, USD currency, and fixed Arbitrum One USDC asset from server-side records and product configuration. The merchant does not choose a token or chain in the request.
- Tab returns `{ intent, intentToken }`, where `intentToken` is a five-minute signed JWS covering the authoritative fields. The merchant's `intentUrl` relays that response to `<PayButton>`.
- The browser may display the returned `intent`, but it cannot mint or override amount, receiver, asset, chain, environment, or merchant identity.

**From R-TAB-11 — Create-at-open lifecycle:**
- `<PayButton>` opens the payment by sending exactly `{ intentToken }` to pk-authenticated `POST /api/v1/payments`; browser-supplied financial fields are not accepted.
- Tab validates the signed intent, expiry, merchant, environment, and current receiving address before creating a real `pending` payment and returning its `paymentId` and `refCode`.
- The SDK rejects an opened-payment response whose authority fields do not match the signed intent. Reporting and settlement continue through the canonical R-TAB-11 lifecycle; no browser-only success is authoritative.

**From R-TAB-13 — Key separation:**
- The merchant's `sk_` key remains on its server and is used to mint payment intents and read payments. The browser receives only the environment-matched `pk_` publishable key.
- `apiBaseUrl` identifies the Tab API used for checkout context, payment open, and payment report; `publishableKey` authenticates that browser plane.

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
And the merchant has placed:
  <PayButton
    apiBaseUrl="https://api.tab.example"
    publishableKey="pk_live_..."
    intentUrl="https://merchant.example/api/pay/intent"
    onSuccess={handleSuccess}
  />
  on their product page
And the merchant's /api/pay/intent endpoint uses its sk key to POST exactly
  { amount: "5.00", intentUrl: "https://merchant.example/api/pay/intent" }
  to Tab's /api/v1/payment-intents endpoint
And the merchant relays Tab's { intent, intentToken } response unchanged
And a webhook URL is configured in the Tab server

When a buyer completes a payment through the <PayButton>

Then the Tab server POSTs to the configured webhook URL
And the webhook body contains transactionId and tokenChanges
And tokenChanges shows a positive credit to 0xMERCHANT on Arbitrum One (chainId: 42161)
And the onSuccess callback fires in the buyer's browser with the same transactionId and tokenChanges
```

### Scenario 2 — Server controls price: buyer cannot alter amount

```
Given Tab has signed a five-minute intent for amount: "5.00" and the merchant's registered receiving address
And a buyer (or attacker) modifies the displayed intent or adds amount, receiver, token, or chain fields to the open request

When <PayButton> opens the payment with POST /api/v1/payments

Then the SDK sends exactly { intentToken }
And Tab rejects a tampered, expired, wrong-merchant, wrong-environment, or stale-receiver intent
And no client-supplied financial field can replace the signed server-authoritative value
```

### Scenario 3 — Webhook payload is settlement-accurate

```
Given Tab derives receiver: "0xMERCHANT" from the merchant record and signs the fixed Arbitrum One USDC asset into the intent

When the buyer completes payment and the Tab server delivers the webhook

Then the webhook body's tokenChanges includes a credit entry for 0xMERCHANT on chainId 42161
And the transactionId in the webhook body is the same identifier returned by ua.sendTransaction
And the transactionId is non-empty and uniquely identifies the on-chain settlement
```

### Scenario 4 — Secret key never enters the browser

```
Given the merchant server owns an sk key and the product page owns the matching pk key

When the merchant mints an intent and a buyer opens checkout

Then only the merchant server calls POST /api/v1/payment-intents with the sk key
And the browser uses the pk key for checkout context, payment open, and payment report
And neither the sk key nor a merchant-selected token or chain appears in PayButton props
```

---

## Notes

- The `<PayButton>` is self-contained by design. The Stripe mental model maps cleanly: the merchant's server relays a Tab-signed intent and handles webhooks; auth, chain abstraction, the buyer state machine, and signing stay inside the SDK.
- Authority is split deliberately: the merchant server controls only `amount` and its relay `intentUrl`; Tab derives receiver, fixed asset, chain, environment, currency, and merchant identity before signing. The component is a display-and-trigger surface, not an authority for financial fields.
- The webhook payload is derived from `TransactionResult.transactionId` and `TransactionResult.tokenChanges` — the exact fields returned by the Particle UA `sendTransaction` call. The merchant must not invent or assume other field names.
- Arbitrum One USDC is the fixed settlement asset for Tab. The merchant does not select a token or chain in either the mint request or `<PayButton>` props.
- The fulfillment trigger is the webhook POST, not the `onSuccess` callback. The `onSuccess` callback runs in the buyer's browser — if the buyer closes the tab immediately after payment, the webhook still fires and fulfillment proceeds. Merchants must treat the webhook as the canonical fulfillment signal, not the browser callback.
- "Merchant configuring a webhook URL" is described in R-TAB-3 as a server-side configuration on the Tab server; the spec does not describe where or how this is configured (e.g., env var, Tab dashboard, SDK init option) — see Open Questions.
- **Current verification boundary:** Phase 4 proves the real signed-intent/open path and a real Particle balance/address read, integrates the previously proved persistent Magic session flow, and builds Add Funds from the returned address. Live buyer execution, settlement, success, and webhook delivery remain **BLOCKED (B-04)** until the funded live spike; they must fail closed rather than simulate success.

---

## Resolved Decisions

1. **Webhook timeout and retry policy (2026-07-16):** exactly three total HTTP attempts — inline, +1 minute, +4 minutes — with a 10-second response timeout per attempt and immediate terminal `gave_up` after the third failure.
2. **Payment-intent authority (2026-07-16):** the merchant server sends only `{ amount, intentUrl }` to the sk-authenticated Tab mint endpoint; Tab derives all remaining authority and returns a five-minute signed JWS. The pk-authenticated open request contains only `{ intentToken }`.

## Open Questions

1. What is the install command / published package name for `packages/sdk`? R-TAB-1 names the monorepo package path but does not specify the npm registry name or install command a merchant uses.
2. Where does the merchant configure the webhook URL? R-TAB-3 says the Tab server POSTs to "the merchant's configured webhook URL" but does not specify whether configuration is via env var, a Tab SDK init option, a per-intent field, or a separate dashboard. This is the first thing a merchant needs to know after installing the package.
