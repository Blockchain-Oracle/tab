# Decisions Log — uxmax (Tab + Leash)

Append-only. The durable record of what's decided vs still open, so we don't re-litigate.
Status legend: **DECIDED** · **PROPOSED** (awaiting Abu's accept) · **DEFERRED** · **CORRECTED** · **UNKNOWN**.

| Date | Topic | Status | Detail |
|------|-------|--------|--------|
| 2026-07-02 | Product | **DECIDED** | ONE submission = **Tab + Leash** on one payment rail. Tab = Stripe-style crypto pay-button SDK + checkout. Leash = autonomous agent that pays x402 within a capped allowance + spend dashboard + mobile monitor. |
| 2026-07-02 | Spec | **DECIDED** | Spec accepted by Abu ("STORIES LETS GO"). See `.thoughts/specs/2026-07-02-tab-leash.md`. Reviewed: every requirement source-cited, deadline-free, unverified items flagged. |
| 2026-07-02 | Agent LLM | ~~**DECIDED**~~ **SUPERSEDED (see below)** | ~~Model-agnostic via **Vercel AI SDK + OpenRouter**. **End-user selects the model** (Claude / GPT / Gemini / etc.) — a product feature. Env: `OPENROUTER_API_KEY`. NOT hard-wired to Anthropic.~~ Leash has NO LLM and NO model picker. The agent is the user's own external agent (Claude Code, Cursor, etc.). Leash is purely a payment control plane — it intercepts x402 challenges and auto-pays; it does not generate or route LLM calls. |
| 2026-07-02 | Tab-as-x402-resource | **DECIDED** | The "one rail, two payers" endpoint is a **core goal, but sequenced LAST** — built after the two proven legs (human pays Tab; agent pays a public x402 API) and spiked early to de-risk (it's the only end-to-end-unverified combo). Safe if it wobbles, differentiator if it lands. |
| 2026-07-02 | Stack | **DECIDED** | (accepted 07-02) TS monorepo (pnpm + Turborepo): `packages/sdk` (PayButton), `apps/web` (Next.js 14: checkout + intent API + webhook + Leash dashboard), `apps/agent` (headless x402 payer), `apps/mobile` (PWA). Libs: viem, `@particle-network/universal-account-sdk`, `magic-sdk`/`@magic-sdk/admin`, `@x402/fetch`+`@x402/evm`, Vercel AI SDK + `@openrouter/ai-sdk-provider`. |
| 2026-07-02 | Mobile | **DECIDED** | Responsive **PWA** (monitor + push + revoke; no on-device signing). Not native Expo. |
| 2026-07-02 | Custom contract | **DECIDED** | **No** Solidity contract — spend cap is app-layer policy (per wiki). Revisit only if a concrete judge-facing on-chain requirement emerges. |
| 2026-07-02 | CDP (Coinbase) | **CORRECTED** | **NOT needed.** As the x402 *payer*, the agent signs locally; the *seller's* facilitator settles. Only relevant IF Tab hosts its own x402 endpoint. (Earlier inclusion was speculative — an error.) |
| 2026-07-02 | Submission deadline | **NOT A FACTOR** | Per Abu: deadline is not a concern and won't be provided — **stop referencing it.** Scope is decided on product/demo merits, NOT a countdown. |
| 2026-07-02 | Faucet / funding | **DEFERRED** | Not this stage. At the live spike, I generate the agent address; Abu funds it. |
| 2026-07-02 | Keys required | **DECIDED** | Particle (Project ID / Client Key / App ID), Magic (Publishable + Secret), OpenRouter (API key). Optional/later: Alchemy RPC. NOT needed: CDP. |
| 2026-07-02 | Agent x402 float chain | ~~**DECIDED**~~ **SUPERSEDED (see below)** | ~~Agent USDC float standardized on **Arbitrum One (42161)**.~~ Single-chain assumption is wrong; see "Leash multi-chain floats" row below. |
| 2026-07-02 | Blocked-payment status | **DECIDED** | Cap-blocked attempts get a distinct `blocked` status (never issued an x402 call). Ledger status enum = `success \| failed \| blocked`. |

| 2026-07-02 | Merchant dashboard | **DECIDED** | A REAL multi-tenant product surface (NOT a demo add-on): Sign Up (MA1) + Log In (MA2) via standard Magic email-OTP (same SDK as buyer flow), API keys (M3), Transactions (M4), Webhooks + HMAC signing secret (M5/M6), Settings (MA3). Each merchant account and data fully isolated. Right-sized scope: no SSO, 2FA, team/roles/org management, or billing tiers. |
| 2026-07-02 | Settlement token | **DECIDED** | **USDC on Arbitrum One** (native Circle USDC, EIP-3009-capable). Verify exact contract address at build. Resolves OQ-B3 / OQ-M2 / spec-OQ-4. |

---
<!-- === CORRECTED LEASH ARCHITECTURE — 2026-07-02 === -->

| Date | Topic | Status | Detail |
|------|-------|--------|--------|
| 2026-07-02 | Leash feasibility | **DECIDED** | PROCEED. Cascade research confirms the x402 payment interception pattern is real and implementable. Leash wedge = payment control plane + Particle UA wallet. No LLM, no model routing — purely infrastructure. |
| 2026-07-02 | Leash interception | **DECIDED** | Two adapters, one wallet core. **PRIMARY (~90% of traffic):** MCP stdio proxy (`@x402/mcp` + `@modelcontextprotocol/sdk`) — catches JSON-RPC payment challenges from Claude Code/Desktop, Cursor, OpenClaude; no CA cert required. **SECONDARY:** HTTP fetch-wrapper (`@x402/fetch`) — covers all direct HTTP calls incl. Vercel/Next-served endpoints. **LAST RESORT (opt-in only):** transparent MITM proxy + user-installed CA cert — for clients that can't use MCP or fetch-wrapper. |
| 2026-07-02 | Leash custody/cap | **DECIDED** | **Hosted signer**: Magic Server Wallet (TEE). Key never leaves the hosted signer. Cap enforced **server-side** (overspend → 403 before any x402 call is made) — app-layer policy, NOT on-chain session keys (Particle session keys are Biconomy-v2.0.0-only, unavailable on a 7702 UA). Monitoring = signer audit log. Kill switch = invalidate credential. |
| 2026-07-02 | Leash multi-chain floats | **DECIDED** | x402 resources dictate chain (~75% Base, 8% Polygon, 6% Arbitrum, 12% Solana EVM-side). On-demand cross-chain bridging is too slow (10–90s) for the hot path. **Solution: pre-position small USDC floats** on Base (PRIMARY), Arbitrum, Polygon. Middleware routes each payment to the matching float per the CAIP-2 `network` field in the 402 `accepts[]`. The Particle UA treasury **async rebalances floats in the background** (`createTransferTransaction`) — bridge is never in the hot payment path. This async treasury→float top-up IS the flagship UA-track cross-chain move. |
| 2026-07-02 | Solana | **DECIDED** | **Out of scope v0.** EVM-only (7702). Solana x402 resources (~12%) will simply not be auto-paid by Leash v0; document as known gap. |
| 2026-07-02 | CDP (Coinbase) clarification | **CORRECTED** | **NOT needed as payer.** Leash signs payments locally; the seller's facilitator settles. CDP's network support list matters only for which chains Tab can serve as an x402 endpoint (seller-side). No CDP dependency in Leash or Tab payer path. (Supersedes earlier speculative inclusion.) |
| 2026-07-02 | Tools/stack update | **DECIDED** | **ADD:** `@x402/core`, `@x402/fetch`, `@x402/mcp`, `@modelcontextprotocol/sdk`, `@magic-sdk/admin` Server Wallets (TEE signer for Leash), `@particle-network/universal-account-sdk`, `viem`. **DROP:** `vercel/ai` SDK, `@openrouter/ai-sdk-provider` (no LLM in Leash; OpenRouter not needed). Tab checkout retains Magic embedded SDK for human buyers. |
| 2026-07-16 | Webhook retry schedule | **DECIDED** | Exactly three total HTTP attempts: attempt 1 dispatches inline immediately after verified settlement; a failure schedules attempt 2 after 1 minute; a second failure schedules attempt 3 after 4 minutes. Each attempt has a 10-second response timeout. A third failure immediately records terminal `gave_up`; there is no 16-minute delay and no fourth request. Supersedes the 2026-07-06 `1m/4m/16m` proposal. |

## Open (awaiting Abu / build-time)
- **Live settlement spike** (gating for the Tab demo) — needs Particle + Magic keys + a little funding. Action, not a decision.
- Build-time picks I'll handle: the x402 demo target (public test API vs Tab's own endpoint), exact USDC contract address on Arbitrum One, UA V2 version pinning.
