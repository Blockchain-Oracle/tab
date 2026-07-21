# Stories: Tab + Leash

> Written: 2026-07-02. Source spec: `.thoughts/specs/2026-07-02-tab-leash.md`.
> Individual story files: `story-1-…` through `story-9-…` in this directory.

---

## Index

1. **[story-1-merchant-integrates-tab.md](story-1-merchant-integrates-tab.md)** — Merchant installs one SDK package, drops `<PayButton>`, creates a server-side intent endpoint (amount, receiver, Arbitrum One chainId), and receives a webhook receipt as the order-fulfillment trigger — the Stripe mental model for crypto. (3 scenarios)

2. **[story-2-buyer-pays-by-email.md](story-2-buyer-pays-by-email.md)** — Buyer authenticates with just an email address and a 6-digit Magic OTP, sees a single USD balance, and completes a cross-chain payment without ever encountering the words "chain", "gas", "bridge", or "wallet". (5 scenarios)

3. **[story-3-agent-pays-x402.md](story-3-agent-pays-x402.md)** — The agent's x402-gated MCP tool call or HTTP fetch is intercepted by the Leash MCP stdio proxy (dual-surface: tool-result + JSON-RPC -32042 on MCP; PAYMENT-REQUIRED header + 402+body on HTTP); the hosted signer reads the CAIP-2 network from `accepts[]` and pays from the matching pre-positioned USDC float (Base primary, Arbitrum One); cap gate checks `settled + pending` server-side at `POST /api/agent/sign` before any signature; receipt status enum `pending | settled | failed | blocked`. Polygon excluded from v0. (4 scenarios)

4. **[story-4-owner-sets-cap.md](story-4-owner-sets-cap.md)** — Owner sets a spend cap (amount + reset frequency) from the dashboard, adjusts it mid-cycle; cap gate checks `settled + pending`; blocked and failed payments never inflate the total; Particle UA treasury async-rebalances USDC floats across Base / Arbitrum One in the background as the flagship cross-chain op. BLOCKED (B-04) for the actual rebalance UA op. (6 scenarios)

5. **[story-5-owner-watches-and-notified.md](story-5-owner-watches-and-notified.md)** — Owner watches a reverse-chronological live feed of every x402 receipt (amount, URL, txHash, status) and receives silently tiered alerts: Tier 1 badge-only for routine payments, Tier 2 banner at 75% of cap or an unusual URL, Tier 3 interrupt only when a payment is blocked. (5 scenarios)

6. **[story-6-owner-revokes.md](story-6-owner-revokes.md)** — Owner halts the agent at four escalating levels via `POST /api/leash/revoke` — L1 pause (loop halt, resumable), L2 freeze (signer gate, resumable), L3 cancel (signer_subject revoked at our OIDC layer; Magic has no wallet-delete; named spike B-03 for new-wallet behavior), L4 nuclear (credential chain destroyed; withdraw-first offer; post-nuke floats not recoverable via Leash) — from web or mobile PWA, no on-device signing. (5 scenarios)

7. **[story-7-owner-picks-model.md](story-7-owner-picks-model.md)** — Owner installs the Leash MCP server (or HTTP fetch wrapper) into their agent host config, pastes the Leash API key as the single credential, and verifies that the agent's x402-gated calls auto-pay via the hosted signer — no private key on the agent host, no CA cert required for the primary path. (4 scenarios) _(File renamed in content from "owner picks model"; model-picker content removed — Leash has no LLM.)_

8. **[story-8-flagship-human-crosschain-op.md](story-8-flagship-human-crosschain-op.md)** — Gating live spike: buyer's Magic-email EOA, initialized with `smartAccountOptions: { useEIP7702: true }`, calls `createTransferTransaction` targeting a merchant address on Arbitrum One from funds held only on a non-Arbitrum chain — required to prove the Particle Network flagship track claim. (3 scenarios)

9. **[story-9-one-rail-two-payers.md](story-9-one-rail-two-payers.md)** — Tab exposes an x402 endpoint (Arbitrum One, USDC, exact scheme); a Leash agent pays it headlessly via `fetchWithPay`; the merchant's webhook receives the same `transactionId`+`tokenChanges` payload shape as a human payment — one settlement rail, two payer types, zero merchant branching. (3 scenarios)

---

## Traceability

