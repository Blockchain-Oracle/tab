# Prototype Discovery — Tab + Leash v1 (canonical synthesis)

> Date: 2026-07-06 · Synthesized from 4 raw inspections: `raw/2026-07-06-buyer.md`, `raw/2026-07-06-merchant.md`, `raw/2026-07-06-leash-web.md`, `raw/2026-07-06-mobile.md`
> Governed by: `.thoughts/research/2026-07-06-canton-lessons.md` (all 20 gates) + DECISIONS.md.
> Ground rule: **the prototype is VISUAL LAW ONLY** — tokens, states, spacing, voice are binding; flows and behaviors are engineering decisions. Nothing in this document copies a prototype behavior as a requirement without a reality mapping (see the companion reintegration doc `.thoughts/prototype-reintegration/2026-07-06-tab-v1.md`).
> Skeptic corrections folded in: buyer money-in gap (BLOCKER), demo-page model conflict, unbacked API-key claims, spike-gated label discipline, revocation-semantics contradiction, schema/contract divergence — all resolved here and in the reintegration doc, marked ⚠ where they changed a finding.

---

## 1. Prototype Inspected

- Format: design-tool HTML exports (`support.js` runtime, `<x-dc>` markup, `sc-if`/`sc-for` conditionals, `dc-import` composition). Each `_*.dc.html` is a stateful component driven by an enum `state`/`view` prop; numbered pages are static canvases instantiating every state as a labeled frame. **No inputs, no timers, no network — everything is mocked**; state enums map ~1:1 to product state machines.
- Files: `00 Cover`, `01 Buyer Checkout` (+ `_Buyer Frame`, `_Checkout Sheet`, `_Pay Button`, `_Tab Auth`, `_Tab Demo Page`), `02 Merchant Dashboard` (+ `_Tab Settings/Quickstart/Keys/Transactions/Webhooks/Webhook Log`), `03 Leash Dashboard` (+ `_Leash Overview/Feed/Cap/Connect/Setup/Notifications/Revoke`), `04 Leash Mobile` (+ `_PWA Overview/Feed/Receipt/Revoke`), all under `.thoughts/design/prototype-v1/`.
- Design system (binding visual law): Geist / Geist Mono / Newsreader (demo-brand only); Tab blue `#3B5BD9`, Leash green `#206B4E`, ink `#1C1B18` on paper `#FAF9F6`, amber `#E0A33E`, red `#C13A40`, blocked slate `#2A2925`, frozen steel-blue `#3A6EA5`. Mercury/Ramp/Stripe register — no gradient-crypto anywhere.
- Coverage verdict: **zero surface-map states dropped** on buyer (25/25), merchant (all MA/M states), Leash web (all W states; designer split map-W7 into W7 Connect + W8 Setup & funds — the "W1–W8" cover anomaly is that split, not a missing screen), mobile (all P states). Ban-list scan PASS (one edge: `tokenChanges` in demo-page dev caption).

## 2. Screen Map

| Area | Screens | States |
|---|---|---|
| Buyer SDK | B1 PayButton · B2 Email · B3 OTP · B4 Checkout panel · B5 Success · B6 Errors — one shared sheet (bottom sheet mobile / centered modal desktop) | 25 frames |
| Demo checkout | M1 storefront + PayButton (8 states) | initializing/idle/intent_error/auth_open/auth_cancelled/processing/success/error |
| Merchant auth | MA1 Sign up · MA2 Log in (custom Tab-branded email+OTP card, 11 states each) | incl. EMAIL_ALREADY_REGISTERED, RETURNING_SESSION |
| Merchant dashboard | M2 Quickstart (6 steps + Go-live) · M3 API keys (12 states) · M4 Transactions (+detail slide-over) · M5 Webhooks (11) · M6 Delivery log (6) · M7 Test/Live + Go-Live modal · MA3 Settings (8) | shell: sidebar, TEST/LIVE control, test banner |
| Leash web | W1 Overview (10) · W2 Feed (8) · W3 Receipt detail (5) · W4 Cap & limits (9) · W5 Notifications (7) · W6 Revocation (12) · W7 Connect (5) · W8 Setup & funds (9) | 7-item sidebar nav |
| Mobile PWA | P1 Overview (9) · P2 Feed (7) · P3 Receipt sheet (3) · P4 Push compact · P5 Push expanded · P6 Revoke sheet (9) | 3-tab bar; Controls = sheet overlay |

## 3. User Flows

