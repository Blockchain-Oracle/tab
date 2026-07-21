# Prototype Reintegration — Leash Engine (MCP proxy, hosted signer, caps, multi-chain floats, x402 pay loop)

> Date: 2026-07-06 · Author: reintegration subagent (Leash-core domain)
> Governed by: `/Users/abu/dev/hackathon/uxmax/.thoughts/research/2026-07-06-canton-lessons.md` (all 20 anti-mistake gates)
> Inputs: discovery `/Users/abu/dev/hackathon/uxmax/.thoughts/prototype-discovery/raw/2026-07-06-leash-web.md` (+ mobile raw for shared engine mocks),
> spec `.thoughts/specs/2026-07-02-tab-leash.md` (R-LEASH-1..6, R-DASH-2/3/4/5), stories 3/4/5/6/7(repurposed),
> research `.thoughts/research/2026-07-02-x402-payer-architecture.md`, `2026-07-02-x402-multichain-strategy.md`,
> `2026-07-02-x402-interception-feasibility.md`, `x402-tab-leash-mechanics.md`,
> eco re-verification `.thoughts/research/2026-07-06-eco-particle-magic.md` + `2026-07-06-eco-x402-mcp.md`,
> quality profile `.thoughts/quality/2026-07-02-project-quality-profile.md`, DECISIONS `.thoughts/decisions/DECISIONS.md`.
> Labels: REAL_MVP · REAL_LATER (visible, unclaimed) · SIMULATED_DEMO_ONLY (UI literally says "simulated") · CUT (recorded deviation) · OUT_OF_SCOPE · BLOCKED (named Abu-action).
> Note: in the machine-readable matrix CUT is encoded as OUT_OF_SCOPE with a "CUT —" note prefix (schema enum has no CUT).

---

## 0. Stranger test — the engine's golden loop (leads everything)

A brand-new agent owner with zero seeded state must be able to:

1. **Sign up** to the Leash dashboard with their real email (Magic email OTP — same auth stack as merchant dashboard; no demo accounts).
2. **Provision an agent** from the dashboard: backend calls Magic Express API `POST /v1/wallet` → real TEE-held EOA, `public_address` returned and stored. No CLI, no operator ritual.
3. **Fund the agent address** by sending real USDC/assets to that address on any supported chain (address shown with deposit instructions — W8 provisioning step 2 already says "Fund the agent address that appears here").
4. **Set a cap** (amount + reset frequency) — stored server-side, enforced at the signer endpoint.
5. **Generate a Leash key** (one-time reveal) and **install the MCP proxy** via the config snippet — which only works for a stranger if the npm package is actually published (Blocker B4).
6. **Run their agent into a real x402 paywall** → proxy detects the challenge → backend cap-checks → Magic TEE signs EIP-3009 → resource returns 200 → receipt row appears from the real settlement response.
7. **See settlement** (txHash → real explorer) and **withdraw value out** (new surface — §2 row E39; UA transfer from agent address to any address of theirs).

Every row below is judged against this loop. Nothing in the engine imports a seed file; the feed is empty until the stranger's agent actually pays (W2 EMPTY state is the honest first-run state).

---

## 1. Architecture split — what `apps/agent` actually contains vs the backend

The prototype + spec conflate "apps/agent" with "hosted signer". Reintegration splits it hard, because the MCP proxy runs on the **owner's machine** and must never hold Magic secrets (R-LEASH-1: key never exposed to agent-host code):