| # | Story | Traces to (requirement / AC IDs) | Primary user |
|---|-------|----------------------------------|--------------|
| 1 | Merchant integrates Tab | R-TAB-1, R-TAB-2, R-TAB-3, R-TAB-11, R-TAB-13, AC-TAB-4 | Merchant / Developer |
| 2 | Buyer pays by email | R-TAB-4, R-TAB-5, R-TAB-6, R-TAB-7, R-TAB-8, R-TAB-9, R-TAB-10, R-TAB-11, R-TAB-12; AC-TAB-1, AC-TAB-2, AC-TAB-3, AC-TAB-5, AC-TAB-6 | Buyer |
| 3 | Agent pays x402 (interception + multi-chain) | R-LEASH-2, R-LEASH-1, R-LEASH-3, R-LEASH-4, R-LEASH-5; AC-LEASH-1, AC-LEASH-2 | Agent owner |
| 4 | Owner sets cap + async float rebalance | R-DASH-2, R-DASH-5, R-LEASH-3, R-LEASH-1, R-LEASH-6; AC-DASH-2 | Agent owner |
| 5 | Owner watches spend and is notified | R-DASH-1, R-DASH-3, R-LEASH-4; AC-DASH-1, AC-DASH-3 | Agent owner |
| 6 | Owner revokes the agent | R-DASH-4, R-DASH-6; AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1 | Agent owner |
| 7 | Owner connects their agent (MCP / HTTP wrapper) | R-LEASH-2, R-LEASH-1; AC-LEASH-1 | Agent owner |
| 8 | Flagship human cross-chain op | R-TAB-5, R-TAB-7; AC-TAB-2, AC-TAB-5; Constraint 4 | Buyer (flagship proof) |
| 9 | One rail, two payers | R-RAIL-1, R-RAIL-2; AC-RAIL-1 | Merchant |

---

## Consistency check

**Both original contradictions are RESOLVED (2026-07-02). Architecture correction applied (2026-07-02).**

**Contradiction 1 — Agent USDC float chain (Story 3 vs Story 9). RESOLVED (superseded).**
Originally resolved by standardizing on Arbitrum One as the single float chain. Superseded by the corrected multi-chain architecture below.