1. **Buyer pays by email**: merchant page → PayButton (intent fetched at mount, re-validated at click) → sheet: email → OTP (auto-submit 6th digit) → balance ("$X available", one USD number) → Pay → optimistic success + `Reference #TAB-XXXXX` + explicit close. Returning session skips B2/B3. ⚠ Skeptic BLOCKER: the drawn flow presupposes a funded buyer — **no money-in surface exists anywhere**; INSUFFICIENT_BALANCE is a dead-end terminal state (exits only Cancel/re-check). Fixed in reintegration: new surface B4-6 "Add funds" (buyer's real UA address + copy) or explicitly labeled roadmap line — Abu decision D23.
2. **Merchant onboards**: signup (Magic OTP, custom card) → Quickstart: install SDK → create secret key (show-once) → intent endpoint → PayButton → webhook (+secret show-once) → test payment on **the merchant's own demo page** → Go-Live checklist → live. ⚠ Skeptic MAJOR resolved: the per-merchant demo page (merchant raw DP-1) is canonical; the payments raw's single platform `/demo` tenant model is superseded. Atlas survives only as a labeled platform-operated tenant provisioned through the real signup code, serving as the public marketing showcase.
3. **Agent owner connects**: Leash dashboard signup → provision agent (dashboard click → Magic TEE wallet; the drawn `npx leash provision` CLI is CUT) → generate `leash_sk_` key (show-once) → copy `.mcp.json` snippet → agent hits x402 paywall → Leash pays within cap → receipt streams into feed. ⚠ The drawn snippet has no upstream-server argument — as drawn only the `paid_fetch` path is reachable; snippet/docs gain an optional `--upstream <url>` arg (recorded deviation).
4. **Owner monitors + revokes**: spend bar (green→amber→red, hatched overage) → notifications (Alert 75% / Action required on block) → revocation L1 pause / L2 freeze / L3 cancel (typed CANCEL) / L4 nuclear (type name + 3s hold on mobile). Every revoke = HTTP call, nothing signed on device.
5. **Mobile push loop**: T2/T3 web push → deep link into PWA (overview / receipt / revoke sheet); lock-screen Revoke = L1 soft pause via service worker (Android only; iOS has no action buttons).
6. **Money loop** (gate 10): merchant settlement is non-custodial (USDC lands at the merchant's own Arbitrum address — nothing to withdraw from Tab); Leash floats get a **new Withdraw surface** (money-out, not drawn — added); buyer money-in per flow 1 ⚠.

## 4. Revealed Product Requirements (nobody specced; the pixels imply them)

1. Server-side **reference-code scheme** `TAB-XXXXX` ↔ transactionId, minted at checkout open, shown to buyer (B5-2) and merchant (M4) for support correlation.
2. **Buyer money-in surface** (⚠ skeptic BLOCKER): insufficient states must surface the buyer's real UA deposit address with honest "add USDC on a supported network" copy, or carry a labeled roadmap line — never a dead end.
3. **Buyer receipt email** asserted in success copy — requires real email infra or the line is CUT (Blocker B-07).
4. **Per-merchant demo page** rendered from the signed-in merchant's own row + pk_test; order numbers generated per order (prefix derived from tenant name at runtime — never a compile-time `ATL-` constant ⚠).
5. **Quickstart progress engine**: auto-detected steps (key created, first test payment, webhook configured) + manual "Mark done" for steps 1/3/4 (affordance not drawn — added); masked-key injection derived from the real key.
6. **Secret-key API plane** (⚠ skeptic MAJOR): the drawn `const tab = new Tab("sk_test_…")`, "Sending access" permissions copy, and LAST USED stamping have **no sk-consuming endpoint behind them in any raw**. Proposal: minimal real plane `GET /api/v1/payments` + `GET /api/v1/payments/:id` (sk-auth, stamps `last_used_at`), `new Tab()` as its thin client, permissions copy rewritten to real enforced capabilities ("Full access" / "Read-only — list and read payments"). Alternative: rewrite snippet + copy. Abu decision.
7. **Go-Live gating**: real boolean derivations (live secret key exists; webhook `verified_at` set by a successful test webhook; test settlement count > 0); warn-and-allow proposed.
8. **Webhook verification** ("verified", "Listening"): test webhook = honestly labeled signed test payload (`type:"test"`, `livemode:false`) recorded as a delivery row; "Listening" = named derivation from delivery records.
9. **Payer identity**: payer_type (human/agent) per payment; merchant-visible buyer email is a privacy decision (D5) — derived server-side from validated DID only, never client-supplied.
10. **Withdraw float** (Leash money-out) + pre-nuclear "withdraw first" offer (B-13).
11. **Agent naming input** at provisioning (source of the L4 typed confirm string).
12. **Origin field replaces TRIGGER URL**: a trigger URL is not truthfully capturable in a stdio proxy; receipts carry `{client, tool, transport}` instead (CUT + replacement).
13. **Notification store semantics**: unread/sticky/resolved (T3 resolves on its remedial event, never a timer), badge = unread T2+T3, first-seen-domain heuristic, "Mark all as read".
14. **Canonical chip strings** across web+mobile ("Cancelled — provisioning required" long form everywhere).
15. **Test-mode labeling on the buyer sheet** when the merchant is in test mode (gate 20).
16. **Cap display rule** (⚠ skeptic): gate counts settled+pending; the bar shows settled with an explicit "+$X pending" segment so the displayed number always explains a block.
17. **Unified-balance display** beside the top-up control ("Your unified balance: $X — includes floats") — the owner-treasury number the prototype dropped (D1) is restored there.
18. Sign-out, login-with-unregistered-email state, key rotate/delete flows, secret regenerate flow, filter popovers, detail-panel loading states — all referenced-but-undrawn; added as engineering-designed states within visual law.

## 5. Revealed Technical Requirements (verified where cited)

1. **Magic headless email OTP is real**: `loginWithEmailOTP({ email, showUI:false, deviceCheckUI:false })` + event handle (`email-otp-sent` / `verify-email-otp` / `invalid-email-otp` / `cancel`) — `Reference/magic-docs/embedded-wallets/.../email-otp.mdx:18`, `javascript.mdx:108-261`. The one-container sheet and custom merchant auth card are buildable as drawn. No resend event exists (resend = cancel + re-initiate); expired/rate-limit event mapping (unverified — spike). Edits DECIDED R-TAB-4 → **PROPOSED, needs Abu sign-off** (⚠ process fix: the payments raw's "RESOLVED" wording was unilateral).
2. magic-sdk ≥30: owner address = `getInfo().wallets.ethereum.publicAddress` (javascript.mdx:915); `magic.wallet.sign7702Authorization` exists ≥33.4.0 (javascript.mdx:757-777); `magic.user.isLoggedIn()` documented.
3. **UA SDK 2.0.3 pinned facts** (eco-particle-magic): nested `smartAccountOptions{useEIP7702:true,…}` only; `universalGas` and flat `ownerAddress` REMOVED; `createTransferTransaction`/`sendTransaction(tx,sig,authorizations)` intact; **Polygon GONE from UA V2** (6-chain CHAIN_ID); UA-V1 migration interstitial permanently dead.
4. **USDC (EIP-3009, 6 dec) triple-confirmed** (eco-x402 §5): Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Arbitrum One `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, Polygon `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`.
5. **x402 v2 wire**: `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` headers; v1 = 402 + JSON body (no `X-PAYMENT-REQUIRED` header exists — story-3 AC is wrong); MCP challenges on TWO surfaces (tool-result + JSON-RPC `402`/`-32042` SEP-1036) — `@x402/mcp@2.17.0` helpers confirmed.
6. **Mainnet settlement needs the authenticated CDP facilitator** (Base/Arbitrum/Polygon ACTIVE; keys required; open `x402.org/facilitator` is Base-Sepolia-only) — corrects "CDP not needed" for the seller leg, matching DECISIONS' own carve-out.
7. `@x402/next@2.17.0` peer-requires Next ≥16.2.6 → Tab's x402 endpoint on Next 14 must hand-roll via `x402ResourceServer` from `@x402/core/server` (D7 decision).
8. **Magic Express API**: `POST /v1/wallet` idempotent per user+chain; `/v1/wallet/sign/eip7702` (dec→hex r/s); **NO per-wallet delete or rotate endpoint exists** (verified absent in clone `45d1eb2`); custom OIDC issuer registration is supported — `POST /v1/identity/provider {issuer, audience, jwks_uri}` (`Reference/magic-docs/server-wallets/express-api/identity-provider.mdx`) ⚠ (skeptic-verified citation the raws lacked). Free-tier Express provisioning (unverified — confirm at first provision). ⚠ Which Express endpoint reproduces `personal_sign(rootHash)` semantics is **contradicted across raws** (`sign/message` vs `sign/data`) and (unverified) — named spike item; canonical claim: try `sign/message`, fall back to `sign/data` over the EIP-191 digest we compute.
9. **MCP `clientInfo {name,version}`** is in the initialize schema (sdk 1.29.0 `types.d.ts:674`); exact strings sent by Claude Code/Cursor (unverified) — render raw with "Unknown client" fallback. Pin `@modelcontextprotocol/sdk@^1.29.0`; ignore v2 beta.
10. **Web Push platform limits**: title/body/icon only (P5 detail rows flattened to body text); per-tier icon colors/red border are in-app only; iOS = installed PWA 16.4+, no action buttons (lock-screen Revoke is Android-only).
11. PayButton variable-height contract (48→~76px with helper text); responsive sheet container; explorer URL builder keyed by CAIP-2; live countdowns/balance interpolation require fully data-driven sheet copy.
12. ⚠ **Chain-verified settlement decomposes into three parts** (skeptic): (a) inline verification kicked by the client's PATCH report (primary — meets latency targets without cron), (b) cron sweep backstop at honest cadence (Vercel Cron ≈ 1/min; a 3s cadence is impossible there — any "≤15s webhook" figure stays an internal target contingent on decision D3), (c) an explicit correlation strategy: primary = Particle transaction lookup / TransactionResult dest-hash (unverified — spike); fallback log-scan MUST disambiguate by the buyer's known UA sender address, never amount+window alone (two same-amount payments would misbind a judged Arbiscan link).

## 6. Data Model Candidates (canonical — supersedes all four raws' divergent schemas ⚠)

One schema; every matrix row in the reintegration doc re-points to these names.

**Identity (decision DQ-6):** `users` — id, email (citext UNIQUE), magic_issuer, created_at. One email = one principal across Tab-merchant and Leash-owner; one session cookie serves both dashboards. (Alternative: two isolated apps — Abu picks.)

**Tab:** `merchants` (id, user_id FK, business_name, logo_url, receiving_address, receiving_address_source enum(magic_default|custom), live_activated_at, created_at) · `api_keys` (id, merchant_id, name, type enum(secret|publishable), permissions enum(full|read_only), env enum(test|live), prefix, last4, secret_hash — SHA-256, NULL for pk, created_at, last_used_at, revoked_at, rotated_from_id) · `payments` (id, **ref_code UNIQUE** — minted at open, merchant_id, env, amount_usd, currency, token_chain_id 42161, token_address, receiver — denormalized, intent_url, payer_type enum(human|agent), payer_email nullable (D5), payer_address nullable, status enum(created|processing|settled|failed), failure_reason, created_at, settled_at) · `settlements` (id, payment_id FK UNIQUE, particle_transaction_id, tx_hash, token_changes_json, amount_atomic, verification_method enum(rpc|particle|x402_receipt|simulated_test), livemode, verified_at) · `webhook_endpoints` (…, secret_ciphertext AES-GCM recoverable, secret_last4, verified_at, deleted_at) · `webhook_deliveries` (endpoint_id, settlement_id nullable, type enum(payment|test), trigger enum(auto|manual), attempt, status_code, result enum(delivered|retrying|failed|timeout|gave_up), request_body, signature_header, response_body_snippet 500, response_time_ms, next_retry_at, parent_delivery_id) · `quickstart_progress` (merchant_id, step_key, done_at, source enum(auto|manual)) · demo-shop `orders` (order_number generated per order, payment_ref).

**Leash:** `agents` (id, owner_user_id FK, name, status enum(**not_provisioned|active|paused|frozen|cancelled|nuked**), signer_subject — OIDC sub, agent_address, provisioned_at, client_name, client_version, transport, first_seen_at, last_seen_at) · `leash_keys` (key_hash sha256, prefix `leash_sk_`, last4, created_at, revoked_at, last_used_at, last_auth_failure_at/_code) · `caps` (agent_id, amount_usd_cents nullable, frequency enum(daily|weekly|monthly|never)) · `cap_cycles` (agent_id, started_at, ended_at, reset_reason enum(schedule|manual|frequency_change)) · `receipts` (agent_id, cycle_id, status enum(**pending|settled|failed|blocked**) — canonical, replaces leash-core's `success` ⚠, reason enum(CAP_EXCEEDED|FLOAT_EMPTY|SIGNER_REJECTED|FACILITATOR_REJECTED|UNSUPPORTED_NETWORK), amount_atomic, amount_usd_cents, asset, network_caip2, intended_network_caip2 — blocked rows, resource_url, tx_hash, origin_kind enum(mcp|http), origin_detail, cumulative_after_cents, created_at, settled_at) · `connections` (folded into agents columns) · `floats` (agent_id, network_caip2, target_usd, last_balance_atomic, read_at — cache only, never a judged-surface source) · `rebalance_ops` (canonical name ⚠, kind enum(auto|manual_topup|withdrawal), to_network_caip2, dest_address, amount_usd_cents, ua_transaction_id, status enum(pending|settled|failed)) · `notifications` (tier enum(2|3), type enum(cap_75|cap_blocked|unusual_domain|cap_lowered_halt|float_low|float_empty) — merged union ⚠, message, meta, receipt_id, sticky, read_at, resolved_at) · `push_subscriptions` · `agent_events` (single audit trail: provision|pause|resume|freeze|unfreeze|cancel|nuclear|key_create|key_rotate|topup|withdraw, actor_surface enum(web|pwa|push_action)).

## 7. API And Event Candidates (canonical route inventory ⚠ — one set, replaces divergent raws)

**packages/sdk (`@tab/sdk`)**: `<PayButton intentUrl publishableKey onSuccess(transactionId, tokenChanges) />` (publishableKey is a NEW required prop) + proposed `new Tab(secretKey)` thin client (`tab.payments.list()/retrieve()`).

**Tab backend (`apps/web/app/api/...`)**
- `POST /api/auth/precheck` · `POST /api/auth/verify` (DID → session) · `POST /api/auth/logout`
- `POST /api/v1/payments` (pk auth; create-at-open → `{paymentId, refCode}`; validates receiver == tenant's registered address)
- `PATCH /api/v1/payments/:id` (client report: `{transactionId, tokenChanges, buyerDidToken}` or failure; server validates DID, kicks **inline** chain verification)
- `GET /api/v1/checkout-context` (pk auth → `{businessName, logoUrl, mode}`)
- `GET /api/v1/payments` + `GET /api/v1/payments/:id` (**sk auth** — the minimal real key plane, stamps last_used_at; PROPOSED)
- `GET /api/internal/settle-sweep` (cron backstop) · `GET /api/internal/webhook-dispatch` (cron)
- Merchant dashboard routes: `/api/keys` (+`/:id/rotate`, DELETE), `/api/webhook-endpoint` (+test/regenerate-secret/DELETE), `/api/transactions`, `/api/webhook-deliveries` (+`/:id/resend`), `/api/merchant` (PATCH, logo), `/api/quickstart/steps/:key/complete`, `/api/mode/go-live`
- Demo: `/demo` (session-scoped per-merchant page) + `GET /api/demo/intent` + demo webhook receiver; public showcase = the labeled Atlas tenant's page on the same code path (proposed `/store/[slug]`)
- Tab-as-x402-resource: `POST /api/pay/x402` (hand-rolled 402 route via `x402ResourceServer`; CDP facilitator verify/settle; writes `payments` rows payer_type=agent)

**Webhook contract (merged ⚠)**: `POST {url}` — headers `Content-Type: application/json`, `X-Tab-Signature: t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<rawBody>")>`; body `{ id: "evt_…", type: "payment.settled"|"test", livemode: bool, transactionId, tokenChanges[] }`. Retries ≤3 at 1m/4m/16m, 10s timeout, terminal gave_up. Fires only after chain-verified settlement. First-attempt latency: inline dispatch after inline verification (internal target ≤15s; **not merchant-facing copy until D3 is decided** ⚠).

**Leash owner APIs**: `POST/GET /api/leash/agent` (provision, name) · `POST /api/leash/keys` (+rotate) · `GET|PUT /api/leash/cap` · `POST /api/leash/cycle/reset` · `GET /api/leash/receipts?cursor=` (+`/:id`) · `GET /api/leash/floats` · `POST /api/leash/topup` · `POST /api/leash/withdraw` · `GET /api/leash/rebalances` · `GET /api/leash/notifications` (+read/read-all) · `POST /api/leash/revoke {level, action}` · `GET /api/leash/connection` · `GET /api/leash/overview`.

**Leash agent-plane APIs (Bearer `leash_sk_`) — remote-signer model is canonical ⚠** (resolves the E3/E6-vs-`/api/agent/pay` architecture contradiction):
- `POST /api/agent/connect` (canonical name; `hello` superseded) — handshake `{clientInfo, transport}`
- `POST /api/agent/sign` — `{typedDataOrDigest, paymentContext{acceptsEntry, amount, network_caip2, resource_url, origin}}` → gates **status (423) → cap settled+pending (403 `LEASH_CAP_EXCEEDED`, writes blocked receipt) → float (409 `LEASH_FLOAT_EMPTY`, writes failed receipt)** → Magic TEE sign → writes pending receipt → returns signature. The x402 client logic (accepts[] parsing, scheme registration, v1/v2, retry `_meta`) runs in the proxy/wrapper via `x402Client` + `ExactEvmScheme(remoteSigner)`; `remoteSigner.signTypedData` = this endpoint. `POST /api/agent/pay` (backend-builds-payload) is dropped from the inventory.
- `POST /api/agent/pay/result` — `{receiptId, settlementHeader}` → pending → settled|failed.
- Internal: `POST /api/internal/rebalance` · OIDC: `GET /.well-known/jwks.json` + JWT issuance (own workstream — see §10).

**Push events**: T2 (cap_75, unusual_domain, float_low) and T3 (cap_blocked, cap_lowered_halt) via `web-push` VAPID; payload `data.url` deep links (`/m`, `/m/receipts/:id`, `/m?sheet=controls`).

## 8. Auth, Permissions, And Security Implications

- Buyer + merchant + owner auth = Magic email OTP headless; server session = `@magic-sdk/admin` `token.validate` + `getMetadataByToken` → jose session cookie. No demo accounts, no persona jumps, no impersonation anywhere (gates 3/7 verified across all four raws).
- Key material: API keys SHA-256 hash-at-rest, show-once; webhook `whsec_` **encrypted-at-rest (AES-GCM, recoverable — Tab must sign with it)**, show-once (recorded deviation from hash-at-rest); leash keys hash-at-rest, show-once.
- sk permissions middleware must enforce exactly what the permissions copy names (⚠ no fabricated capability — see §4.6).
- Anti-receiver-swap: `POST /api/v1/payments` validates intent receiver against the tenant's registered receiving address.
- Hosted signer: Magic Server Wallet TEE; the cumulative cap 403 is **our backend logic in front of the TEE call** — pitch copy must say "Leash's signing service (backed by a Magic TEE wallet)", never that the TEE computes cumulative spend. Magic Policy Evaluation = optional per-tx defense-in-depth (REAL_LATER).
- Self-hosted OIDC issuer is **its own subsystem** (⚠ skeptic): jose JWTs + JWKS endpoint + `POST /v1/identity/provider` registration + synthetic agent-subject scheme + token lifetime handling; first item of the keys spike.
- Service-worker Revoke needs a client-persisted session credential usable from SW context + idempotent pause; session-expiry tap → login (no dead end).

## 9. State And Edge Cases

- Dead-end audit (gate 16): every rejection state names its exit — INSUFFICIENT_BALANCE → **Add funds (B4-6, new)** ⚠ / Cancel; CANCELLED → Provision new key; NOT PROVISIONED → Set up agent; nuked → Provision new agent; login-unknown-email → "Sign up instead" (added); session-expired push tap → login.
- Network-kill rule (gate 6): PROCESSING must land in a real error/pending state; poll failure grays the "Live" pulse and shows "Couldn't refresh… last loaded"; no fixed timers anywhere; presentation beats set minimum durations only.
- Pending semantics: buyer PROCESSING exits only on real resolve; Leash Pending = signed/submitted awaiting PAYMENT-RESPONSE (**no txHash until settle** — the drawn pending-with-hash row is CUT); pending receipt detail added.
- Overage: bar renders >100% solid-to-cap + hatched; settled spend never clawed back; mid-cycle lower ⇒ immediate halt + T3.
- Cap display vs gate (⚠ resolved): gate = settled+pending committed total; bar = settled + explicit pending segment; blocked-math copy computed from the committed total, so the visible numbers always explain a 403.
- NO CAP SET default flipped: **no cap ⇒ no payments** (signer refuses; banner "Set a cap to enable payments") — safety default, Abu may overrule (DQ).
- Offline (mobile): real `navigator.onLine` + cached last-fetch timestamp; STALE pill; controls hard-disabled.
- Blocked receipts store + display `intended_network_caip2` ("Base (target)") on web and mobile alike.
- Failed-with-txHash (on-chain revert) renders hash + Failed pill (undesigned combo handled).
- Post-nuclear balance: P1's drawn $0.00 is fabricated — real reads + honest stranded/withdraw note (DR-6b) ⚠; floats are NOT withdrawable through Leash after credential destruction (corrects leash-core E34's contradiction) — hence the pre-destruction "Withdraw first" offer (B-13).

## 10. Target-stack Translation

- Monorepo (pnpm + Turborepo): `packages/sdk` (@tab/sdk PayButton + Tab client) · `packages/leash-mcp` + `packages/leash-fetch` (published thin clients — the re-scoped "apps/agent"; hosted-signer client, cap gate, ledger, cycle engine, rebalancer live in `apps/web` server code + cron) · `apps/web` (Next.js 14 App Router: checkout, Tab API, merchant dashboard, Leash dashboard, agent-plane API, OIDC issuer, crons) · `apps/mobile` = PWA routes within apps/web (`/m/*`) + manifest + SW.
- Next 14 kept; Tab's x402 endpoint hand-rolled on `x402ResourceServer` (D7; `@x402/next` needs Next 16).
- Pinned: `@particle-network/universal-account-sdk@2.0.3`, `magic-sdk@33.9.0`, `@magic-sdk/admin`, `@x402/{core,fetch,evm,mcp}@2.17.0`, `@modelcontextprotocol/sdk@^1.29.0`, `viem@^2.48`, `jose`, `zod`, `web-push`, Drizzle + Postgres (Neon/Supabase — DQ), Vercel Blob (logos, DQ).
- Scheduler: Vercel Cron (1/min honest cadence) + inline verify/dispatch as the primary latency path; QStash only if D3 wants tighter guarantees.
- Six decomposed Leash pay-loop subsystems for the plan (⚠ skeptic): proxy pass-through server · dual-surface 402 detection · remote-signer transport+auth · backend gate + receipt write · receipt finalization protocol · leash-fetch wrapper parity. Plus: OIDC issuer workstream; chain-verified settlement workstream (inline + sweep + correlation).

## 11. Mocked Prototype Surfaces (consolidated register — every fabricated value)

Identity/tenants: `Atlas Coffee Roasters`, `dev@atlascoffee.com`, `atlas-mark.png`, avatar "A" · buyer `maya.chen@example.com` · owner "Abu / abu@example.dev" · agent "Research Agent v2".
Money: balance `$847.32`, `$12.00`, `$8.50`/"$3.50 short", spend `$4.20/$7.60/$10.00` vs `$10.00` cap, floats `$24.80/$3.50/$0.00/$23.50` + per-chain sets, top-up `$20.00`, `+$6.00 arriving`, treasury breakdown "Base 14.20 · Arb 6.10 · Pol 4.50".
Codes/keys: OTP `482913`, ref `TAB-7B4A2`, order `ATL-2214`, `sk_test_…a3f9`/`f9q2`/`pk_test_…d114`/`sk_live_…b7c2`/`pk_live_…m3x8`, full `sk_test_9wKpQ2…`, `whsec_…k2f7` + full, `leash_sk_9wKpQ2…q4d8`, `X-Tab-Signature: t=1783088581,v1=5f2a…9c4d`.
Chain: receiving `0x1a2b…cd9e`, agent `0x7F3a…9C4e` (+full), fake txids `0x8f2e…1b7d`, `0x4b7c…e29a`, `0x3c9a…e42f`, `0x7d1b…a93c`, `0x5e4f…c810`, `0x2a6c…9d5e`, `0x9b3d…f7a1`, `0x6c8e…2b4a`, `0x1f7c…d34e`, fake full 64-hex, `USDC_ARBITRUM` placeholder.
Fake resource domains: `api.searchgrid.io`, `data.arxival.net`, `api.mapgrid.dev`, `translate.lexiconapi.com`, `feeds.newswire.dev`, `premium.datamall.xyz`, trigger `research.lab/tasks/lit-review-142`.
Misc: webhook URLs `api.atlascoffee.com/webhooks/tab(-v2)`, latencies 342/301/289ms, "Next retry in 4 min", `{"ok":true,…}` body, "23 this cycle", "First seen Jul 2 14:02", "401 invalid key at 14:31", "last rotation Jun 12 2026", timestamps `2026-07-02T14:23:01Z`, "9:41" status bars, lock-screen chrome, pre-typed confirm inputs, `npx leash provision`, `@leash/mcp`, invented demo copy (Yirgacheffe product).
Cross-screen mock inconsistencies (proof of the two-sources-of-truth risk): `0x7d1b` "Pending" in M4 vs "404 gave up" in M6; key-reveal last4 a3f9 vs f9q2; `0x9b3d` in log but not in transactions; intent host `api.atlascoffee.com` vs `atlascoffee.com`; W8 index caption "on Arbitrum One" vs component "across three networks"; P2 row-order bug; P6 "Cancelled" vs P1 long chip.
**Disposal of every one of these is in the reintegration doc §Mocked Prototype Surface Register — no orphans.**

## 12. Required Prototype Reintegration

Done — see `.thoughts/prototype-reintegration/2026-07-06-tab-v1.md` for the full screen-to-reality matrix, labels, blockers, and gate decision. Summary of what reintegration had to resolve beyond the raws: the buyer money-in surface, one canonical backend contract (payments lifecycle, webhook schema, demo-page model, sk plane), one Leash pay-loop architecture, one revocation model + spike item, uniform spike-gated labeling (BLOCKED everywhere), one cap accounting rule, unified enums/routes/tables, and an executable showcase-constants grep gate.

## 13. Spec Deltas (PROPOSALS for Abu — nothing edited by me)

- **SD-A (R-TAB-4, DECIDED row — needs sign-off)**: Magic auth = headless `showUI:false` white-label events for buyer B2/B3 AND merchant MA1/MA2 (capability verified). `deviceCheckUI:false` required alongside.
- **SD-B (R-TAB-4)**: owner address = `getInfo().wallets.ethereum.publicAddress` (magic-sdk ≥30).
- **SD-C (R-TAB-5 + all init snippets)**: UA SDK 2.0.3 — nested `smartAccountOptions` only; no `universalGas`; no flat `ownerAddress`.
- **SD-D (R-TAB-7)**: 7702 authorization via `magic.wallet.sign7702Authorization` + our serialization adapter to `EIP7702Authorization{userOpHash, signature}` (exact serialization verified at spike).
- **SD-E (OQ-4/OQ-B3/OQ-M2)**: settlement token = native USDC on Arbitrum One `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.
- **SD-F (new)**: canonical Tab payment lifecycle — create-at-open (`POST /api/v1/payments`, pk auth, mints ref_code) + `PATCH` report carrying `buyerDidToken` + server-side chain verification before `settled` + inline webhook dispatch; the browser is never trusted for fulfillment.
- **SD-G (R-TAB-3/AC-TAB-4)**: webhook contract as in §7 (adds `id`/`type`/`livemode`; `t=,v1=` HMAC; 3 attempts 1m/4m/16m; latency figure internal-only pending D3).
- **SD-H (new)**: publishable keys, auto-provisioned at signup; required `publishableKey` PayButton prop.
- **SD-I (new, PROPOSED)**: minimal secret-key API plane (payments list/retrieve, last_used stamping) + permissions copy rewritten to real capabilities; `new Tab()` = thin client. (Alternative: cut snippet + copy.)
- **SD-J (new)**: buyer money-in — insufficient states surface the buyer's real UA address with honest deposit copy (new state B4-6), or an explicitly labeled roadmap line; recorded as deviation D23 either way.
- **SD-K (R-LEASH-3 wording)**: 403 is Leash's signing service in front of the TEE; Magic Policy Evaluation optional defense-in-depth.
- **SD-L (R-LEASH-1/5/6)**: Polygon leg contingent on B-11 (UA V2 dropped Polygon); if kept as pay-only, deposit surfaces must carry a "no v0 withdrawal from Polygon" label (money-in with no money-out is a rule-10 violation otherwise).
- **SD-M (R-LEASH-4)**: `trigger URL` → `origin {client, tool, transport}`; receipts enum `pending|settled|failed|blocked`; blocked rows store intended network.
- **SD-N (new)**: Leash remote-signer architecture + `POST /api/agent/sign` wire contract (§7); cap gate counts settled+pending; display rule per §9.
- **SD-O (revocation)**: L3/L4 = signer_subject revocation/destruction at OUR credential layer (Magic has no wallet delete/rotate endpoint — verified absent); whether a fresh OIDC subject yields a NEW TEE wallet for the same owner is (unverified) — named spike item with BOTH copy sets pre-authored; L4 offers "Withdraw first" before destruction; post-nuke floats are NOT withdrawable via Leash.
- **SD-P (new)**: Leash owner auth (Magic OTP, multi-tenant) — unstated in spec; float money-out (Withdraw) requirement; agent naming; cap-unset default = no payments.
- **SD-Q (stack)**: Postgres + Drizzle persistence layer; apps/agent re-scoped to published client packages; CDP keys required for the seller leg (DECISIONS carve-out); scheduler decision D3.
- **SD-R (copy honesty set)**: "You have not been charged" gated to pre-broadcast error classes; W1 server-key caption → "Held in a secure enclave (TEE)"; L1 copy → payments-stop phrasing; test-money labels per gate 20 wherever a testnet leg ships.

## 14. Story Deltas (PROPOSALS)

- Story-1: OQ1/OQ2/OQ4 answered by SD-F/SD-G (webhook config in dashboard; retry policy; latency contingent on D3). OQ3 → package `@tab/sdk` pending npm availability (B-08). OQ5 → USDC (SD-E).
- Story-2: OQ1 → USDC; OQ3 (UA-V1 interstitial) dead — SDK 2.0.3 treats all accounts as V2. New scenario: buyer insufficient-funds → Add-funds surface (SD-J).
- Story-3: AC citing `X-PAYMENT-REQUIRED` header corrected (v2 `PAYMENT-REQUIRED` / v1 body); MCP detection must cover `-32042` + `402` JSON-RPC surfaces; ledger enum gains `pending`; FLOAT_EMPTY = failed+reason, not a new status.
- Story-4: OQ1 → frequencies Daily/Weekly/Monthly/Never (+ manual reset); OQ2 → mid-cycle lower = immediate halt + T3, settled spend retained.
- Story-6: pause = agent-plane halt, freeze = signer-gate block (two real enforcement points); revocation model per SD-O.
- Story-7: rename `story-7-owner-picks-model.md` → `story-7-owner-connects-agent.md` (dead model-picker concept in filename).
- Story-9: payload normalization answered (facilitator txHash → settlements.tx_hash; same webhook shape both payer types); CDP keys prerequisite named.
- New story scenarios: withdraw float; merchant demo page as integration test; test-webhook verification; quickstart mark-done.

## 15. Plan Deltas (PROPOSALS)

- Phase 0 = the 14 blockers (reintegration §Blockers) run in parallel before/alongside any build.
- Build order (golden-loops-first): (1) funded buyer-settle spike (Task #2) → (2) merchant loop (auth → keys → webhooks → test-mode payment) → (3) Leash control plane + interception → (4) agent pay loop vs named x402 target → (5) PWA/push. The flagship money-movers may not appear in any plan step as "buildable-done" until the spike report exists.
- Decompose into named workstreams: OIDC issuer; chain-verified settlement (inline+sweep+correlation); the six Leash pay-loop subsystems; webhook scheduler.
- Aggregate scope statement (one page) precedes the plan so Abu approves the true total: 2 dashboards, buyer SDK, 2+1 published npm packages, MCP proxy, PWA + push, OIDC issuer, cron workers, ~20 tables.

## 16. Quality Profile Deltas (PROPOSALS)

- **Executable showcase-constants grep gate** (CI + rule-14 audit): extend beyond "atlas" to the full §11 list — `atlas|ATL-|maya\.chen|atlascoffee|searchgrid|arxival|mapgrid|lexiconapi|newswire|datamall|research\.lab|Research Agent v2|0x7F3a|TAB-7B4A2|482913|9wKpQ2|abu@example|0x8f2e6c1a|1783088581|leash provision` — zero hits outside explicitly-labeled demo sample-content files. (Runtime-derived tenant prefixes are exempt; compile-time constants are not.)
- Seed-free boot check: delete all seed state; app boots; golden loop works (gate 5).
- Network-kill test in CI e2e where feasible (gate 6).
- Machine-readable matrix schema gains `CUT` in its label enum (leash-core's CUT-as-OUT_OF_SCOPE encoding is lossy for the deviations register — fixed in the canonical matrix).
- Package pins as in §10; no `@modelcontextprotocol/server` v2 beta.

## 17. Open Questions (for Abu — consolidated)

1. Buyer money-in: ship the Add-funds surface (recommended) or labeled roadmap line? (SD-J / D23)
2. sk API plane: build the minimal payments read API (recommended) or rewrite quickstart snippet + permissions copy? (SD-I)
3. Payer email visible to merchants? (D5 — Stripe precedent exists; fallback = payer address only)
4. Receiving address: default to merchant's Magic EOA + editable? (D1)
5. Identity model: one `users` principal across both dashboards (recommended) or two isolated apps? (DQ-6)
6. Polygon leg: drop (recommended) or pay-only with labeled manual deposits + no-withdraw warning? (B-11)
7. x402 demo target: Tab's own endpoint, a named public mainnet resource, or labeled Sepolia? (B-10)
8. Go-Live gating: warn-and-allow (recommended) or hard block? (D6)
9. Cap-unset default: no-cap ⇒ no-payments (recommended) or uncapped-pays-everything as drawn?
10. Logo upload in v0? (D4) · Scheduler (D3) · Next 14 hand-rolled x402 route (recommended) vs Next 16 (D7)
11. Exact-balance disclosure in err_insufficient vs shortfall-only (two levels drawn for one condition, both real) (D22)
12. Keep `wired via onSuccess(…)` dev caption on demo page (ban-list edge)? (D16)
13. Buyer receipt email in v0 (provision sender domain) or CUT the line? (B-07/D9)

## 18. Evidence

- Discovery raws: `.thoughts/prototype-discovery/raw/2026-07-06-{buyer,merchant,leash-web,mobile}.md`
- Reintegration raws: `.thoughts/prototype-reintegration/raw/2026-07-06-{payments,merchant,leash-core,controlplane}.md`
- Lessons: `.thoughts/research/2026-07-06-canton-lessons.md` · Decisions: `.thoughts/decisions/DECISIONS.md`
- Eco re-verification: `.thoughts/research/2026-07-06-eco-particle-magic.md`, `.thoughts/research/2026-07-06-eco-x402-mcp.md`
- Ground-truth docs: `Reference/magic-docs/` @ `45d1eb2` (email-otp.mdx, javascript.mdx, node.mdx, wallet-operations.mdx, eip-7702.mdx, identity-provider.mdx), `Reference/particle-docs-mintlify/` @ `360327a`, published tarballs (`@particle-network/universal-account-sdk@2.0.3`, `@x402/*@2.17.0`, `@modelcontextprotocol/sdk@1.29.0`)
- Skeptic findings (3 lenses: anti-diorama, integration-truth, scope-honesty), 2026-07-06 — all 2 BLOCKERs + 5 MAJORs + minors reconciled in this synthesis and the reintegration doc.
