# Prototype Reintegration — Control Plane (Leash dashboard, mobile PWA, notifications, revoke)

> Date: 2026-07-06 · Author: reintegration subagent (control-plane domain)
> Governing rules: `/Users/abu/dev/hackathon/uxmax/.thoughts/research/2026-07-06-canton-lessons.md` (all 20 gates) + Abu's ground rules (prototype = visual law only; behavior must be REAL; no diorama).
> Inputs: discovery raws `2026-07-06-leash-web.md` + `2026-07-06-mobile.md` (+ buyer/merchant skimmed for overlap), spec `2026-07-02-tab-leash.md` (R-LEASH-*, R-DASH-*, AC-*), stories 3/4/5/6, DECISIONS.md, eco re-verification `2026-07-06-eco-particle-magic.md` + `2026-07-06-eco-x402-mcp.md`, quality profile `2026-07-02-project-quality-profile.md`.
> Fresh verifications done in this pass:
> - `@modelcontextprotocol/sdk@1.29.0` published tarball: `clientInfo {name, version}` IS part of the MCP `initialize` request schema (`dist/esm/types.d.ts:674`) and the low-level `Server` exposes `getClientVersion(): Implementation | undefined` (`dist/esm/server/index.d.ts:125`). → The Connect screen's "Client" row can be REAL. Exact strings sent by Claude Code / Cursor are **(unverified)** — render the raw `clientInfo.name` with an honest "Unknown client" fallback; never fabricate "Claude Code".
> - Magic Server Wallets Express API docs (clone @ `45d1eb2`): **NO per-wallet delete or rotate endpoint exists.** Grep of `Reference/magic-docs/server-wallets/` finds only `POST /v1/wallet` (idempotent provision), signing endpoints, `DELETE /v1/identity/provider/{id}` (provider-level, too blunt), policy CRUD, and an `export-private-key` page. → L3/L4 revoke must be implemented at OUR credential layer (signer-binding revocation/destruction), and the prototype's "deletes your server key" copy needs an honesty adjustment (see rows 32–33, Deviations DR-6).

## 0. Stranger-test statement (gate 1, leads everything)

A brand-new owner with zero seeded state must be able to: **sign up to the Leash dashboard with their own email (Magic OTP) → name + provision an agent (real Magic TEE wallet, real address) → generate a Leash key (show-once) → install the MCP proxy → set a cap → fund the agent address with real USDC → watch the agent's first x402 payment land in the feed from the real receipt ledger → get pushed at 75%/100% → revoke at any level → withdraw remaining float.** Every row below is labeled against that loop. Two named blockers currently break the stranger loop (B-4 npm package installability, B-1/B-3 keys+funding) — surfaced in §5, never designed around.

The control plane has **no LLM, no model picker** (verified absent in prototype — discovery check 1 PASS) and **no on-device signing on mobile** (verified absent — Constraint 7 PASS).

## 1. Architecture reality this matrix maps to