| Piece | Runs where | Contains | Secrets held |
|---|---|---|---|
| **`packages/leash-mcp`** (today's "apps/agent" primary artifact; published npm bin) | Owner's machine, spawned by Claude Code/Cursor via `.mcp.json` | MCP stdio server (`@modelcontextprotocol/sdk@^1.29.0` low-level `Server` + `StdioServerTransport`); upstream pass-through (`ListTools`/`CallTool` forwarded via SDK `Client`); dual-surface x402 challenge detection (`@x402/mcp@2.17.0`); a universal `paid_fetch` tool (`@x402/fetch` with a **remote signer**); result reporting to backend | `LEASH_KEY` only (bearer credential; not a wallet key) |
| **`packages/leash-fetch`** (secondary interception; published) | Owner's HTTP agent process | `wrapFetchWithPayment(fetch, client)` where `x402Client().register('eip155:…', new ExactEvmScheme(remoteSigner))` and `remoteSigner.signTypedData` = HTTPS call to the Leash backend | `LEASH_KEY` only |
| **Leash control plane** (in `apps/web` — Next.js API routes + cron route) | Our server | Leash-key auth, agent status gate (pause/freeze/cancel), cap check → 403, CAIP-2 float routing, float balance reads (viem per-chain RPC), Magic Express API client (provision + sign), receipt ledger, cycle engine, notification emission, rebalance worker (event-driven post-payment check + Vercel cron), UA SDK 2.0.3 for treasury reads/top-ups/withdrawals | Magic API/Secret keys, Particle projectId/clientKey/appId, DB creds |
| **Magic Server Wallet TEE** | Magic infra (`https://tee.express.magiclabs.com`) | The agent's private key (never exported); `POST /v1/wallet`, `/v1/wallet/sign/data`, `/v1/wallet/sign/message`, `/v1/wallet/sign/eip7702` | The EOA key |

**Honesty note on "the hosted signer enforces the cap":** the cumulative-spend 403 is **our backend logic in front of the TEE call** — Magic's new Policy Evaluation is per-transaction only (eco-particle-magic §3). The cap gate still lives outside the agent process (unbypassable by the agent), which is what R-LEASH-3 actually requires. Pitch copy must say "Leash's signing service (backed by a Magic TEE wallet)", not imply the TEE computes cumulative spend. → Delta S2.

**Stack delta (S1):** `apps/agent` is re-scoped to the two publishable client packages; hosted-signer integration + float watcher move into `apps/web` server code. DECISIONS.md row "apps/agent (headless x402 payer)" and quality-profile package table need this correction.

---

## 2. Screen-to-reality matrix

Columns: Surface (screen/flow/state) · Visible behavior · REAL source · Required integration · Label · Note.
Prefix E# = engine row id (referenced in §3 mock register and §8 deltas).

### 2a. Interception: MCP proxy + fetch wrapper (W7 Connect + invisible engine flows)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E1 | W7 card 2 — `.mcp.json` config snippet | Owner copies snippet `{"command":"npx","args":["-y","<pkg>"],"env":{"LEASH_KEY":"…"}}`; agent host spawns the proxy | Snippet generated server-side with the real published package name + the owner's real key placeholder | npm-published `leash-mcp` (or `@leash/mcp` if org available) with `bin` entry; `@modelcontextprotocol/sdk@^1.29.0` | REAL_MVP | Prototype's `@leash/mcp` name is invented (D11/H11); real name decided at publish. **Snippet only works for a stranger if the package is actually on npm** → Blocker B4. Pin SDK 1.29.0; ignore `@modelcontextprotocol/server` v2 beta (eco-x402 C6). |
| E2 | MCP stdio proxy process (invisible) | Agent's MCP tool calls pass through Leash unchanged unless a payment challenge appears | Low-level `Server` + `setRequestHandler(ListToolsRequestSchema\|CallToolRequestSchema)` forwarding to an SDK `Client` connected to the upstream paid MCP server (upstream URL as CLI arg) | `@modelcontextprotocol/sdk@1.29.0`; pattern verified via Context7 + cascade `mcp.ts` (`Reference/x402-proxy-cascade`) | REAL_MVP | This is the true "proxy" mode for paid MCP tools; retry carries `_meta["x402/payment"]` (verified in `@x402/mcp@2.17.0` dist). |
| E3 | `paid_fetch` universal tool (invisible; powers "run your agent into any x402 paywall") | Agent calls one Leash tool with a URL; Leash fetches, auto-pays any 402, returns body | `@x402/fetch` `wrapFetchWithPayment` inside the proxy, signer = remote Leash backend | `@x402/fetch@2.17.0` + `@x402/evm@2.17.0` (remote `ExactEvmScheme` signer) | REAL_MVP | Covers arbitrary HTTP x402 resources (incl. Tab-as-x402-resource, Story 9) without an upstream MCP server. W7's copy "any x402 paywall" is only honest with this tool present. |
| E4 | x402 challenge detection — MCP layer | Payment demand recognized whether the paid server returns an `isError` tool result or a JSON-RPC error | BOTH surfaces: tool-result (`structuredContent`/text with `{x402Version, accepts}`) AND JSON-RPC error codes `402` / `-32042` (SEP-1036) | `@x402/mcp@2.17.0` helpers `isPaymentRequiredError`, `extractPaymentRequiredFromError` | REAL_MVP | New since 2026-07-02 research (eco-x402 C4). Missing the -32042 path would silently break against current `McpServer`-built paid servers. |
| E5 | x402 challenge detection — HTTP layer | 402 responses recognized for v2 and v1 resources | v2: `PAYMENT-REQUIRED` header; v1: HTTP 402 + JSON body `{x402Version:1, accepts[]}` — **no** `X-PAYMENT-REQUIRED` header exists in published core (eco-x402 C5) | `@x402/core@2.17.0` constants; v1 via `.register(network, scheme, 1)` | REAL_MVP | Story-3 AC line citing "`X-PAYMENT-REQUIRED` header" is factually wrong → Delta S5. |
| E6 | W7 "HTTP wrapper" tab (content undesigned — discovery D3/Q3) | Snippet for direct-HTTP agents: `import { leashFetch } from '<pkg>'; const fetch = leashFetch({ apiKey: process.env.LEASH_KEY })` | Published `leash-fetch` package wrapping `wrapFetchWithPayment` with the remote signer | `@x402/fetch@2.17.0`, `@x402/evm@2.17.0`, viem `^2.48` | REAL_MVP | Tab content must be **designed** (was dropped by designer). Snippet above is the engineering answer to Q3; hand to designer. |
| E7 | MITM transparent proxy + CA cert (spec last-resort) | — | — | — | OUT_OF_SCOPE | Per DECISIONS.md: opt-in last resort, not v0. Recorded deviation: no UI references it; docs may mention as roadmap. |
| E8 | W7 progress step 3 "First x402 received" | Step flips when the first real payment lands | First receipt row for this agent (any status ≠ blocked) in the ledger | Receipts table + `/api/leash/connection` | REAL_MVP | State transition driven by a real receipt, never a timer (canton rule 6). |
| E9 | W7 ACTIVE summary — Client "Claude Code" / Transport / First seen / "23 this cycle" (H1) | Real connected-client identity | MCP `initialize` handshake `clientInfo {name, version}` reported by the proxy to `/api/agent/connect`; first_seen = first handshake; count = receipts in current cycle | `@modelcontextprotocol/sdk` (clientInfo is in the MCP spec); connections table | REAL_MVP | Exact display strings per host are (unverified) — render `clientInfo.name` verbatim with honest fallback "Unknown client" (canton rule 17). Verify Claude Code's actual clientInfo string at spike. |
| E10 | W7 CONNECTION_ERROR — "401 invalid key at 14:31" + REJECTED badge (H2, D7) | Last auth failure surfaced | Backend logs `{status, at}` per key on every failed Leash-key auth; dashboard reads it | leash_keys table (`last_auth_failure_at/_code`) | REAL_MVP | Adopts prototype semantics (Q7 resolved: 401-telemetry, implementable & checkable). Map's "unused 24h" heuristic superseded → Delta S6. |

### 2b. Leash key lifecycle (W7 card 1)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E11 | Generate key → one-time reveal → "I've saved my key" → masked `leash_sk_••••q4d8` | Plaintext shown exactly once; only hash stored; masked prefix+last4 afterwards | Backend generates `leash_sk_<base62>`, stores SHA-256 hash + prefix + last4; plaintext returned in the create response only | crypto (node) + DB; same shown-once pattern as Tab merchant API keys | REAL_MVP | Prefix decision: keep designer's `leash_sk_` (D9 accepted). |
| E12 | Rotate key (D16) | New key revealed once; old key immediately invalid | New row + revoke old (`revoked_at`); pay endpoints reject revoked hashes | DB | REAL_MVP | Rotation is also the mechanic behind L3 Cancel (E26). |

### 2c. The pay loop: cap → route → sign → settle → receipt

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E13 | Server-side cap check → hard block (W4 promise "Payments stop when the cap is reached") | Overspend attempt refused before any x402 call; proxy surfaces `LEASH_CAP_EXCEEDED` | `POST /api/agent/pay` computes current cycle window + `SUM(settled + pending receipts)`; if `+ amount > cap` → HTTP 403 `{code:"LEASH_CAP_EXCEEDED"}`, blocked receipt row written, T3 notification emitted | Receipts ledger (source of truth per R-LEASH-3/4) | REAL_MVP | Cap counts settled+pending (signed-not-yet-settled) conservatively so a signed payment can't overshoot; failed rows release their pending hold. Honesty: 403 is our backend in front of the TEE (Delta S2). |
| E14 | Agent-status gate (paused/frozen/cancelled block payments) | While paused/frozen, no payment is signed; agent's paid calls fail with a policy error | Status column checked in the same `/api/agent/pay` gate before cap check → 423 `{code:"AGENT_PAUSED"\|"AGENT_FROZEN"\|"AGENT_CANCELLED"}` | agents table | REAL_MVP | This is what makes W6 revocation real at the engine layer (AC-LEASH-3/4). |
| E15 | CAIP-2 float routing (invisible; W3 NETWORK field) | Payment paid on the exact network the 402 demands | Parse `accepts[]`, filter to supported CAIP-2 set, prefer entry whose float covers the amount (Base > Arbitrum > Polygon on ties) | `@x402/core` PaymentRequired types | REAL_MVP | Chain follows the resource, never a preference (R-LEASH-5). Multi-entry `accepts[]` preference order is an engineering decision recorded here. |
| E16 | Float sufficiency check → `LEASH_FLOAT_EMPTY` | Payment on a dry chain fails fast without an x402 call; background top-up may be triggered | `balanceOf(USDC, agentAddress)` per chain via viem publicClient (cached ≤30s; re-read on miss) | viem + per-chain RPC URLs; USDC addrs: Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Arb `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, Pol `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (triple-confirmed, eco-x402 §5) | REAL_MVP | Logged as `failed` with `reason: FLOAT_EMPTY` (story-3 OQ resolved: distinct reason, not a new status). Emits T2. |
| E17 | EIP-3009 signing via hosted signer (invisible) | Payment authorization signed inside the TEE; key never on our disk or the owner's | EIP-712 digest of `transferWithAuthorization` built server-side (`@x402/evm`), signed via Magic Express `POST /v1/wallet/sign/data` (raw_data_hash) with Bearer user-JWT + `X-Magic-API-Key` + `X-OIDC-Provider-ID` | Magic Express API (`https://tee.express.magiclabs.com`); Magic's own x402 recipe exists (`recipes/server-wallets/x402-payments.mdx`, eco-particle-magic §3) | REAL_MVP | BLOCKED-adjacent prerequisites: Magic keys + OIDC provider config (B1). Honest fallback if Express gating appears at the spike: server-held key in backend KMS, labeled in docs — same cap logic, recorded deviation. |
| E18 | Payment submit + settlement receipt capture | Resource returns 200; receipt fields from the real settlement header | v2 `PAYMENT-RESPONSE` / v1 `X-PAYMENT-RESPONSE` (base64 JSON: `success`, `txHash`, `network`); proxy POSTs it to `/api/agent/pay/result` to finalize the pending row | `@x402/fetch` / `@x402/mcp` retry mechanics | REAL_MVP | Receipt row transitions pending→success/failed only on the real response (canton rule 6: network-kill leaves an honest `pending` row). |
| E19 | Receipt ledger — status enum | Feed shows Settled / Pending / Failed / Blocked with real provenance | DB rows: `success` (settled, has txHash) · `pending` (signed/submitted, no txHash yet) · `failed` (x402 issued, rejected; `reason`) · `blocked` (never issued; `reason: CAP_EXCEEDED`) | Postgres (Neon/Supabase — B9) | REAL_MVP | Adds `pending` to story-3's `success\|failed\|blocked` enum → Delta S7. Blocked rows store `intended_network` from the parsed accepts[] (Q10 answered: yes, knowable). |
| E20 | W2 Pending row **with** txHash `0x6c8e…2b4a` (mock) | — | Not real: the payer has no hash until `PAYMENT-RESPONSE` arrives (settlement is facilitator-side) | — | OUT_OF_SCOPE | CUT — recorded deviation (Q12 answered): Pending renders "no hash yet"; hash appears on settle. Designer visual stays; the hash-on-pending detail goes. |
| E21 | W3 TRIGGER URL `https://research.lab/tasks/lit-review-142` (mock; H3/Q5) | — | Not truthfully capturable: an MCP stdio proxy has no originating task URL; fabricating one violates no-diorama | — | OUT_OF_SCOPE | CUT — replaced by E22. Deviations register entry; designer relabels the field. |
| E22 | Receipt "Origin" (replacement for trigger URL) | Receipt detail shows what initiated the payment: client + tool + transport (e.g. "Claude Code · paid_fetch · Leash MCP") | Proxy sends `{clientName, toolName, transport}` context with each pay request; stored on the receipt | connections + receipts columns | REAL_MVP | Honest, real, and still tells the owner "what was my agent doing". |
| E23 | Feed data source (Live chip, ~3s polling; W1 preview + W2) | New receipts appear within the polling interval after real settlement | Dashboard polls `GET /api/leash/receipts` (cursor-paginated) | apps/web API | REAL_MVP | Polling cadence + "Live · ~3s polling" copy strip is the web-dashboard domain's call (their D10); engine guarantees ordering + cursoring. Feed is EMPTY for a stranger until real payments exist — no seeded rows ever (fabricated domains searchgrid.io/arxival.net etc. never ship). |

### 2d. Cap engine + cycles (W4)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E24 | Cap config (amount + Daily/Weekly/Monthly/Never) + save/error | Cap persists; takes effect on the agent's next pay attempt, no restart | `PUT /api/leash/cap`; pay gate reads it live (AC-6/AC-7) | DB | REAL_MVP | Prototype's segmented control is a static mock — build makes all four frequencies functional. W1's hardcoded "Resets daily" string becomes dynamic (D12) → web domain, engine supplies `frequency`. |
| E25 | Cycle boundaries: "Cycle started / Next reset — in 9h 37m" + auto-resume on rollover (H6; W2 CAP-RESET banner) | Countdown derived server-side; halt lifts automatically at rollover | Cycle window computed from `cycle_anchor_at` + frequency (UTC); "halted" is derived (`spend ≥ cap` within window), so a new window auto-resumes — no timer theatre | cycles/receipts queries | REAL_MVP | No fake time: countdown is derived from server clock vs anchor; the CAP-RESET feed banner fires only when a rollover actually produced a new window. |
| E26 | Manual "Reset cycle" (W4 at-limit/overage) | Owner zeroes the cycle; agent resumes | `POST /api/leash/cycle/reset` closes the current cycle row, opens a new anchor; prior receipts stay attributed to the closed cycle | cycles table | REAL_MVP | |
| E27 | Overage state ($4.20/$3.00 = 140%, hatched bar, "$1.20 of overage is prior settled spend") (H13) | Lowering cap below spend halts immediately; settled spend retained | Pure ledger math: spend > cap ⇒ blocked-at-gate; overage = spend − cap | none beyond ledger | REAL_MVP | No clawback exists or is implied — copy already honest. |
| E28 | "2 blocked attempts this cycle (not counted)" (H8) | Blocked-count per cycle | `COUNT(*) WHERE status='blocked' AND cycle_id=current` | ledger | REAL_MVP | |

### 2e. Notifications emission (engine side of W5)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E29 | T2 banner at 75% crossing; T3 interrupt on block/halt (AC-DASH-3) | Notification rows created at the moment a real receipt/block crosses a threshold | Emission inside the pay/result handlers: 75% crossing detection compares pre/post cumulative; block writes T3 with `receipt_id`, sticky until resolved | notifications table | REAL_MVP | Resolution semantics (Q11 answered): a sticky T3 resolves when the condition clears — cap raised above spend, cycle reset, or agent resumed. Recorded as engine rule. |
| E30 | T2 "Unusual payment destination — first payment to <domain>" | First-seen-domain detection | `NOT EXISTS` prior receipt with same resource host for this agent | ledger query at receipt write | REAL_MVP | Fully computable from real history; no ML pretense. |
| E31 | Tier-1 ambient tier (OQ-W9/D18: rebalance events silent?) | Rebalance events appear in rebalance history (W8), not as notifications; settled payments notify nobody | rebalances table + receipts feed ARE the Tier-1 log | — | REAL_MVP | Proposed resolution of OQ-W9: Tier 1 = feed/history rows only, zero notification rows. Matches anti-cry-wolf copy already on W5. |

### 2f. Revocation enforcement (engine side of W6)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E32 | L1 Pause / Resume · L2 Freeze / Unfreeze | One HTTP call flips agent status; next pay attempt is refused at the gate (E14) | `POST /api/leash/revoke {level}` / `{resume:true}`; status enum on agents | DB + pay gate | REAL_MVP | Copy honesty: Leash does not run the agent's loop — L1 "stops the agent loop" is inaccurate; both L1/L2 stop **payments** at the control layer. Distinct states kept (different chips/semantics), enforcement identical → copy delta S8 for web domain. "Every action is an HTTP call — nothing on-chain" is already honest. |
| E33 | L3 Cancel — "rotates your server key" | All Leash keys revoked + status `cancelled`; agent cannot pay until owner generates a new key and re-installs it | Revoke every active leash_key row + status flip; "Provision new key" = E11 generate + snippet re-copy | DB | REAL_MVP | Honest mapping: the rotated credential is the **Leash key** (the only credential in the agent's environment — matching W7's "Held in your agent's environment"). The TEE wallet key itself has no documented rotation (unverified) and doesn't need one. |
| E34 | L4 Nuclear — "permanently deletes your server key. There is no recovery." | Agent tombstoned irreversibly at the Leash layer: keys deleted, signing permanently refused, status `not_provisioned`-equivalent (`nuked`); floats remain withdrawable by the owner (E39) | Irreversible DB tombstone enforced at every signer endpoint | DB; (Magic wallet **deletion** endpoint: none documented — unverified) | REAL_MVP | Copy deviation required: Magic Express provisioning is **idempotent per user+chain** (eco-particle-magic §3) — re-provisioning returns the SAME address, so "no recovery" is true of the Leash agent + credentials, not of the underlying key. Reword L4 copy to Leash-layer permanence ("deletes every credential and permanently retires this agent; funds stay withdrawable") → Delta S9. Verify at spike whether a wallet-delete endpoint exists; if yes, upgrade. |
| E35 | Post-nuclear REPROVISIONING (W8) | Owner provisions a **new agent** through the same dashboard flow (E36) | New agents row (+ new Magic wallet if a different chain-user binding, else same address documented honestly) | same as E36 | REAL_MVP | Dead-end check (canton rule 16): the nuked state names its exit — "Provision new agent". |

### 2g. Provisioning + funds (W8 Setup & funds)

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E36 | Server-key provisioning (dashboard "Set up agent") | Owner clicks once; agent EOA appears | Backend `POST /v1/wallet` (Bearer owner-JWT, `X-Magic-API-Key`, `X-OIDC-Provider-ID`, `X-Magic-Chain: ETH`) → `{public_address}` stored | Magic Express API + our OIDC issuer (B1) | REAL_MVP | Idempotent per user+chain — safe to retry. One agent per owner in v0 (address is per user+chain); schema leaves room for 1:N later. |
| E37 | W8 provisioning step "Run `npx leash provision` in your server environment" (mock CLI, D13/H12/Q4) | — | No CLI exists or is needed; provisioning is a product action (E36) — a CLI would break the stranger test for non-terminal owners | — | OUT_OF_SCOPE | CUT — recorded deviation (Q4 resolved: dashboard-driven provisioning; rewrite W8 steps: 1 "Set up agent" click, 2 fund address, 3 set cap). |
| E38 | Agent address display (W1 short / W8 full, "same on every network", copy) (H4) | Real EOA rendered + clipboard | `agents.wallet_address` from the Magic provision response; secp256k1 EOA ⇒ same address on every EVM chain (true) | — | REAL_MVP | Mock `0x7F3a…9C4e` never ships; a not-yet-provisioned agent shows the NOT_PROVISIONED state (designed). |
| E39 | **Withdraw float (NEW surface — money-out, canton rule 10)** | Owner sends float USDC from the agent address to any address they name | `ua.createTransferTransaction({token:{chainId, USDC}, amount, receiver: ownerAddress})` signed via TEE (`sign/message` for rootHash + `sign/eip7702` for authorizations) — gas abstracted by UA, so pure-USDC floats can exit | UA SDK 2.0.3 + Magic Express sign endpoints | REAL_MVP | Not in the prototype — added so "how does value leave?" has a real answer before Abu asks. Base + Arbitrum in v0; Polygon withdraw REAL_LATER (no UA support; needs gas-funded relay). Designer needs a small W8 addition → Delta S10. |
| E40 | Per-chain float balances (W1 breakdown + W8 rows) | Live per-chain USDC numbers | `balanceOf(USDC, agentAddress)` via viem publicClient per chain RPC | viem + RPC URLs (B7) | REAL_MVP | Mock sets (14.20/6.10/4.50 etc.) never ship; a fresh agent shows $0.00 (designed EMPTY state). Note: Polygon float is invisible to `getPrimaryAssets` (UA V2 has no Polygon) — direct RPC is the only honest source for it. |
| E41 | Float total ("$24.80 · one total across three networks") | Sum of E40 reads | computed | — | REAL_MVP | This is the FLOAT SUM, not the treasury (discovery D1) — keep the design's cleaner framing but fix the label if Polygon is dropped ("across two networks"). |
| E42 | Owner unified treasury total (D1/Q1 — absent from prototype) | "Your unified balance: $X" shown beside the top-up control so the owner knows a $20 top-up can succeed | `ua.getPrimaryAssets().totalAmountInUSD` (server-side UA init with `smartAccountOptions{useEIP7702:true, ownerAddress: agentAddress}`; NO `universalGas`, NO flat init — SDK 2.0.3) | `@particle-network/universal-account-sdk@2.0.3` + Particle keys (B2) | REAL_MVP | Q1 answered YES (map required it; top-up area is the home). Caveat displayed value includes the floats themselves (same address) — label as "Unified balance (includes floats)" for honesty. |
| E43 | Top-up "Add funds from your unified balance" (+ in-progress bar, success/error toasts) | Real UA cross-chain transfer lands USDC on Base at the agent address; progress reflects real status | `createTransferTransaction({token:{BASE, USDC}, amount, receiver: agentAddress})` → TEE-sign rootHash + 7702 auths → `sendTransaction(tx, sig, authorizations)`; completion detected by destination `balanceOf` increase / UA transaction status; `transactionId` links to universalx.app | UA SDK 2.0.3 + Magic Express `/v1/wallet/sign/message` + `/v1/wallet/sign/eip7702` (dec→hex r/s conversion) | REAL_MVP | Gated by the funded live spike (Constraint 4 / B8): external-receiver + self-transfer are doc-proven, never run live. Error toast "unified balance may be insufficient" maps to real `UniversalError.code/data`. |
| E44 | Auto-rebalance watcher + REBALANCING state ("topping up · +$6.00 arriving") (H5) | When a float drops below threshold, a background UA transfer fires; in-flight amount + destination shown | Post-payment event check + cron route: if `balance < max($5, 25% of target)` → same call as E43; rebalances row `{amount, dest_network, ua_transaction_id, status}` drives the spinner/row copy | UA SDK + cron (Vercel cron or node worker) | REAL_MVP | The flagship UA cross-chain move (R-LEASH-6, AC-LEASH-5). Never in the pay hot path. "+$6.00 arriving" reads the real pending rebalance row — no invented numbers. |
| E45 | REBALANCE_COMPLETE (missing state, discovery D5) | Row flips to a brief completed notice; totals recalc from live reads | rebalance row status → `complete` when destination balance reflects the transfer | same as E44 | REAL_MVP | Engine provides the state; designer adds the visual → Delta S11. |
| E46 | Low-balance threshold ("below $5.00, or below 20% of your last top-up") | LOW/EMPTY chips + T2 warning | computed from E40 reads + last top-up amount (rebalances/topups history) | ledger | REAL_MVP | |
| E47 | Polygon **pay** leg (W1/W2/W3/W8 Polygon rows) | Agent can pay x402 resources demanding `eip155:137` from a Polygon float | EIP-3009 USDC on Polygon (`0x3c499c…3359`, verified) + CDP facilitator Polygon ACTIVE + TEE signer is chain-agnostic; float funded by **direct deposit** to the agent address on Polygon | viem + Magic sign (same path as Base/Arb) | REAL_MVP | Mechanically real — BUT contingent on Abu's Polygon decision (B5). If dropped, all Polygon UI rows go with it (visual change; 2-chain layout). |
| E48 | Polygon **auto-rebalance** leg (treasury → Polygon float) | — | IMPOSSIBLE via UA: SDK 2.0.3 `CHAIN_ID` has no Polygon (V2 trimmed to 6 chains — eco-particle-magic §1) | — | BLOCKED | Named Abu decision (B5): (a) drop the Polygon leg entirely (recommended: simplest honest product; W8 caption already Base-first), or (b) keep Polygon pay with manual-deposit top-up, labeled "manual top-up — not auto-rebalanced", auto path via Circle CCTP as REAL_LATER. Spec R-LEASH-1/6 float table must be amended either way → Delta S3. |

### 2h. Cross-cutting / remaining

| # | Surface | Visible behavior | REAL source | Required integration | Label | Note |
|---|---|---|---|---|---|---|
| E49 | Explorer links (Basescan/Arbiscan/Polygonscan) per receipt | txHash links out to the settlement network's explorer | URL template per CAIP-2 + real txHash | — | REAL_MVP | |
| E50 | EXPLORER LINK UNAVAILABLE state (W3; H9) | Grayed link + copyable hash when explorer is down | Requires live reachability checks per explorer | health-check ping | REAL_LATER | Graceful-degrade state exists visually; actively detecting explorer downtime is gold-plating for v0 — link always renders, hash always copyable. Honest: state ships when detection ships. |
| E51 | Magic Policy Evaluation (Global rules) as defense-in-depth under the cap | TEE-side per-tx guardrails (max per-tx value, chain allowlist) | Magic dashboard toggle + policy CRUD | Magic Express policy API | REAL_LATER | New capability (eco-particle-magic §3); per-transaction only — never a substitute for the cumulative 403. |
| E52 | Solana x402 resources | — | — | — | OUT_OF_SCOPE | Decided v0 exclusion (DECISIONS.md); Leash logs a `failed`/`reason: UNSUPPORTED_NETWORK` receipt if a 402 offers only Solana, so the gap is visible, not silent. |
| E53 | Demo x402 target for the golden loop (OQ-3) | The stranger-agent loop needs a real x402-gated resource to pay | Options: Tab's own x402 endpoint (Story 9 — cross-domain; mainnet needs CDP facilitator keys on the SELLER side) or a public x402 resource | Tab rail (other domain) or external | BLOCKED | Abu decision B6. Note network honesty: if any leg runs on Base Sepolia via the open facilitator (`https://x402.org/facilitator`, testnet-only), the UI/deck must label "Test funds — not real money" (canton rule 20). |
| E54 | Agent display name "Research Agent v2" | Owner names the agent at provisioning; name used in L4 typed confirm | `agents.name` — user-entered, required field in the provisioning form | — | REAL_MVP | No fabricated names; the provisioning form (web domain) needs a name input → Delta S12. |

---

## 3. Mock-coverage register (every engine-domain mock from discovery → labeled row)

| Discovery mock | Row |
|---|---|
| `.mcp.json` snippet, `@leash/mcp`, `LEASH_KEY` (H11) | E1 |
| Full/masked `leash_sk_…` keys, prefix change (D9, H10) | E11/E12 |
| Client "Claude Code", transport, "First seen Jul 2 14:02", "23 this cycle" (D14, H1) | E9 |
| "401 invalid key at 14:31", REJECTED badge (D7, H2) | E10 |
| Spend figures $4.20/$7.60/$10.00/$0.00 vs $10.00 cap | E13/E24/E25 (all derived from real ledger + cap) |
| "Resets daily · Next reset Jul 3 … in 9h 37m" (D12, H6) | E25 |
| Cap-reset banner "resumed automatically" | E25 |
| "Reset cycle" link | E26 |
| Overage 140% + "$1.20 of overage…" (H13) | E27 |
| "2 blocked attempts this cycle" (H8) | E28 |
| Feed rows w/ fabricated domains (searchgrid.io, arxival.net, mapgrid.dev, lexiconapi.com, newswire.dev, premium.datamall.xyz) + txHashes | E19/E23 — never seeded; feed starts EMPTY, fills from real payments |
| Pending row with txHash `0x6c8e…2b4a` (Q12) | E20 (CUT) |
| Full txHash / RESOURCE URL / TIMESTAMP fixed per state (D17) | E18/E19 — every field per-receipt from real settlement data |
| TRIGGER URL `research.lab/tasks/lit-review-142` (H3, Q5) | E21 (CUT) → E22 (real replacement) |
| Blocked row NETWORK "—" (D20, Q10) | E19 (store + show intended network) |
| Notification items (T2 76%, T3 halted, first-seen datamall, resolved T3) (H7, Q11) | E29/E30/E31 |
| Agent address `0x7F3a…9C4e` (H4) | E38 |
| Key health "last rotation Jun 12, 2026" | E12 (real timestamps from key rows) |
| Float sets 14.20/6.10/4.50 · 2.10/0.90/0.50 · totals $24.80/$3.50/$0.00/$23.50 | E40/E41 |
| "topping up · +$6.00 arriving" (H5) | E44 |
| Top-up "$20.00", toasts, "lands on Base first" | E43 |
| `npx leash provision` (D13, H12, Q4) | E37 (CUT) → E36 |
| "Live · ~3s polling" chip/footer (D10) | E23 (engine side; copy call = web domain) |
| Agent name "Research Agent v2", owner "Abu / abu@example.dev" | E54 + real session identity (web domain) |
| L1–L4 copy + statuses (W6) | E32–E35 |
| Base-first single top-up replacing per-chain selectors (D4/D6/Q2) | E43/E44 — ACCEPT the Base-first model (matches R-LEASH-6 async rebalancing; per-chain selectors would re-expose chain mechanics). Deviations register entry. |
| UA treasury total absent (D1/Q1) | E42 (ADD it) |
| REBALANCE_COMPLETE missing (D5) | E45 |
| Polygon rows everywhere | E47/E48 (decision B5) |

No engine-domain mock from the discovery raw is unaccounted for.

---

## 4. Data-model candidates (tables + key fields)

- **users** — id, email (unique), created_at. (Magic email-OTP identity; shared with merchant dashboard user model or separate — web domain decides.)
- **agents** — id, user_id FK, name, status enum `not_provisioned|active|paused|frozen|cancelled|nuked`, wallet_address (from Magic `POST /v1/wallet`), provisioned_at, created_at. v0: unique(user_id).
- **leash_keys** — id, agent_id FK, key_hash (sha256), prefix (`leash_sk_`), last4, created_at, revoked_at, last_used_at, last_auth_failure_at, last_auth_failure_code.
- **caps** (or columns on agents) — agent_id, amount_usd numeric nullable (null = NO CAP SET state), frequency enum `daily|weekly|monthly|never`, updated_at.
- **cycles** — id, agent_id, started_at, ended_at nullable, reset_reason enum `schedule|manual|frequency_change`. Current cycle = open row; auto-rollover creates the next on first read/write past boundary.
- **receipts** — id, agent_id, cycle_id, status enum `pending|success|failed|blocked`, reason nullable enum `CAP_EXCEEDED|FLOAT_EMPTY|SIGNER_REJECTED|FACILITATOR_REJECTED|UNSUPPORTED_NETWORK`, amount_atomic bigint, asset_address, network_caip2, intended_network_caip2 (blocked rows), resource_url, tx_hash nullable, settlement_raw jsonb (PAYMENT-RESPONSE), origin_client, origin_tool, transport enum `mcp|fetch`, created_at, settled_at nullable.
- **connections** — agent_id, client_name, client_version, transport, first_seen_at, last_seen_at.
- **floats** — agent_id, network_caip2, target_usd, last_balance_atomic, last_checked_at. (Display always re-reads chain; this row is the watcher's cache/threshold config.)
- **rebalances** — id, agent_id, kind enum `auto|manual_topup|withdrawal`, dest_network_caip2, dest_address (withdrawals), amount_usd, ua_transaction_id, status enum `pending|complete|failed`, started_at, completed_at.
- **notifications** — id, agent_id, tier enum `2|3`, type enum `near_limit|halted|first_domain|cap_lowered_halt|float_low|float_empty`, message, meta_amount_usd, meta_resource, receipt_id nullable, unread bool, sticky bool, resolved_at nullable, created_at.
- **revocations** — id, agent_id, level 1–4, action enum `apply|resume`, actor_user_id, created_at (audit trail).

---

## 5. API / route inventory

Owner-session APIs (dashboard; real auth, no demo entry):
- `POST /api/leash/agent` (provision: name + Magic `POST /v1/wallet`), `GET /api/leash/agent`
- `POST /api/leash/keys` (generate, plaintext once), `POST /api/leash/keys/rotate`
- `GET|PUT /api/leash/cap`, `POST /api/leash/cycle/reset`
- `GET /api/leash/receipts?cursor=`, `GET /api/leash/receipts/:id`
- `GET /api/leash/floats` (per-chain RPC reads + treasury `getPrimaryAssets` total)
- `POST /api/leash/topup`, `POST /api/leash/withdraw`, `GET /api/leash/rebalances`
- `GET /api/leash/notifications`, `POST /api/leash/notifications/:id/read`, `POST /api/leash/notifications/read-all`
- `POST /api/leash/revoke` `{level, action}`
- `GET /api/leash/connection`

Proxy/wrapper-facing APIs (auth: `Authorization: Bearer leash_sk_…`):
- `POST /api/agent/connect` — handshake: `{clientInfo, transport}` → 200 (records connection) / 401 (records auth failure)
- `POST /api/agent/pay` — `{paymentRequired (accepts[]), context {clientName, toolName, transport}}` → `{paymentPayload}` | 403 `LEASH_CAP_EXCEEDED` | 423 `AGENT_PAUSED|AGENT_FROZEN|AGENT_CANCELLED` | 409 `LEASH_FLOAT_EMPTY` (writes the pending/blocked/failed receipt row server-side)
- `POST /api/agent/pay/result` — `{receiptId, settlementHeader}` → finalizes pending → success/failed

Internal:
- `POST /api/internal/rebalance` (cron-invoked; also triggered inline after each settled payment)
- OIDC: `GET /.well-known/jwks.json` + JWT issuance bound to the owner session (required by Magic Express Bearer auth — B1)

Packages (pinned per eco re-verification): `@modelcontextprotocol/sdk@^1.29.0`, `@x402/mcp@2.17.0`, `@x402/fetch@2.17.0`, `@x402/evm@2.17.0`, `@x402/core@2.17.0`, `viem@^2.48`, `@particle-network/universal-account-sdk@2.0.3`, `magic-sdk@33.9.0` (dashboard auth), Magic Express API via plain HTTPS, `zod`, `jose` (OIDC JWTs).

---

## 6. Blockers (Phase 0 — Abu actions, run in parallel)

- **B1 — Magic account + Express API wiring.** Create Magic app → Publishable + Secret keys; configure an OIDC provider (we host the issuer: `jose` JWTs + JWKS endpoint in apps/web, registered in the Magic dashboard → `X-OIDC-Provider-ID`); set Allowed Origins. Then **empirically verify free-tier Server Wallet provisioning** (docs show no gating; partially verified — eco-particle-magic §3). Fallback if gated: server-held key in backend KMS, labeled, same cap logic (recorded deviation).
- **B2 — Particle dashboard project** → projectId / clientKey / appId for UA SDK 2.0.3 (no chain allowlist exists; nothing to configure per-chain).
- **B3 — Funding.** Real USDC to the generated agent address: Base $20–50, Arbitrum $10–20 (+ Polygon $5 only if B5 keeps the leg), plus treasury assets on a non-float chain to make the rebalance demo a genuine cross-chain move. Abu funds after we generate the address (per DECISIONS.md faucet row).
- **B4 — npm publish access.** `leash-mcp` / `leash-fetch` (or `@leash/*` org) name availability + an npm account to publish from. Without a published package the W7 snippet fails the stranger test.
- **B5 — Polygon decision.** UA V2 dropped Polygon (SDK 2.0.3). Choose: drop the Polygon leg (recommended) or keep pay-only with manual deposits + "manual top-up" label (auto via CCTP = REAL_LATER). Affects W1/W2/W3/W8 visuals + spec R-LEASH-1/5/6.
- **B6 — Demo x402 target (OQ-3).** Tab's own x402 endpoint (needs CDP API keys for mainnet seller-side settlement — cross-domain with the Tab rail) vs a public x402 resource. If any leg is testnet (open facilitator = Base Sepolia only), UI/deck must carry "Test funds — not real money" labels.
- **B7 — RPC endpoints.** Public RPCs work; optional Alchemy/Infura keys for reliability on Base/Arbitrum(/Polygon).
- **B8 — Funded live spike** (already Task #2): first Express wallet provision; `createTransferTransaction` self-top-up AND external receiver executed live; `/v1/wallet/sign/eip7702` dec→hex path; verify Claude Code's `clientInfo` string. Gates all "rebalance is real" claims (spec Constraint 4).
- **B9 — Database provisioning** (Postgres — Neon/Supabase/Vercel PG). The receipts ledger is the cap's source of truth; SQLite-in-repo would fail multi-instance deploys.

---

## 7. Spec / story deltas caused by this mapping

- **S1 — Stack split:** `apps/agent` = publishable thin client packages (`leash-mcp`, `leash-fetch`); hosted-signer client, cap gate, ledger, cycle engine, rebalancer live in `apps/web` server code (+ cron). Update DECISIONS.md stack row + quality-profile package table.
- **S2 — R-LEASH-3 wording:** the 403 is issued by the Leash signing service in front of the Magic TEE (cumulative logic is ours; Magic Policy Evaluation = optional per-tx defense-in-depth, new capability). Pitch copy must not claim the TEE computes cumulative spend.
- **S3 — R-LEASH-1/5/6 float table:** Polygon leg contingent on B5; UA V2 supports only 6 chains (no Polygon). World leg silently dies too (never committed).
- **S4 — R-TAB-5-style init snippets anywhere in spec:** SDK 2.0.3 — no `universalGas`, no flat `ownerAddress`; nested `smartAccountOptions` only.
- **S5 — Story-3 AC fix:** "reads the `X-PAYMENT-REQUIRED` header" → v2 `PAYMENT-REQUIRED` header / v1 402+JSON body; MCP detection must cover JSON-RPC `-32042` + `402` error surfaces (new).
- **S6 — CONNECTION_ERROR semantics:** adopt 401-auth-failure telemetry (prototype) over the surface map's 24h-unused heuristic; update surface map.
- **S7 — Receipt status enum:** `pending|success|failed|blocked` (adds `pending`); cap accounting counts settled+pending; blocked rows carry `intended_network`; `trigger_url` field replaced by `origin {client, tool, transport}`.
- **S8 — W6 copy honesty:** L1 copy "Stops the agent loop" → payments-stop phrasing (Leash never runs the owner's loop); L1/L2 enforcement identical at the gate, semantics differ in UI only.
- **S9 — L4 copy honesty:** "permanently deletes your server key… no recovery" → Leash-layer permanence (credentials deleted, agent retired forever, funds withdrawable); Magic provisioning is idempotent (same address returns). Verify wallet-delete endpoint at spike; upgrade copy if it exists.
- **S10 — New requirement (money-out):** Withdraw float — UA transfer from agent address to owner-named address (Base/Arb v0; Polygon REAL_LATER). New W8 element for designer; new story scenario.
- **S11 — W8 REBALANCE_COMPLETE state** to be designed (engine provides it).
- **S12 — Provisioning form needs an agent-name input** (source of "Research Agent v2"-style display names; no fabricated names).
- **S13 — Rename `story-7-owner-picks-model.md`** → `story-7-owner-connects-agent.md` (content already repurposed; filename still carries the dead model-picker concept).
- **S14 — Q2/D4 accepted:** Base-first single top-up + background rebalance (no per-chain destination selectors); surface map updated to match prototype.
- **S15 — OQ-W9 resolved (proposed):** rebalance events are Tier-1 ambient = rows in rebalance history only; no notification entries.

---

## 8. Deviations register (dated 2026-07-06)

| Decision | Label | Rationale |
|---|---|---|
| Pending-with-txHash feed row | CUT | Payer has no hash until PAYMENT-RESPONSE; rendering one would be fabricated data. |
| TRIGGER URL field | CUT → replaced | Not truthfully capturable by an MCP stdio proxy; replaced with real origin (client/tool/transport). |
| `npx leash provision` CLI | CUT | Provisioning is a dashboard product action (Magic `POST /v1/wallet`); a CLI step breaks the stranger loop and was never specced. |
| MITM proxy + CA cert | OUT_OF_SCOPE (v0) | Decided last-resort; not needed for the judged paths. |
| Solana x402 | OUT_OF_SCOPE (v0) | Decided; unsupported-network attempts logged visibly. |
| Polygon auto-rebalance | BLOCKED (B5) | UA V2 removed Polygon; drop leg or manual top-up — Abu decision. |
| Explorer-unreachable detection | REAL_LATER | Visual state kept; health-checking explorers is v0 gold-plating. |
| Magic Policy Evaluation | REAL_LATER | Defense-in-depth only; per-transaction. |
| Polygon float withdrawal | REAL_LATER | No UA path; needs gas-funded relay or CCTP. |
| L4 "no recovery" copy | Reworded | Magic provisioning idempotent — permanence is Leash-layer; funds must stay withdrawable (money-loop rule). |
| Base-first top-up model (D4/D6) | ACCEPTED | Matches async-rebalance architecture; avoids re-exposing chain selection to the owner. |
| Seeded feed/notification content | NEVER | All feed/notification/float numbers derive from live reads or real events; fresh agent shows designed EMPTY states. |

*End of Leash-engine reintegration raw.*