**Architecture correction — Leash is multi-chain with pre-positioned floats (2026-07-02).**
The single-float-on-Arbitrum assumption has been replaced. Leash pre-positions USDC floats on Base (primary, ~75% of x402 traffic) and Arbitrum One. Polygon is **dropped from v0** — UA SDK V2 removed Polygon rebalance support, leaving Polygon as a money-in / no-money-out dead-end (Constraint 14). Story 3, 4, and the index descriptions have been updated. Story 9 (Tab's x402 endpoint on Arbitrum One) is unaffected.

**Polygon exclusion (2026-07-06).**
All Polygon float references (`eip155:137`, ~8% traffic) are removed. Any build-time float configuration must not include Polygon. (reintegration I-8, Constraint 14)

**Contradiction 2 — Status of a cap-blocked attempt (Story 3 vs Story 5). RESOLVED (updated 2026-07-06).**
The canonical ledger status enum is `pending | settled | failed | blocked` (`settled` replaces `success`; `pending` is added for in-flight receipts). A `blocked` attempt never issued an x402 call; a `failed` attempt issued one and was rejected by the facilitator. Cap gate checks `SUM(settled + pending)`. Stories 3 and 5 updated.

---

## Coverage gaps

Based on the requirement IDs referenced across all 9 stories:

| ID | Where referenced | Gap description |
|----|-----------------|-----------------|
| R-LEASH-2 (MITM path) | Story 7 Notes — MITM proxy + CA cert as opt-in last-resort interception (third method in R-LEASH-2) | No story owns the MITM proxy path in detail; it is noted as an option in Story 7 but no scenario covers CA cert installation or MITM-specific behavior. |
| R-LEASH-5 / R-LEASH-6 threshold | Story 3/4 Open Questions | The minimum float threshold per chain that triggers an async rebalance is not specified in any story; it is referenced only as an open question. |

**Removed gaps (2026-07-02):** The model-picker and OpenRouter requirements (formerly tracked as the model-picker group) are no longer in the spec — Leash has no LLM and no model picker. The old manual float top-up gap has been superseded; async treasury rebalancing is now canonical as R-LEASH-6 and is owned by Story 4.

No other R- or AC- requirement IDs appear orphaned given the IDs visible across the current story set.

---

## Open Questions

Aggregated and deduped from all 9 stories. Prefixed with the originating story number(s).

### Tab integration and token address

**[1, 2, 8] OQ-4 — Which token address on Arbitrum One?**
The Particle quickstart uses USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`); the product description says USDC. The `token.address` in the merchant intent endpoint, the `TOKEN` constant in `createTransferTransaction`, and the `asset` field in the Tab x402 endpoint must all agree. The wrong address produces a silent zero-liquidity failure. Must be confirmed against live Particle UA liquidity before the Story 8 spike runs.

**[1] Webhook delivery timeout and retry policy — CORRECTED (2026-07-16).**
R-TAB-3 specifies exactly three total HTTP attempts: attempt 1 inline after verified settlement, attempt 2 after 1 minute, and attempt 3 after 4 minutes. Each attempt has a 10-second response timeout; a third failure immediately records terminal `gave_up`. There is no 16-minute delay or fourth request. The "≤15 s first-attempt" latency target is internal only — not in merchant-facing docs until confirmed.

**[1] SDK install command / npm package name.**
R-TAB-1 names the monorepo path `packages/sdk` but does not specify the npm registry package name or install command a merchant uses.

**[1] Webhook URL configuration surface.**
R-TAB-3 says the Tab server POSTs to "the merchant's configured webhook URL" but does not specify whether this is an env var, an SDK init option, a per-intent field, or a Tab dashboard setting.

**[2] Insufficient-balance error copy.**
The spec prohibits crypto vocabulary in buyer-facing strings but does not define the exact error message shown when `ua.getPrimaryAssets()` reveals a balance below the payment amount, nor whether the modal quantifies the USD shortfall.

**[2] UA V2 migration buyer-visible state.**
If the buyer's account is on UA V1 and must withdraw before the UA can transact, that interruption is not described. Whether a migration interstitial appears, and what its copy and placement are, is unspecified (Spec Constraint 10).

### Agent payment and float

**[3] OQ-3 — Which x402-gated endpoint does the agent demo against?**
Options are: (a) Tab's own x402 endpoint (Story 9 / R-RAIL-1 path — unverified end-to-end); (b) a known public x402 test API; (c) a minimal demo x402 server the team runs. Decision required before Story 3 can be built or recorded.

**[3, 5] Dashboard polling interval.**
AC-LEASH-1 and AC-DASH-1 express receipt-appearance timing as "within the dashboard's polling interval" but the spec does not define the target value in seconds. The testability of both ACs depends on this being defined.

**[3] Behavior when the USDC float is exhausted (not the cap).**
The spec defines cap-exceeded behavior but does not specify what happens if the agent's on-chain USDC balance on Arbitrum One is insufficient to cover an individual payment independently of the cap. Should this be treated as a failed payment (status `failed`) or a distinct error state with a Tier 3 notification?

**[9] Agent float chain for Tab's x402 endpoint — RESOLVED.**
R-LEASH-1 has been updated: the agent float is now on Arbitrum One (`eip155:42161`), matching R-RAIL-1. No separate float or reconciliation is needed. See Consistency check above.

**[9] Webhook payload normalization across payer types — RESOLVED (2026-07-06).**
R-TAB-3 (canonical webhook contract) answers this: `txHash` from `X-PAYMENT-RESPONSE` maps to `transactionId`; `tokenChanges` is derived from payment amount + `payTo`. Both paths produce `{ id, type, livemode, transactionId, tokenChanges[] }`. See reintegration B-4.

**[9] OQ-1 — End-to-end Story 9 unverified (spike required).**
The combination of Tab as x402 seller on Arbitrum One and the Leash agent as x402 payer has no prior documented proof. A funded live spike must succeed before Story 9 is considered validated.

### Spend cap and dashboard

**[4] Reset-frequency options for cap cycles.**
R-DASH-2 says the cap has "amount + reset frequency" but does not enumerate valid frequencies (daily, weekly, monthly, per-session, manual-reset-only). The cycle-reset logic and cap-setting UI depend on this.

**[4] Cap lowered below current cumulative spend.**
If the owner lowers the cap below what has already been spent in the current cycle, the spec says the new cap takes effect on the next spend-check but does not specify whether already-over-cap spend triggers an immediate Tier 3 notification and block, or only blocks the next payment attempt.

**[4] Minimum and maximum cap values.**
The spec states no floor or ceiling. A $0 cap blocks all payments immediately. Whether the dashboard enforces any guardrails on the input value is unspecified.

**[5] Definition of "unrecognized or unusual resource URL" for Tier 2.**
R-DASH-3 names this as a Tier 2 trigger but does not define the detection mechanism — whitelist, first-seen heuristic, domain pattern matching, or a manual flag. The trigger is untestable without this definition.

**[5] Blocked-attempt visibility in the receipt feed.**
R-LEASH-3 says the agent "logs the attempt"; R-LEASH-4 covers receipt logging for settled payments; AC-LEASH-2 says the blocked attempt is logged. It is not explicit whether blocked-attempt entries appear in the dashboard receipt feed alongside settled rows or in a separate audit log.

**[5] Badge count surface.**
R-DASH-3 references a "badge count" updating on Tier 1 events but does not specify where the badge lives — browser tab favicon counter, in-app unread indicator, PWA app icon badge, or a combination.

### Revocation

**[6] Behavioral distinction between soft pause and freeze.**
R-DASH-4 names both but AC-LEASH-3 only covers soft pause. Is soft pause a scheduler-level loop halt while freeze is a payment-gate check inside a running loop? The implementation distinction must be decided before the backend is built.

**[6] Dashboard state indicators for non-nuclear revocation levels.**
The spec specifies "not provisioned" for the nuclear state (AC-LEASH-4) but is silent on the visual label, badge, or status chip shown while the agent is soft-paused, frozen, or cancelled.

**[6] In-flight payment during revocation.**
What happens to an x402 payment whose outbound HTTP request has already been sent at the exact moment a revoke action is triggered? The spec does not address whether the in-flight payment completes or is abandoned.

**[6] HTTP API shape for the four revocation levels.**
One endpoint with a `level` parameter (e.g., `POST /api/agent/revoke { level: "nuclear" }`) or four separate endpoints? Not specified; shapes both the web and mobile integration.

**[6] Mobile surface — PWA vs Expo.**
The spec marks the mobile surface as "proposed pending Abu's confirm." If the surface changes from PWA to Expo React Native, does the Web Push path for Tier 2/3 notifications change? (Spec OQ-6)

### Agent connection and interception

**[7] MCP server package name and config block format.**
The npm package name and the exact MCP config block format for each supported agent host (Claude Desktop, Cursor, OpenClaude, Claude Code CLI) must be confirmed before the onboarding doc can be finalized.

**[7] API key rotation zero-downtime path.**
When the owner rotates the Leash API key from the dashboard, does the old key immediately stop working or is there a grace period? The agent host's config must be updated with the new key; the zero-downtime rotation path is not specified.

**[7] Connection-verification test resource.**
What x402-gated URL should the onboarding flow direct the owner to hit as a connection-verification call? A dedicated Leash ping endpoint or Tab's x402 endpoint (Story 9)?

### Multi-chain float and rebalance

**[3, 4] Minimum float threshold per chain.**
The async treasury rebalance triggers when a chain's float falls below a threshold, but the threshold value per chain is not specified. Too high a threshold wastes capital; too low risks payment failures during the rebalance window.

**[3] Float-dry behavior when rebalance hasn't completed.**
If the CAIP-2 network in the 402 challenge is e.g. Base but the Base float is empty pending rebalance, should this be status `failed` or a distinct `float-empty` state with a Tier 2/3 notification? Not specified. (Polygon removed from v0 — this question no longer applies to Polygon.)

**[4] Rebalance source and authorization.**
Does the Particle UA treasury rebalance use `ua.createTransferTransaction` (requiring an owner-authorized UA action) or does the Leash server hold a treasury key and rebalance autonomously? If owner authorization is required, the "async background op" claim needs qualification.

### Flagship spike

**[8] OQ-5 — Does `createTransferTransaction(receiver=merchant)` work cross-chain, live?**
This is doc-proven but unverified in any cloned demo. The Story 8 spike result answers this question. If the call fails (e.g., external-receiver cross-chain settlement is blocked by a Particle SDK restriction not in the docs), the entire Tab human-payment story and flagship track claim are blocked.
