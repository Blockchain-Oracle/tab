# Story: Agent pays a Tab checkout headlessly (one rail, two payers)
> Traces to: R-RAIL-1, R-RAIL-2; AC-RAIL-1. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As a merchant accepting Tab payments,
I want my payment webhook to fire with the same payload whether the payer is a human using the checkout modal or a Leash agent paying headlessly via x402,
so that my order-fulfillment logic handles both payer types without branching or additional integration work.

---

## Acceptance Criteria

- **[AC-RAIL-1 / R-RAIL-1]** Tab exposes a server endpoint (e.g., `POST /api/pay/x402`) that returns HTTP 402 with payment requirements in V1 exact-scheme shape: `{ x402Version, accepts: [{ scheme: "exact", network: "eip155:42161", maxAmountRequired, asset: USDC_ARBITRUM, payTo: MERCHANT, resource, maxTimeoutSeconds }] }`. The endpoint enforces that the payment goes to the merchant's address on Arbitrum One.

- **[AC-RAIL-1 / R-RAIL-1]** When a Leash agent calls `fetchWithPay(tabCheckoutEndpoint)`, the x402 middleware intercepts the 402 response, completes payment autonomously using the agent's server-held EOA key and USDC float, and the agent receives a 200 response with a settlement receipt. No modal appears. No human input is required. No popup is triggered.

- **[AC-RAIL-1 / R-RAIL-2]** After agent payment settles, the merchant's webhook receives the canonical merged payload: `{ id, type: "payment.settled", livemode, transactionId, tokenChanges[] }`, HMAC-signed (`X-Tab-Signature` header) — structurally identical to a human payment. The Tab server normalizes both the human path (`TransactionResult` from `ua.sendTransaction`) and the x402 agent path (`X-PAYMENT-RESPONSE` facilitator receipt) into this single shape before firing. Source: R-TAB-3, reintegration B-4.

- **[R-RAIL-2]** The merchant's webhook handler does not need to inspect payer type. The payload structure is consistent whether the payer was a human (Tab modal + UA-7702 `sendTransaction`) or an agent (x402 `fetchWithPay`). The merchant's order-fulfillment trigger works identically in both cases.

- **[R-RAIL-1]** The Tab x402 endpoint is optional: disabling it does not affect the human checkout flow. Enabling it does not change what human buyers see.

---

## Scenarios

### Happy path: agent pays Tab x402 endpoint headlessly, webhook fires

```
Given Tab has enabled its x402 endpoint at POST /api/pay/x402
  And the payment requirements specify exact scheme on eip155:42161 (Arbitrum One), USDC, payTo = merchant address
  And the Leash agent's EOA holds sufficient USDC on the required chain to cover the payment
  And the agent's cumulative settled spend will remain below the owner-set cap after this payment
When the agent calls fetchWithPay(tabCheckoutEndpoint)
Then the x402 middleware intercepts the 402 response
  And completes EIP-3009 payment using the agent's server-held key with no human prompt, no modal, and no popup
  And the CDP hosted facilitator performs on-chain settlement on Arbitrum One
  And Tab's server receives the settlement confirmation and returns 200 to the agent
  And the merchant's webhook receives a POST with transactionId and tokenChanges showing USDC credited at the merchant's Arbitrum address
  And the webhook payload is structurally identical to what a human payment would produce
  And the merchant's handler does not branch on payer type
```

### Edge case: agent USDC balance on the required chain is insufficient

```
Given the Tab x402 endpoint requires payment on eip155:42161 (Arbitrum One)
  And the agent's EOA holds zero or insufficient USDC on Arbitrum One at the time of payment
When the agent calls fetchWithPay(tabCheckoutEndpoint) and the x402 middleware attempts to settle
Then the CDP hosted facilitator's on-chain balanceOf(from) check on Arbitrum One fails
  And the facilitator rejects the payment
  And the agent logs a receipt row with status: "failed"
  And the merchant's webhook does NOT fire
  And no USDC leaves the agent's account
```

### Edge case: agent spend cap blocks the payment before any x402 call

```
Given the agent's cumulative settled spend plus the Tab checkout amount would exceed the owner-set cap
When the agent loop evaluates the next payment before calling fetchWithPay(tabCheckoutEndpoint)
Then the payment is NOT submitted — no 402 request is made to the Tab endpoint
  And the blocked attempt is logged separately
  And a Tier 3 interrupt notification is emitted to the owner
  And the merchant's webhook does NOT fire
```