- **Owner auth:** Magic email OTP (`magic-sdk@33.9.0` `loginWithEmailOTP`) → DID token verified server-side (`@magic-sdk/admin`) → session cookie. Same stack as the merchant dashboard (DECISIONS 2026-07-02 merchant row). The spec never explicitly states Leash-dashboard auth — recorded as spec delta SD-1. No demo accounts, no persona jumps (gate 3).
- **Persistence:** a real DB is required for the receipt ledger / caps / notifications / keys. None is named in spec/quality profile — Postgres (Neon or Supabase, serverless-friendly for Vercel) via Drizzle proposed; recorded as SD-2 + Abu provisioning action B-6. **Zero seed files on any request path** (gate 5).
- **Signer plane:** hosted signer = Magic Server Wallet TEE via Express API (`https://tee.express.magiclabs.com`, `POST /v1/wallet`, `/v1/wallet/sign/*`, headers `X-Magic-API-Key` + `X-OIDC-Provider-ID` + Bearer user-JWT). The cap gate + status gate (pause/freeze/cancel/nuclear flags) run server-side in our signer service BEFORE any Magic signing call; overspend → 403 (`LEASH_CAP_EXCEEDED`), per DECISIONS + R-LEASH-3. Magic Policy Evaluation (Global scope) is optional defense-in-depth (per-tx only), never the cumulative cap.
- **Feed transport:** client polling ~3s (SWR/React Query `refreshInterval: 3000`) against `GET /api/leash/receipts` reading the ledger. No websockets needed; matches prototype's "~3s polling" and resolved OQ-W6/P2.
- **Chain reads:** float balances = `viem` `readContract(balanceOf)` on native USDC (Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Arbitrum `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, Polygon `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` — triple-confirmed in eco-x402 §5) via public RPCs, cached to `float_snapshots` for staleness/offline display.
- **Rebalance plane:** `@particle-network/universal-account-sdk@2.0.3` — `createTransferTransaction` + `sendTransaction(tx, sig, authorizations)` intact; **Polygon is GONE from UA V2** (`CHAIN_ID` = 6 chains) → Polygon rebalance leg is BLOCKED-on-decision (B-7). Init: nested `smartAccountOptions`, NO `universalGas`, NO flat `ownerAddress`.
- **Push:** standard Web Push — `web-push` npm (VAPID keys self-generated, no external account), `push_subscriptions` table, service worker `push` + `notificationclick` handlers. iOS requires installed PWA (16.4+); iOS has no notification action buttons (unverified against the very latest iOS — treated as unavailable).

## 2. SCREEN-TO-REALITY MATRIX

Labels: **REAL_MVP** (judged path, ships real) · **REAL_LATER** (visible, unclaimed) · **SIMULATED_DEMO_ONLY** (UI literally says "simulated") · **CUT** (recorded deviation) · **OUT_OF_SCOPE** · **BLOCKED** (named Abu-action).
Note: zero rows are SIMULATED_DEMO_ONLY — every control-plane number has a real source; nothing needs a simulation label.

### Cross-cutting

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 1 | Dashboard auth (all screens) | Owner signs in with email OTP; session persists; sidebar account row shows real name/email | Magic DID token verified server-side → session cookie; email from `magic.user.getInfo()` | `magic-sdk@33.9.0` + `@magic-sdk/admin`, Next.js route `POST /api/leash/auth/login` | REAL_MVP | Spec delta SD-1 (Leash owner auth unstated in spec). "Abu / abu@example.dev" mock → real session identity. No demo accounts (gate 3). |
| 2 | Agent identity | Agent has a user-chosen name (header, L4 type-name confirm) | `agents.name` entered by owner at setup (new small input) | DB + `PATCH /api/leash/agent` | REAL_MVP | "Research Agent v2" is a mock; L4 typed confirm needs a canonical user-known name → naming input added (DR-11). v0 = one agent per owner account, schema supports many (SD-9). |
| 3 | Live polling chips (W1/W2/W7) | "Live" pulse tied to polling health | Client poll loop success/failure state (last successful fetch timestamp) | SWR `refreshInterval:3000` + error state | REAL_MVP | D10/Q9: copy reduced to "Live"; the "~3s polling" internals copy and the feed footer designer-annotation are stripped (DR-1). Pulse must gray out on poll failure (no fake liveness). |

### W1 — Agent Overview

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 4 | Spend card + bar | "$X.XX / $Y.YY (Z%)" + green→amber→red bar | SUM(settled receipts in current cycle) from ledger; cap from `caps` | `GET /api/leash/overview`; AC-DASH-2 settle-only accounting | REAL_MVP | Mocks $4.20/$7.60/$10.00 replaced by live query. Blocked/failed never counted (AC-2 story-4). |
| 5 | Reset line + countdown | "Resets daily · Next reset … (in 9h 37m)" | Server-computed cycle boundary from `caps.frequency` + `cap_cycles.started_at` (UTC-anchored) | date math in API response | REAL_MVP | D12: "daily" hardcoded in template → must interpolate configured frequency incl. "Never". H6: auto un-halt on cycle rollover is real product behavior (cycle roller job). |
| 6 | AGENT BALANCE card | Float total + mono per-chain breakdown + Add funds link | Live `balanceOf(USDC, agentAddress)` on Base/Arbitrum(/Polygon) via viem RPC, summed; cached snapshot w/ read_at | viem public clients; `GET /api/leash/floats` | REAL_MVP | Mock $24.80 / "Base 14.20 · Arb 6.10 · Pol 4.50" → real reads. This number is the FLOAT SUM, honestly labeled — see row 45 for the D1 owner-balance addition. |
| 7 | CONNECTED AGENT card | Client name + status dot + masked key + Manage link | `agents.client_name` from MCP `initialize` clientInfo (verified: sdk `types.d.ts:674`, `getClientVersion()`); masked key from `leash_keys.prefix+last4`; status from last_seen/last payment | `@modelcontextprotocol/sdk@1.29.0` proxy → `POST /api/agent/hello` heartbeat | REAL_MVP | "Claude Code" string is whatever the client actually sends **(exact strings unverified)** — render raw name, fallback "Unknown client" (gate 17). H16: connection status (Active/Idle) is a separate derived field from agent status. |
| 8 | SERVER KEY card | Provisioned/Rotated status + agent address short + copy | `agents.agent_address` from Magic `POST /v1/wallet` → `{public_address}`; key health from `agent_events` | Magic Express API | REAL_MVP | `0x7F3a…9C4e` mock → real TEE wallet address (H4). Copy "Held in your server environment" is WRONG (key is in Magic's TEE, not the user's server) → copy fix, DR-7. |
| 9 | Recent payments preview | 4 newest ledger rows, statuses, relative times | Same receipts query as W2, limit 4 | shared endpoint | REAL_MVP | All fabricated rows/domains/hashes → real receipts. Empty state real (no rows). |
| 10 | Status chip + state banners + quick actions | 7-state chip vocabulary; context CTAs (Raise cap / Resume / Provision…) | `agents.status` + cap state + float state, all from DB/RPC | overview endpoint drives state machine | REAL_MVP | Chip labels canonicalized across web+mobile (§945 rule); "Cancelled — provisioning required" chosen as canonical long form (SD-10). |
| 11 | Notification badge | Unread count (2/3) | COUNT(notifications WHERE read_at IS NULL AND tier IN (2,3)) | `GET /api/leash/overview` | REAL_MVP | Badge = unread T2+T3 only (anti-cry-wolf copy kept). |
| 12 | Loading / empty states | Shimmer skeletons; "$0.00 / cap" empty | Real fetch lifecycle; real zero-state for fresh accounts | client state | REAL_MVP | Empty state IS the stranger's first view — must not require seed data (gate 5). |
| 13 | LOW FLOAT state | Amber card, "LOW" badge below $5.00 / 20%-of-last-top-up threshold | Threshold check over live float reads + last top-up amount from `agent_events` | floats endpoint | REAL_MVP | Threshold constants are product policy (not display data); shown in copy verbatim from config. |

### W2 — Live Payment Feed

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 14 | Feed table (AMOUNT/RESOURCE/STATUS/NETWORK/TXHASH/TIME) | Reverse-chron rows, prepend w/ slide-in, newest tinted | `receipts` table; txHash decoded from base64 `PAYMENT-RESPONSE` header (v2) / `X-PAYMENT-RESPONSE` (v1); network = settled CAIP-2 | `@x402/core@2.17.0` header constants; poll 3s | REAL_MVP | All 8 mock rows (searchgrid.io, arxival.net…) vanish — feed shows only payments the agent really made. Demo feed content depends on a real x402 resource (B-3). Mobile mock's ordering bug fixed (strict reverse-chron). |
| 15 | Status pills incl. Pending | Settled/Pending/Failed/Blocked chips | Ledger status enum `pending → settled\|failed`, `blocked` written by cap gate | signer service writes pending at sign-time, settles on PAYMENT-RESPONSE | REAL_MVP | Q12 answered: Pending = signature sent, awaiting resource 200 + receipt — a real observable window. DECISIONS ledger enum `success\|failed\|blocked` gains `pending` (SD-6). |
| 16 | Blocked rows + AT-LIMIT banner | Blocked rows prepended, "none were sent" banner, halted state | Cap gate writes `blocked` receipt with `intended_network_caip2` parsed from 402 `accepts[]` | signer service 403 path (R-LEASH-3) | REAL_MVP | Q10/D20 resolved: intended network IS knowable and stored; web feed shows it as "Base (target)" like P3 (SD-7) instead of "—". |
| 17 | Empty / loading / load-failed (Retry) / cap-reset banner | Honest empty copy; retry on fetch error; green cycle-reset banner | Real fetch lifecycle; cap-reset banner from newest `cap_cycles` row transition | client + cycles table | REAL_MVP | Network-kill test (gate 6): poll failure must show the designed "Couldn't refresh" state with last-loaded rows. |
| 18 | Feed footer explainer ("New receipts prepend… ~3s polling… explorers") | Designer annotation baked into artboard | — | — | CUT | DR-1 (2026-07-06): annotation, not UI. Removed at build. |

### W3 — Receipt Detail (side panel)

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 19 | Core fields grid (amount / raw 6-dec / asset / network + CAIP-2) | Per-receipt real values | `receipts` row: amount_atomic, amount_usd, asset, network_caip2 | `GET /api/leash/receipts/:id` | REAL_MVP | D17: every field per-receipt (prototype froze resource/time/hash across states — a shortcut, not intent). |
| 20 | Resource URL + full txHash + copy affordances | Full values + clipboard + copied feedback | receipt fields; navigator.clipboard | client | REAL_MVP | H14: all copy targets wired (address, hash, resource, key, snippet). |
| 21 | TRIGGER URL field | "What agent task initiated this payment" | REDEFINED → `origin`: MCP tool name + upstream server + client session (from proxy call context), or `http-wrapper` caller tag | proxy passes origin metadata with each authorize-payment call | REAL_MVP | Q5/H3 resolved: a trigger *URL* is not truthfully capturable in a stdio proxy — fabricated `research.lab/tasks/…` would violate gate 17. Field renamed + honestly sourced (DR-2, SD-3). Label in UI: "ORIGIN". |
| 22 | Context callouts (cumulative-after, blocked math, failed reason) | "Cumulative spend after this payment: $X / $Y"; blocked "would push spend to $10.45…" | Computed from ledger at receipt time (store cumulative_after on receipt) or query | ledger | REAL_MVP | Blocked/failed contexts use real fail_reason (`CAP_EXCEEDED`, facilitator error). |
| 23 | Explorer link ("View on Basescan ↗") | Per-network explorer URL from txHash | URL builder keyed by CAIP-2 (basescan.org / arbiscan.io / polygonscan.com) | static map (H9/mobile-H6) | REAL_MVP | Always rendered when hash exists. |
| 24 | EXPLORER LINK UNAVAILABLE state | Grayed link "Explorer unreachable" | — no honest client-side detection of third-party explorer health exists (CORS) — | — | CUT | DR-3 (2026-07-06): health-detection beat cut; hash always copyable, link always rendered. Visual state retired. |
| 25 | Pending receipt detail | (not designed) | Same panel, Pending pill + "awaiting settlement" context | ledger status | REAL_MVP | Small honest addition since Pending rows exist in feed (discovery note). |

### W4 — Cap & Limits

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 26 | Cap amount + reset-frequency segmented control + Save | Daily/Weekly/Monthly/Never; save persists; agent picks up next check | `caps` table; signer reads cap per authorize-payment call — no restart (R-DASH-5) | `PUT /api/leash/cap` | REAL_MVP | Story-4 OQ1 resolved: frequencies = the prototype's 4 (SD-4). Prototype's segmented control is a static mock → real control. |
| 27 | Cycle started / Next reset (derived) | Read-only dates + countdown | `cap_cycles.started_at` + computed next boundary (UTC 00:00 anchored) | server | REAL_MVP | H6. "Never" → next reset shows "—· manual reset only". |
| 28 | Reset cycle action | Manual reset → spend back to $0, agent auto-resumes | INSERT new `cap_cycles` row (reason=manual); halt flag clears | `POST /api/leash/cap/reset-cycle` | REAL_MVP | Drives the W2 CAP-RESET banner from a real event. |
| 29 | Mid-cycle lower → overage state | 140% bar w/ hatched overflow; "payments halted immediately"; T3 fired | Cap save handler compares new cap vs cycle spend → halt + notification row; ledger retains settled spend | cap endpoint + notifier | REAL_MVP | Story-4 OQ2 resolved: immediate halt + T3 (SD-4). H13: bar renders >100% solid-to-cap + hatched. |
| 30 | Blocked-attempts note ("2 blocked attempts this cycle") | Count under the bar | COUNT(receipts WHERE status=blocked AND cycle_id=current) | ledger (H8) | REAL_MVP | |
| 31 | Save success/error toasts + SAVING state | Real request lifecycle; error keeps previous cap | API result; optimistic-off (show server truth) | client | REAL_MVP | Error toast copy already honest ("previous cap still in effect"). |
| 32 | UNCONFIGURED / NO CAP SET state | Prototype: "agent active but uncapped — every request will be paid" | Signer policy decision | signer gate | REAL_MVP (behavior changed) | DR-4 (2026-07-06): v0 default = **no cap ⇒ no payments** (signer refuses, UI banner "Set a cap to enable payments"). Uncapped-pays-everything is an unsafe default and contradicts the provisioning steps' "set a cap" step. Copy updated. Abu may overrule. |

### W5 — Notifications Center

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 33 | Notification list + filters (All/Alerts/Action required) + unread dots | Items reverse-chron with tag pills, meta line ($ + resource) | `notifications` table (tier, type, message, meta, receipt_id, read_at) | `GET /api/leash/notifications` | REAL_MVP | The 4 mock items → real rows generated by real events only (75% cross, cap block, first-seen domain, cap-lowered halt). H7. |
| 34 | Mark all as read + per-item read | Bulk + row-level read state; badge clears | UPDATE read_at | `POST …/read-all`, `POST …/:id/read` | REAL_MVP | D15 invented affordance kept — it maps to a real bulk op. |
| 35 | Sticky T3 "AWAITING ACTION" + RESOLVED chip | Unresolved T3 pinned; resolves on real remedy | `resolved_at` set when cap raised / cycle reset / agent resumed (event-driven) | cap+revoke endpoints resolve linked notifications | REAL_MVP | Q11 resolved: T3 resolution = the specific remedial event for its type, never a timer (SD-5). |
| 36 | Unusual-destination Tier 2 | "First payment to premium.datamall.xyz" | First-seen-domain check: domain NOT IN (SELECT DISTINCT domain FROM receipts WHERE agent_id=…) at receipt write | notifier in settle path | REAL_MVP | Resolved OQ-W5/OQ-P1 heuristic; fires only on real first-seen domains. |
| 37 | Item CTAs (Raise cap / Revoke agent / Review receipt) | Route to W4 / W6 / W3(receipt_id) | typed CTA per notification type; receipt_id FK | client routing | REAL_MVP | |
| 38 | Tier-1 ambient representation | (none designed; badge only) | Tier-1 = feed row + badge count only; rebalance events stay silent in notifications but visible in W8 history | — | REAL_MVP | Q8/OQ-W9 resolved: rebalances are silent (no notification row); their visibility lives in W8 rebalance status/history (DR-5). |

### W6 — Revocation (web)

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 39 | L1 Soft pause / Resume | Pause halts payments, everything warm; toggle | `agents.status=paused` flag; agent-plane `authorize-payment` returns `LEASH_PAUSED` before any parse; resume flips flag | `POST /api/leash/agent/pause\|resume` | REAL_MVP | AC-LEASH-3. Pause is enforced at the agent-facing API layer (loop-level). Audit row in `agent_events`. |
| 40 | L2 Freeze / Unfreeze | "Loop keeps running, every transaction blocked at the control layer" | `agents.status=frozen`; block enforced at the SIGNER gate (deeper layer than pause) | `POST …/freeze\|unfreeze` | REAL_MVP | Story-6 OQ resolved: pause = API-layer halt, freeze = signer-layer block — two real, distinct enforcement points (SD-8). |
| 41 | L3 Cancel (typed CANCEL) | "Rotates your server key; new key required" | Signer-binding revocation: current `signer_subject` marked revoked → signer service refuses to mint/present JWTs for it; leash keys revoked; re-provision creates NEW OIDC subject → new TEE wallet → new address | our credential layer + Magic provision-on-reprovision | REAL_MVP | Magic has NO wallet-rotate endpoint (verified absent) — "rotate" is real at OUR layer and produces a genuinely new key+address on re-provision. Copy stays truthful. Float disposition at old address → B-8 decision. |
| 42 | L4 Nuclear (type agent name) | "Permanently deletes your server key. No recovery." | Irreversible destruction of the signing credential: hard-delete signer_subject + all leash keys + JWT material; no re-mint possible; `status=not_provisioned` | our credential layer | REAL_MVP (copy fix) | DR-6 (2026-07-06): Magic Express API documents no per-wallet TEE key deletion → honest copy: "Permanently destroys the signing credential. There is no recovery." AC-LEASH-4 satisfied (any signing request rejected). Pre-delete float sweep or stranded-funds warning → B-8. |
| 43 | Confirm dialogs (L1/L2 dialog, L3 type CANCEL, L4 type name) | Escalating confirmation friction | Client-side confirms gating the real HTTP calls; typed strings checked against literal "CANCEL" / `agents.name` | client | REAL_MVP | Mobile L1/L2 dialogs + L3 typed screen referenced-but-undesigned → small design additions (DR-9). |
| 44 | EXECUTING / SUCCESS toast / ERROR states | Spinner during request; toast on new status; in-dialog error w/ retry | Real request lifecycle; response returns new `agents.status` → chip updates without reload | revoke endpoints return status | REAL_MVP | Mobile-H12 optimistic sync satisfied by response payload; gate 6: no fake timers. |
| 45 | Disabled-state logic per status | e.g. L1 disabled while frozen; all disabled when not provisioned | Derived from `agents.status` server-side | overview payload | REAL_MVP | "No dead ends" (gate 16): CANCELLED notice links to real Provision flow; NOT PROVISIONED names the real exit (Set up agent). |

### W7 — Connect your agent

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 46 | Generate Leash key → one-time reveal → masked + Rotate | Show-once plaintext; only hash stored; masked prefix+last4; rotate revokes+reissues | `leash_keys`: random `leash_sk_<base62>`, SHA-256 hash stored, plaintext returned exactly once | `POST /api/leash/keys`, `POST /api/leash/keys/rotate` | REAL_MVP | H10. Same show-once pattern as Tab merchant API keys. D9: prefix decision = `leash_sk_` (prototype wins, SD-11). D16 Rotate kept (real op). |
| 47 | MCP config snippet (`.mcp.json`, `npx -y @leash/mcp`, `LEASH_KEY`) | Copyable installable snippet w/ real key placeholder | Snippet generated server-side; env var + package name are user-visible contract (H11) | npm-published proxy package | BLOCKED | B-4: `@leash/mcp` is an invented name — package must actually be publish-and-runnable by a stranger (`npx -y <real-name>`), or the snippet is a lie. Abu: pick name + npm publish (or decide git-based install string). Snippet itself trivially REAL once named. |
| 48 | HTTP wrapper tab | Second install path: fetch-wrapper snippet | Real secondary interception: `wrapFetchWithPayment(fetch, client)` with Leash remote-signer client (verified API in `@x402/fetch@2.17.0` d.ts) | `@x402/fetch@2.17.0` (+ our thin wrapper pkg) | REAL_MVP | D3/Q3: tab content undesigned → write the real snippet (import wrapper, `LEASH_KEY` env). Needs small design addition (DR-9). |
| 49 | 3-step progress (Key created → Agent configured → First x402 received) | Steps advance on real events | Step 1: key row exists · Step 2: first authenticated `POST /api/agent/hello` · Step 3: first receipt row | agent-plane API | REAL_MVP | "Agent configured" = real heartbeat on proxy startup, not a timer (gate 6). |
| 50 | ACTIVE summary table (Client / Transport / First seen / x402 payments this cycle) | Real connection metadata | clientInfo name+version (verified, row 7), transport (mcp\|http from which plane called), `first_seen_at`, COUNT(receipts in cycle) | agents table + ledger | REAL_MVP | D14 invented table kept — every cell has a real source. "23 this cycle" → live count. |
| 51 | CONNECTION_ERROR ("401 invalid key at 14:31" + REJECTED badge) | Last auth failure surfaced w/ timestamp | Auth middleware writes `last_auth_failure_at/code` on every 401 for a known-prefix key | leash-key auth middleware (H2) | REAL_MVP | Q7/D7 resolved: prototype's 401 semantics adopted (implementable, checkable); map's 24h-unused heuristic dropped (SD-12). |
| 52 | AWAITING FIRST PAYMENT listening card | Pulsing "listening" until first receipt | Polling for receipts count 0→1 | same 3s poll | REAL_MVP | |

### W8 — Setup & funds

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 53 | Provision flow + agent address | Address + copy + "same on every network"; key health / last rotation | Dashboard "Provision agent" button → backend `POST /v1/wallet` (Bearer our-OIDC JWT, X-Magic-API-Key, X-OIDC-Provider-ID, X-Magic-Chain: ETH) → `{public_address}`; events from `agent_events` | Magic Express API | REAL_MVP | DR-8 (2026-07-06): `npx leash provision` CLI is CUT — the wallet is provisioned by OUR backend calling Magic's TEE, not by a CLI "in your server environment". W8 provisioning-steps copy rewritten to the real flow: 1 Provision from dashboard · 2 Fund the address · 3 Set a cap. "last rotation Jun 12, 2026" mock → real event timestamp or honest "Never rotated". |
| 54 | Funding entry (stranger's money-in) | Address + copy + "send USDC on Base/Arbitrum to this address" | Real on-chain deposits to agent address, visible via float reads | RPC reads | REAL_MVP | This is how a stranger funds the loop; copy addition to W8 (money-in named explicitly). Mainnet USDC = real money — no test-funds label needed unless a testnet leg ships (then gate 20 labeling applies). |
| 55 | Agent treasury card (total + per-chain rows) | "$24.80 · one total across N networks", per-chain amounts | Sum + per-chain live `balanceOf` reads (row 6 source) | viem | REAL_MVP | D1 partially accepted: big number stays the float sum labeled "Agent balance" (mobile matches). See row 57 for the owner-visible unified number. |
| 56 | Polygon float row + Polygon rebalance leg | Polygon amount + rebalance top-up | Balance read is REAL (RPC); UA rebalance to Polygon is IMPOSSIBLE on `universal-account-sdk@2.0.3` (CHAIN_ID has no Polygon) | — | BLOCKED | B-7: Abu decision — (a) drop the Polygon float leg from v0 (recommended; x402 payments on Polygon then unsupported, documented gap like Solana), or (b) keep Polygon float with manual/CCTP top-up path (non-UA). Until decided, W8 renders only Base+Arbitrum rows. |
| 57 | Unified-balance display near top-up (D1/Q1) | "Your unified balance: $X" beside "Add funds" | `ua.getPrimaryAssets().totalAmountInUSD` for the agent's UA, read server-side | UA SDK 2.0.3 (`getPrimaryAssets` verified in d.ts) | REAL_MVP | Answers "can this $20 top-up succeed". Recommended accept of map requirement; Abu confirm (B-9). |
| 58 | Top-up ("Add funds from your unified balance") + in-progress + toasts | $ input → transfer lands on Base; progress bar; success/error toasts | UA self-transfer: `createTransferTransaction({token: BASE USDC, amount, receiver: agentAddress})`; rootHash signed via Magic `/v1/wallet/sign/data`; 7702 auths via `/v1/wallet/sign/eip7702` (dec→hex) | UA SDK 2.0.3 + Magic Express | REAL_MVP | Q2: Base-first single-target model ACCEPTED (matches R-LEASH-6 async rebalancing; simpler; recorded SD-13). Live-spike caveat: external/self transfer signed by TEE is doc-proven, not yet run live (spec Constraint 4) → gated by B-1/B-2/B-3 keys+funding spike. Success toast amount = real post-op read, not arithmetic. |
| 59 | REBALANCING chip + row spinner "+$6.00 arriving" | Per-transfer amount + destination while pending | `rebalance_ops` row (amount, to_network, ua_transaction_id, status=pending) written by the apps/agent float watcher; settles on confirmation | UA SDK + watcher (H5) | REAL_MVP | universalx.app explorer link per transactionId available for proof (AC-LEASH-5). |
| 60 | REBALANCE_COMPLETE notice | Brief success state on row; totals recalc | `rebalance_ops.status → settled` transition + fresh float read | poll | REAL_MVP | D5: missing state added back per surface map (DR-9 design addition). |
| 61 | Low/empty float thresholds + urgent CTA | LOW below $5 / 20%-of-last-top-up; EMPTY blocks payments | Threshold over live reads; EMPTY → signer returns `LEASH_FLOAT_EMPTY` per R-LEASH-5 | floats endpoint + signer | REAL_MVP | D6 accepted as rendered (aggregate low state); per-row low badge is a cheap real addition — include. |
| 62 | Withdraw funds (money-out) | NEW surface: send float USDC from agent address to owner-chosen address | Hosted signer signs an ERC-20 transfer (or UA transfer) out of the agent address; receipt in `agent_events` + tx hash shown | signer service + viem broadcast | REAL_MVP | Gate 10: prototype has NO exit for value — added (DR-10, SD-14). Answers "how do users withdraw?" before Abu asks. Also the pre-nuclear sweep target (B-8). |
| 63 | Index-caption mismatch (top-up success "on Arbitrum One") | — | Component copy wins ("across networks", Base-first) | — | CUT | D11: caption is a designer artifact; flagged to designer, not built. |

### Mobile PWA (P1–P6)

| # | Surface | Visible behavior | REAL source | Integration | Label | Note |
|---|---|---|---|---|---|---|
| 64 | PWA shell: manifest, installability, service worker | Installable app; same session; responsive 375px routes | Next.js app manifest + SW registration; same `apps/web` API + session cookie | `manifest.webmanifest`, `sw.js` | REAL_MVP | OQ-6 confirmed PWA (DECISIONS). iOS push requires installed PWA (16.4+) — honest install prompt copy. Deployed HTTPS domain required (B-6). |
| 65 | P1 Overview mirror (chip, balance, spend, last payment, controls) | Same numbers as web | Same endpoints as rows 4–13 | shared API | REAL_MVP | Mobile drops: UA-treasury number (matches D1 resolution — float sum only on mobile), per-chain low badge kept (cheap), "Topping up…" badge REINSTATED (flagship visibility, cheap real read from `rebalance_ops`) — DR-9. Last-payment line gains `[network]` per map (real field). |
| 66 | P1 OFFLINE state ("last seen 14:31", STALE pill, dimmed controls) | Real offline detection + stale data honesty | `navigator.onLine` + online/offline events + cached last-successful-fetch timestamp/payload | client cache (mobile-H9) | REAL_MVP | Gate 6-compliant: real network state drives it. Controls hard-disabled offline. |
| 67 | P1 NUCLEAR state (balance $0.00, chain line hidden) | Prototype zeroes the balance | Real float reads — funds do NOT vanish when the credential is destroyed | RPC reads | REAL_MVP (behavior fixed) | DR-6b: prototype's $0.00 is fabricated. Real UI shows the true remaining balance + honest note ("credential destroyed — withdraw was offered before deletion" / stranded warning per B-8 decision). |
| 68 | P2 Feed + pull-to-refresh + banners | Same ledger rows; per-status read-only banners | Same receipts endpoint; pull-to-refresh = refetch | shared API | REAL_MVP | Per-status banner variants (Frozen/Cancelled/Nuclear) written — paused-only copy was a mock gap (DR-9). Blocked rows show target network (SD-7). |
| 69 | P3 Receipt bottom sheet | Same per-receipt fields; "Base (target)" for blocked; cycle line "Payment 12 of 23 · cumulative $X/$Y" | receipt row + cycle index query (mobile-H3) | shared API | REAL_MVP | TIME/TRIGGER statics were mock shortcuts → per-receipt (D17); TRIGGER → ORIGIN (row 21); copy affordance added to origin field per map §834. |
| 70 | P4 Push notifications, Tier 2/3 (lock screen) | Real Web Push for T2 (75%, unusual domain) + T3 (halted) | `web-push` (VAPID) fired by notifier on real events; payload title/body per designed copy | `web-push` npm + SW `push` handler | REAL_MVP | VAPID keys self-generated (no vendor signup). Anti-cry-wolf enforced in notifier (T3 only for block/halt events). |
| 71 | P4/P5 tier COLOR coding (green/red icon, red border) | Per-tier icon color + card border | NOT controllable via Web Push on OS lock screens (icon is manifest-level; border impossible) | — | CUT | DR-12: tier colors are in-app-surface guidance only; OS notification uses the app icon. Recorded platform deviation. |
| 72 | P5 expanded detail rows (key-value grid in OS tray) | Rich rows in the push | Web Push carries title/body text only → detail rows FLATTENED into body string ("Spend $7.60 of $10.00 · last $0.42 api.searchgrid.io") | payload composer | REAL_MVP (adapted) | DR-12: P5 treated as content spec per discovery's platform-reality flag. |
| 73 | P5 Tier-3 action buttons (Review / Revoke from lock screen) | Revoke = L1 soft pause via SW without opening app; Review deep-links to receipt | SW `notificationclick` → `event.action==='revoke'` → same-origin `fetch POST /api/leash/agent/pause` w/ session cookie; `review` → `clients.openWindow('/m/receipts/:id')` | SW + push actions | REAL_MVP (Android) / OUT_OF_SCOPE (iOS) | Action buttons work on Android Chrome; iOS Safari web push has no action buttons (unverified against newest iOS — treated unavailable). iOS degrade: tap opens PWA at the right state. Idempotent pause. Session-expiry → notification tap opens login (no dead end). |
| 74 | Push deep links | Tap lands on Overview / receipt / revoke sheet | Stable URL routes (`/m`, `/m/receipts/:id`, `/m?sheet=controls`) in payload `data.url` | Next.js routes (mobile-H11) | REAL_MVP | |
| 75 | P6 Revoke sheet (4 levels, one sheet) | Same 4 real actions as W6; per-state buttons; hold-3s L4 | Same revoke endpoints (rows 39–42); hold-to-delete = 3s press timer client-side gating the real call; release cancels | shared API | REAL_MVP | AC-MOBILE-1: same backend halt, HTTP round-trip; nothing signed on device (microcopy already honest). Compact chip label unified with P1 canonical strings (SD-10). |
| 76 | P6 OFFLINE / IN-FLIGHT / SUCCESS toast | Disabled offline; one spinner; toast from response status | navigator.onLine; request lifecycle; response carries new status | client | REAL_MVP | |
| 77 | Bell icon + badge destination | Badge = unread T2+T3; tap opens notifications | Notifications list rendered responsive on mobile (reuse W5 list at 375px) | shared notifications endpoint | REAL_MVP | Mobile OQ2 resolved: bell → responsive notifications list (no new screen class; SD-15). Never a dead tap. |
| 78 | Bottom tab bar (Overview · Feed · Controls) + placeholder icons | 3-tab nav; Controls opens sheet overlay | Client nav; real icons designed at build (placeholders in prototype) | client (mobile-H14) | REAL_MVP | |
| 79 | Fake iOS status bar / lock-screen chrome ("9:41", battery, flashlight circles) | Prototype canvas furniture | — | — | CUT | Not product UI; never shipped. |
| 80 | Failed-with-txHash rendering | On-chain revert w/ hash + Failed pill | receipts row can hold both tx_hash and status=failed | feed/detail components degrade gracefully | REAL_MVP | Mobile-H15: undesigned combo handled honestly (show hash + Failed). |

## 3. MOCK DISPOSITION REGISTER (every fabricated value from discovery → labeled fate)

| Mock (from discovery raws) | Disposition |
|---|---|
| "Research Agent v2" | → `agents.name`, owner-entered (rows 2, 42, 75) |
| "Abu / abu@example.dev" / avatar "AB" | → real session email/initials (row 1) |
| Spend $4.20 / $7.60 / $10.00 / $0.00 / 42–140% | → live cycle-sum query (rows 4, 29) |
| "Resets daily · Next reset Jul 3…(in 9h 37m)" | → computed from caps+cycles, frequency-dynamic (row 5) |
| Float $24.80 / $3.50 / $0.00 / $23.50; per-chain sets 14.20/6.10/4.50 etc. | → live USDC balanceOf reads (rows 6, 55) |
| "Claude Code", masked `leash_sk_••••q4d8` | → clientInfo (verified) + real key mask (rows 7, 46) |
| Agent address `0x7F3a…9C4e` (+full form) | → Magic `/v1/wallet` public_address (rows 8, 53) |
| Badge 2/3 | → unread T2+T3 count (row 11) |
| All 8+ feed rows: amounts, fake domains (searchgrid.io, arxival.net, mapgrid.dev, lexiconapi.com, newswire.dev, premium.datamall.xyz), fake hashes (0x8f2e…1b7d etc.) | → real receipts only; demo content requires real x402 resource (row 14; blocker B-3). Fake domains never ship. |
| Full txHash `0x8f2e6c1a…d61b7d` (an ellipsized literal, not even a real hash) | → real 66-char hash from PAYMENT-RESPONSE (rows 14, 19) |
| Trigger `https://research.lab/tasks/lit-review-142` | → CUT as URL; replaced by real ORIGIN metadata (row 21, DR-2) |
| Timestamps `2026-07-02T14:23:01Z` etc. | → per-receipt created_at/settled_at (row 19) |
| Cap edit "$15.00", toasts w/ $15/$10 | → real save lifecycle values (row 31) |
| "2 blocked attempts this cycle", "$1.20 of overage…" | → ledger counts/math (rows 29, 30) |
| 4 notification items + copies | → event-generated rows only (rows 33–36) |
| "23 this cycle", "First seen Jul 2 14:02", "Active · last x402 2 min ago" | → ledger count + first_seen_at + last receipt time (row 50) |
| "401 invalid key at 14:31" | → real auth-failure telemetry (row 51) |
| Full leash key `leash_sk_9wKpQ2…` | → generated once, hash-stored (row 46) |
| `@leash/mcp` + `LEASH_KEY` + `npx leash provision` | → B-4 npm decision; provision CLI CUT (rows 47, 53) |
| "last rotation Jun 12, 2026" | → agent_events or "Never rotated" (row 53) |
| Top-up "$20.00", "+$6.00 arriving", success totals | → real op amounts from rebalance_ops + post-op reads (rows 58–60) |
| P1 nuclear balance $0.00 | → real read + honest note (row 67, DR-6b) |
| "9:41" status bar, lock-screen dates/clocks, placeholder tab icons | → prototype furniture, CUT (row 79) / real icons (row 78) |
| Confirm inputs pre-filled ("CANCEL", "Research Agent v2") | → empty inputs, user types (rows 43, 75) |
| "Live · ~3s polling" chip + feed footer annotation | → "Live" tied to poll health; footer CUT (rows 3, 18) |

No mock from the two discovery raws vanishes silently; all are covered above (gate 18 coverage check: W1–W8, P1–P6 = full surface set, no orphans).

## 4. DATA-MODEL CANDIDATES

- `owners` — id, email (unique), magic_issuer, created_at
- `agents` — id, owner_id FK, name, status ENUM(active|paused|frozen|cancelled|not_provisioned), signer_subject (OIDC sub, null until provisioned), agent_address, provisioned_at, last_rotation_at, client_name, client_version, transport ENUM(mcp|http), first_seen_at, last_seen_at
- `leash_keys` — id, agent_id FK, key_hash (sha256), prefix, last4, created_at, revoked_at, last_used_at, last_auth_failure_at, last_auth_failure_code
- `caps` — agent_id PK/FK, amount_usd (integer cents), frequency ENUM(daily|weekly|monthly|never), updated_at
- `cap_cycles` — id, agent_id FK, started_at, ended_at, reset_reason ENUM(schedule|manual|frequency_change)
- `receipts` — id, agent_id FK, cycle_id FK, status ENUM(pending|settled|failed|blocked), amount_atomic, amount_usd_cents, asset, network_caip2, intended_network_caip2 (blocked rows), resource_url, tx_hash, origin_kind ENUM(mcp|http), origin_detail (tool/session/server), fail_reason, cumulative_after_cents, created_at, settled_at
- `notifications` — id, agent_id FK, tier ENUM(2|3), type ENUM(cap_75|cap_blocked|unusual_domain|cap_lowered_halt), message, meta_amount_usd_cents, meta_resource, receipt_id FK nullable, sticky bool, read_at, resolved_at, created_at
- `push_subscriptions` — id, owner_id FK, endpoint (unique), p256dh, auth, user_agent, created_at, revoked_at
- `agent_events` — id, agent_id FK, kind ENUM(provision|pause|resume|freeze|unfreeze|cancel|nuclear|key_create|key_rotate|topup|withdraw), actor_surface ENUM(web|pwa|push_action), detail json, created_at (audit trail; feeds key-health + last-rotation + last-top-up displays)
- `rebalance_ops` — id, agent_id FK, to_network_caip2, amount_usd_cents, ua_transaction_id, status ENUM(pending|settled|failed), created_at, settled_at
- `float_snapshots` — agent_id FK, network_caip2, balance_atomic, read_at (cache for STALE/offline display; never a substitute for live reads on judged surfaces)

## 5. BLOCKERS (named Abu-actions / decisions — Phase 0, run in parallel; gate 12/13)

- **B-1 Magic keys + OIDC provider.** Magic dashboard account → Publishable + Secret API keys; configure an OIDC identity provider to obtain `X-OIDC-Provider-ID` (Express API prerequisite); confirm Server Wallets Express works on the free tier empirically at the keys spike (partially verified — pricing table lists it without gating). Owner: Abu.
- **B-2 Particle keys.** dashboard.particle.network → project → web app → projectId/clientKey/appId (for the UA rebalance + unified-balance read). Owner: Abu.
- **B-3 Funding + demo x402 resource.** Real USDC to the agent address (Base + Arbitrum floats) and to the treasury path for the rebalance demo; AND a real x402-gated resource to pay: mainnet settlement requires the CDP facilitator (API keys, 1,000 free tx/mo) on the seller side — open x402.org facilitator is Base-Sepolia-only. Abu: CDP account+keys (if we run our own demo seller / Tab-as-x402-resource) OR accept a labeled Base-Sepolia leg (then gate-20 "Test funds — not real money" labels go on every affected surface). Without this the feed/notifications/spend-bar have nothing real to show.
- **B-4 npm package name + publish for the MCP proxy.** `@leash/mcp` is invented; the W7 snippet must be runnable by a stranger (`npx -y <real-published-name>`). Abu: pick name (scope availability), npm account, publish; fallback: documented git/npx-from-tarball install string (still honest, less clean).
- **B-5 (removed — merged into B-3).**
- **B-6 Hosting: Vercel deploy + HTTPS domain + hosted Postgres.** Web Push and PWA install require HTTPS; DB required for the ledger (Neon/Supabase provisioning). Owner: Abu (accounts), agent (wiring).
- **B-7 Polygon float leg decision.** UA SDK 2.0.3 dropped Polygon — UA treasury cannot rebalance a Polygon float. Options: (a) drop Polygon from v0 (recommended; document the gap like Solana), (b) keep with a non-UA top-up (manual/CCTP). Affects W8 rows, W2 network column, R-LEASH-1 table.
- **B-8 L3/L4 float disposition decision.** Cancel/Nuclear leave real USDC at the (old) agent address. Options: auto-sweep to an owner withdrawal address BEFORE credential destruction (signing still possible at confirm time) vs. explicit "remaining $X.XX becomes unrecoverable" warning in the L4 dialog. Recommendation: L4 dialog shows the live remaining balance and offers "Withdraw first" (row 62). Abu confirm.
- **B-9 D1 confirm.** Show the agent-UA unified balance (`getPrimaryAssets().totalAmountInUSD`) next to the top-up control (recommended, row 57)? And Q2: Base-first single-target top-up accepted (recommended)? Abu confirm.

## 6. SPEC / STORY / SURFACE-MAP DELTAS caused by this mapping

- **SD-1** Spec gains an explicit requirement: Leash dashboard owner auth = Magic email OTP, multi-tenant, session-cookie (mirrors merchant dashboard). Stranger signup is the entry to every judged control-plane path.
- **SD-2** Stack gains a persistence layer (proposal: Postgres/Neon + Drizzle) — currently unnamed in spec/quality profile/DECISIONS.
- **SD-3** R-LEASH-4 field `trigger URL` → `origin` (origin_kind + origin_detail: MCP tool/session/upstream-server or http-wrapper caller). W3/P3 label "ORIGIN". A trigger URL is not truthfully capturable in the stdio proxy.
- **SD-4** R-DASH-2 enumerations resolved: reset frequencies = Daily/Weekly/Monthly/Never (+ manual Reset cycle); mid-cycle lower below current spend ⇒ immediate halt + T3, settled spend retained (overage rendering per H13). Resolves story-4 OQ1/OQ2.
- **SD-5** Notification model addition: `resolved_at` semantics — a T3 resolves on its type's remedial event (cap raise / cycle reset / resume), never on a timer. Resolves leash-web Q11.
- **SD-6** Ledger status enum gains `pending` (DECISIONS row said `success|failed|blocked`): pending = signed/sent awaiting settlement receipt; feed's Pending pill is real. Resolves Q12.
- **SD-7** Blocked receipts store + display `intended_network_caip2` from the 402 `accepts[]` (web W2 and P2 gain "(target)" network like P3). Resolves Q10 + P2/P3 asymmetry.
- **SD-8** Pause vs Freeze implementation distinction defined: pause = agent-plane API-layer halt (`LEASH_PAUSED` before parsing), freeze = signer-gate block. Resolves story-6 OQ1.
- **SD-9** v0 scoping: one agent per owner account (schema multi-agent-ready). Resolves mobile-H13/D19 (no fake agent ID shown; name only).
- **SD-10** Canonical chip strings fixed across web+mobile per §945: "Cancelled — provisioning required" (long form) everywhere; P6 compact chip updated. Resolves mobile OQ9.
- **SD-11** Key prefix decision: `leash_sk_` (prototype) over map's `lsh_`. Resolves D9.
- **SD-12** CONNECTION_ERROR semantics = last-auth-failure telemetry (401 + timestamp), replacing the map's 24h-unused heuristic. Resolves Q7/D7.
- **SD-13** Top-up model = Base-first single target + background rebalance (accepts D4/D6; map's per-chain destination selector dropped as a recorded deviation). Pending B-9 confirm.
- **SD-14** NEW requirement (gate 10): float money-out — "Withdraw funds" from agent address to owner-chosen address via hosted signer; surfaced on W8 (+ referenced in L4 confirm). Prototype never drew it; design addition using existing tokens.
- **SD-15** Mobile bell badge destination = responsive notifications list (W5 at 375px). Resolves mobile OQ2.
- **SD-16** W4 UNCONFIGURED behavior change: no cap ⇒ no payments (signer refuses), replacing "uncapped = pays everything". Safety default; copy updated (DR-4). Abu may overrule.
- **SD-17** DECISIONS multi-chain floats row needs a dated amendment for the Polygon leg (B-7) — UA V2 fact from eco re-verification.

## 7. DEVIATIONS REGISTER (dated 2026-07-06; gate 18)

- **DR-1** CUT: "~3s polling" internals copy + W2 footer annotation (designer note baked into artboard). Chip reads "Live", bound to poll health.
- **DR-2** CUT/REDEFINED: fabricated TRIGGER URL → real ORIGIN metadata (MCP tool/session/server or http caller). Rationale: no honest URL exists in a stdio proxy; fabricating one violates no-fabricated-display-data.
- **DR-3** CUT: W3 "explorer unreachable" health-detection state. Rationale: third-party explorer health is not honestly detectable client-side (CORS); hash remains always-copyable, link always rendered.
- **DR-4** CHANGED: W4 UNCONFIGURED = payments disabled until a cap is set (was: uncapped pays everything). Safety + consistency with provisioning step 3.
- **DR-5** DECIDED: background rebalances stay notification-silent (Tier-1 ambient = badge/feed only); visibility lives on W8 chip/rows + history. Resolves OQ-W9/Q8/mobile-OQ8 (mobile gets the "Topping up…" badge back — see DR-9).
- **DR-6** CHANGED (copy honesty): L4 "permanently deletes your server key" → "permanently destroys the signing credential — there is no recovery." Grounded: Magic Express API has no per-wallet key-deletion endpoint (verified absent in docs clone `45d1eb2`); what we destroy irreversibly is the credential chain (subject + keys + JWT material), which satisfies AC-LEASH-4 exactly. **DR-6b:** P1 nuclear balance $0.00 replaced by real reads + honest stranded/withdraw note.
- **DR-7** CHANGED (copy honesty): W1 server-key caption "Held in your server environment" → "Held in a secure enclave (TEE) — never shown to anyone." The key lives in Magic's TEE, not the owner's server.
- **DR-8** CUT: `npx leash provision` CLI. Provisioning is a dashboard action calling Magic's Express API from our backend; W8 steps rewritten. (A CLI could return REAL_LATER if a headless operator flow is ever wanted.)
- **DR-9** DESIGN ADDITIONS (undesigned-but-required, built with existing tokens): HTTP-wrapper tab content (real snippet); L1/L2 confirm dialogs + L3 typed-CANCEL screen on mobile; REBALANCE_COMPLETE state; per-status read-only feed banners (Frozen/Cancelled/Nuclear); Pending receipt detail; mobile "Topping up…" badge; per-row low-float badge; agent-name input at setup; withdraw control (SD-14).
- **DR-10** ADDED: money-out (withdraw) — gate-10 requirement the prototype omitted.
- **DR-11** ADDED: agent naming at setup (prerequisite for honest L4 type-name confirm).
- **DR-12** ADAPTED (platform reality): P5 rich detail rows flattened into push body text; per-tier icon colors/red border are in-app only; iOS gets no notification action buttons (Revoke action = Android; iOS deep-link tap). Confirm-inputs ship empty (prototype showed pre-typed values).
- **DR-13** CUT: prototype canvas furniture (fake iOS status bar, lock-screen chrome, placeholder tab icons → real icons at build).
- **DR-14** CUT: W8 index-caption "on Arbitrum One" top-up toast (contradicts component + Base-first model); component copy wins.

## 8. Anti-mistake checklist self-audit (summary)

1 Stranger test: loop stated §0; two loop-breaking blockers named (B-3, B-4) — not designed around. 2 Every number sourced: §2 realSource column + §3 register. 3/4/5 No demo accounts/tenants/seeds anywhere in this plan. 6 No fake time: pending/settled from real events; poll-failure states designed. 7 No impersonation surfaces exist in this domain. 8 Every beat mapped or CUT (§7). 9 Matrix complete W1–W8/P1–P6. 10 Withdraw added (SD-14). 11 Real signup IS the entry (row 1). 12/13 Blockers §5 with Abu-actions. 14/15 To be exercised at audit time — this doc makes no "it's real" claim; it is the map to make it real. 16 Dead ends: every rejection state routes (rows 45, 73). 17 No fabricated display data (rows 7, 21, 67). 18 Register §7 + coverage §3. 19 This doc precedes planning; Abu approves. 20 Mainnet = real money; any testnet leg gets point-of-display labels (B-3).

*End — control plane reintegration raw.*