---

## Notes

- **This story is BLOCKED (B-09 + B-04 + B-10).** The agent mainnet x402 path requires: CDP account + API keys (B-09), the funded live spike confirming the buyer-settle path (B-04), and a named x402 demo target (B-10). No plan row for this story may be marked "done" until all three Phase-0 blockers are resolved. The Tab x402 endpoint is buildable now (hand-rolled `POST /api/pay/x402` on Next.js 14 App Router), but a real paid settlement cannot be demoed until the blockers clear. (Spec: R-RAIL-1, reintegration B-8, E-10)

- **The differentiator.** The human checkout path (Tab modal + Magic OTP + UA-7702 `sendTransaction`) and the agent path (x402 `fetchWithPay` with no modal) both settle the same token to the same merchant address on Arbitrum One, and both trigger the same webhook. This is the "one rail, two payer types" claim. The value to the merchant is that their integration is unaffected by who (or what) paid.

- **EIP-3009 / ecrecover: agent must be a key-holding EOA.** Standard USDC v2 rejects EIP-1271 smart-contract signatures. The agent pays as a raw server-key EOA — not as a UA in Smart Account (4337) mode. A UA in 4337 mode cannot sign x402. The agent holds a real USDC balance at its EOA address on the chain named in the 402 requirements; the CDP facilitator checks this balance on-chain before settling. (Spec: Constraint 3, Background §payment rail mechanics.)

- **x402 cannot draw from the chain-abstracted UA balance.** The CDP facilitator's on-chain `balanceOf(from)` check sees only what is held at the agent's EOA on the exact chain specified. The Particle UA's unified balance is invisible to it. If the Particle UA SDK is used to replenish the agent's float, that replenishment happens in a completely separate flow and must not be wired into the x402 payment loop. (Spec: Constraint 2, R-LEASH-6.)

- **Spend cap still applies.** R-LEASH-3 is not scoped away for x402 payments to Tab's endpoint. The agent checks cumulative spend before every x402 call, including this one. (Spec: R-LEASH-3, AC-LEASH-2.)

- **No custom facilitator.** Tab does not run its own x402 facilitator. The CDP hosted facilitator at `https://api.cdp.coinbase.com/platform/v2/x402` handles verification and settlement. Tab is the seller; the Leash agent is the payer. (Spec: Non-Goals §hosting an x402 facilitator.)

- **Arbitrum One is an active CDP facilitator network.** Arbitrum One (`eip155:42161`) is listed as active for the CDP hosted facilitator. This is time-sensitive — re-verify at build time. (Spec: Constraint 9.)

---

## Open Questions

- **Webhook payload normalization across payer types — RESOLVED.** The canonical merged webhook contract (R-TAB-3) answers this. The Tab server normalizes both paths into `{ id, type: "payment.settled", livemode, transactionId, tokenChanges[] }` before firing: for the human path, `transactionId` and `tokenChanges` come from `TransactionResult`; for the x402 agent path, `txHash` from `X-PAYMENT-RESPONSE` maps to `transactionId` and `tokenChanges` is derived from the payment amount + `payTo`. HMAC-signed identically in both cases. Source: reintegration B-4.

- **Agent float chain — RESOLVED.** R-LEASH-1 has been updated: the agent's USDC float is now on Arbitrum One (`eip155:42161`), not Base. This aligns Story 3's general x402 agent path and this story's Tab-as-x402-resource path on a single rail and single float — the agent's Arbitrum USDC covers both. The contradiction between Story-3 (previously Base) and Story-9 (Arbitrum) is closed. (Verify during the Story-9 spike: USDC on Arbitrum One supports EIP-3009 transferWithAuthorization AND the CDP facilitator settles x402 on Arbitrum end-to-end.)

- **End-to-end unverified (spike required before demo).** The combination of Tab acting as an x402 seller (Arbitrum One) and the Leash agent as x402 payer has no prior documented proof. A funded live spike — agent pays Tab's x402 endpoint, CDP facilitator settles on Arbitrum, webhook fires — must succeed before this story is considered validated. No amount of spec or story work substitutes for this. (Spec: OQ-1, research/x402-tab-leash-mechanics.md §3 ⚠️.)
