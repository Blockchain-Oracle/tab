# Plan: Tab + Leash — Full Build

> Date: 2026-07-06
> Inputs: reintegration synthesis `2026-07-06-tab-v1.md` (234-row matrix, canonical) · spec `2026-07-02-tab-leash.md` (incl. R-TAB-11/12/13, R-DASH-4, Constraint 14) · stories 1–9 · quality profile `2026-07-02-project-quality-profile.md` · DECISIONS.md (incl. 2026-07-06 gate-accepted block) · eco re-verification `2026-07-06-eco-particle-magic.md` + `2026-07-06-eco-x402-mcp.md`.
> Authority: this plan consumes **only the reintegration synthesis** for row-level facts. The four reintegration raws are superseded for planning purposes.
> Scope disclaimer (per reintegration Verdict): **2 dashboards (merchant + Leash) + buyer checkout SDK + 3 publishable npm packages + MCP stdio proxy + PWA with real Web Push + self-hosted OIDC issuer + cron/inline workers + ~20 Postgres tables**. This is not a one-surface project.

---

## Inputs

| Input | Location | Status |
|---|---|---|
| Prototype reintegration synthesis | `.thoughts/prototype-reintegration/2026-07-06-tab-v1.md` | Accepted 2026-07-06 ("take it away") |
| Spec (incl. R-TAB-11/12/13, R-DASH-4, Constraint 14) | `.thoughts/specs/2026-07-02-tab-leash.md` | Accepted 2026-07-02 |
| Stories 1–9 | `.thoughts/stories/` | Accepted with story-delta proposals |
| Quality profile | `.thoughts/quality/2026-07-02-project-quality-profile.md` | Authoritative |
| DECISIONS.md | `.thoughts/decisions/DECISIONS.md` | 2026-07-06 gate block appended |
| Eco: Particle + Magic | `.thoughts/research/2026-07-06-eco-particle-magic.md` | Ground truth for SDK versions/shapes |
| Eco: x402 + MCP | `.thoughts/research/2026-07-06-eco-x402-mcp.md` | Ground truth for x402/MCP versions/shapes |

---

## Assumptions

1. **Abu batch-approves spec deltas before agents write code.** The deltas (R-TAB-4 headless, SD-F lifecycle, SD-I sk plane, SD-J buyer money-in, SD-N remote-signer + cap rule, SD-O revocation model, SD-L Polygon drop, DECISIONS corrections) are the seams agents would otherwise resolve silently. This plan treats them as accepted per the 2026-07-06 DECISIONS block — but any un-signed item becomes a blocker if a build agent hits it.

2. **Package names are reserved before Phase 6 publish-unblocked work begins.** The plan uses `@tab/sdk`, `leash-mcp`, `leash-fetch` as working names. If npm reserves fail, names must change; the MCP `.mcp.json` snippet in the dashboard changes with them.

3. **Postgres is Neon or Supabase (serverless, connection pooling included).** The exact provider does not affect schema or routes. `DATABASE_URL` is the env contract.

4. **Vercel is the deployment target for `apps/web`.** HTTPS origin, Magic allowed-origins config, and Web Push domain are all Vercel-first. If this changes, the OIDC issuer registration and origin configuration must be revisited.

5. **`apps/mobile` is a PWA** (confirmed DECIDED 2026-07-02). It lives as a route family inside `apps/web` or a separate Vite build deployed to the same domain. No Expo.

6. **Magic Express API is accessible on the free Developer tier** (1,000 MAW, no documented plan gating for Server Wallets). This is marked `(unverified — confirm at first provision)` in the eco doc. The plan treats it as provisionally available; if the spike finds a paywall, the custody-fallback PROPOSED row fires and copy/deck receive the pre-authored KMS-fallback text.

7. **The canonical USDC addresses are:** Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Arbitrum One `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. Both triple-confirmed from npm tarballs + Circle docs (`2026-07-06-eco-x402-mcp.md §3`).

8. **`@particle-network/universal-account-sdk` is pinned at `2.0.3`** (V2 GA). All integration code is written against the published tarball `.d.ts`, not the stale docs clone. The nested `smartAccountOptions` init is the only valid form at `2.0.3`.

9. **`@x402/*` packages are pinned at `~2.17.0`** and `@modelcontextprotocol/sdk` at `^1.29.0`. The v2 beta `@modelcontextprotocol/server@2.0.0-beta.2` is never imported.

10. **`apps/web` is Next.js 16.2.6+** (confirmed DECIDED 2026-07-06). `@x402/next@2.17.0` peer-requires `next >=16.2.6`. The quality profile's "Next.js 14" reference is superseded.

11. **Magic Core API v1 is never used.** It retires 2026-07-31. Express API only (`tee.express.magiclabs.com`).

12. **The Polygon float leg is dropped for v0** (confirmed DECIDED 2026-07-06). Float chains are Base (primary) + Arbitrum One only.

13. **The x402 demo target (B-10) will be resolved by Abu within 24h of Phase 0 start.** The plan marks Phase 6 agent demo-target wiring as gated on this decision. If no live public x402 resource is named in time, pre-written Sepolia test-funds labels are applied immediately — this is never decided silently in code.

---

## Open Questions

These are not resolved by this plan. Each is a named spike item or a decision for Abu.

| # | Question | Blocks |
|---|---|---|
| OQ-B03 | Does a new OIDC subject yield a new TEE wallet address for the same owner? (L3 Cancel copy pick) | H-2 copy variant, Phase 8 cancel story |
| OQ-B04-root | Which Magic Express endpoint reproduces `personal_sign(rootHash)` — `sign/message` or `sign/data` over the EIP-191 digest? | Phase 10 spike script |
| OQ-B04-tx | Does `TransactionResult` contain a dest-hash for disambiguating by UA sender address? | Phase 10 inline chain verification |
| OQ-B10 | Which x402 target is used for the flagship agent demo? Tab endpoint, a public resource, or a self-hosted demo server? | Phase 6 demo-target wiring |
| OQ-B14 | Buyer money-in (B4-6 Add-funds surface) vs labeled roadmap line? | Phase 4 insufficient-balance branch |
| OQ-SDK | What is the Claude Code `clientInfo.name` string emitted in MCP `initialize`? | Phase 6 telemetry fallback copy |
| OQ-D3 | Is "≤15s first-attempt" webhook latency achievable with the chosen hosting (Vercel inline vs QStash)? | Phase 3 webhook docs copy gate |
| OQ-D5 | Is payer email captured and stored (DID token → Magic Admin verify → `payer_email`)? | Phase 3 PATCH handler, Phase 5 transaction detail |
| OQ-D6 | Go-Live gating: warn-and-allow or hard-block? | Phase 5 Go-Live modal |
| OQ-TIER | Is Magic Express accessible on the free Developer plan? | Phase 0 spike; custody-fallback if not |

---

## Prototype Reintegration Gate

**Gate decision: ALLOWED FOR A SMALLER REAL-INTEGRATION SLICE — named exactly; BLOCKED for the flagship money-movers.**

The 2026-07-06 synthesis (`.thoughts/prototype-reintegration/2026-07-06-tab-v1.md`) accepted by Abu establishes the following non-negotiable rules, which this plan enforces in every phase:

### No-shipping-mock contract (all 8 rules apply to every phase)

1. **No spike-gated code fakes its state.** Every TEE/UA money-mover (rows A-10, E-9, E-10, I-5, I-6, I-7) is BLOCKED with the B-04 clause. UI for those states may exist only behind real execution.
2. **Executable showcase-constants grep gate** must pass before any phase is called done: `grep -rniE "atlas|ATL-|maya\.chen|atlascoffee|searchgrid|arxival|mapgrid|lexiconapi|newswire|datamall|research\.lab|Research Agent v2|0x7F3a|TAB-7B4A2|482913|9wKpQ2|abu@example|0x8f2e6c1a|1783088581|leash provision|@leash/mcp" apps/ packages/` must return 0 hits outside explicitly-labeled demo sample-content files.
3. **Seed-free boot**: no fixture imported by any request path; delete all seed state → golden loops work.
4. **No fake time**: real completion drives every state transition; presentation beats set minimums only.
5. **Test-mode is the only simulation** and the UI says so; any testnet leg gets point-of-display "Test funds — not real money" labels.
6. **Demo honesty**: until A-12 ships, deck + script state the demo buyer was pre-funded.
7. **No unbacked API claims**: every word in the key-permissions radio names an enforced capability; no "≤15s" in merchant-facing copy pending D3.
8. **Any status report on this project leads with the stranger-test result** (gate 15 from canton-lessons).

### Label contract
- **REAL_MVP** — built and real now
- **SIMULATED_DEMO_ONLY** — UI says so; test-mode settlements only
- **BLOCKED** — code must not fake this state; no build work until the named prerequisite clears
- **REAL_LATER** — visible surface, explicitly not claimed
- **CUT** — recorded deviation, not built

---

## Phase 0: External Prerequisites + Funded Live Spike

> **ABU'S ACTIONS ONLY. No code is written in this phase.** This is the single domino that unblocks all money-movers. Everything in Phases 10–11 is BLOCKED until this phase produces a spike report. Non-money work in Phases 1–9 proceeds IN PARALLEL and does not wait.

### Goal

Provision all external credentials, scaffold the monorepo, and run the `createTransferTransaction` → `sendTransaction` funded live spike (Task #2) to confirm the Magic-signed UA-7702 path works for an external receiver on Arbitrum.

### Work (Abu's actions, run as a parallel checklist)

**Credentials (all parallel):**

| # | Action | Output | Gates |
|---|---|---|---|
| B-01 | `dashboard.particle.network` → create project → create web app → copy keys | `PARTICLE_PROJECT_ID`, `PARTICLE_CLIENT_KEY`, `PARTICLE_APP_ID` | UA reads (balance, all UA calls) |
| B-02 | Magic dashboard → create app → copy Publishable + Secret keys → set Device Verification OFF → configure Allowed Origins with Vercel domain | `MAGIC_PUBLISHABLE_KEY`, `MAGIC_SECRET_KEY` | Buyer + merchant auth everywhere |
| B-03 | Deploy a minimal self-hosted OIDC issuer (Next.js API route or Hono server: JWKS endpoint + JWT mint with synthetic `sub` for each agent) → `POST /v1/identity/provider {issuer, audience, jwks_uri}` to register with Magic → provision one Express wallet (`POST /v1/wallet`) → confirm `public_address` returned → confirm whether new OIDC subject → new wallet address or same address (resolves OQ-B03) | `MAGIC_OIDC_ISSUER`, first agent `public_address`, copy-variant pick for L3 Cancel | Express wallet provision, F-9, I-1, H-2 copy |
| B-04 | **Funded live spike (Task #2):** fund fresh UA wallet (~$20 USDC Base). Run the spike script: (a) `createTransferTransaction({ token: {chainId:42161, address:USDC_ARB}, amount, receiver: EXTERNAL_ADDRESS })` → extract `rootHash` + `userOps` → build `authorizations` → `personal_sign(rootHash)` via Magic embedded SDK → `sendTransaction(tx, sig, authorizations)` → confirm on Arbiscan. (b) Determine which Express endpoint reproduces `personal_sign(rootHash)` (try `sign/message`; fall back to `sign/data` over EIP-191 digest). (c) UA self-top-up: `createTransferTransaction(receiver=agentAddress)` → TEE-sign → send. (d) Inspect `TransactionResult` for dest-hash field. (e) Confirm Magic Express free-tier access. Produce a written spike report. | Spike report with: confirmed UA→external Arbiscan tx, confirmed endpoint pick, dest-hash presence, Express tier status | A-10, E-9, I-5, I-6, I-7, F-9 — the entire flagship flagship |
| B-05 | Create Postgres DB (Neon or Supabase) | `DATABASE_URL` | Every ledger row |
| B-06 | Deploy `apps/web` scaffold to Vercel → get HTTPS domain → add to Magic Allowed Origins | `NEXT_PUBLIC_APP_URL` | Stranger test, push, PWA, webhooks |
| B-07 | Decide: provision email provider (Resend or Postmark) and verify sender domain, OR approve copy CUT for A-15 receipt email | Email env vars OR CUT decision recorded in DECISIONS | A-15 |
| B-08 | Reserve npm package names: `@tab/sdk` (or chosen scope), `leash-mcp`, `leash-fetch`. Publish empty 0.0.1 stubs to hold names | Reserved package names | E-2 (quickstart install step), F-1 (MCP snippet) |
| B-09 | Create CDP account → generate CDP API key → note 1,000 free tx/mo limit | `CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY` | B-8 (Tab-as-x402-resource), E-10 (agent mainnet row), Phase 11 |
| B-10 | Within 24h: name ≥1 live public mainnet x402 resource OR confirm Tab's own x402 endpoint as the demo target. If neither, write Sepolia test-funds labels NOW | Named demo target | Phase 6 agent demo-target wiring |
| B-11 | Confirm Polygon leg dropped (already DECIDED 2026-07-06) | DECISIONS row confirmed | I-8 cuts confirmed |
| B-12 | Decide scheduler: Vercel Cron (1/min, inline-first dispatch) vs QStash/worker | `CRON_SECRET` and/or QStash keys | B-3 sweep, B-5 webhook retry |
| B-13 | Confirm: L4 pre-nuclear "Withdraw first" dialog (recommended) + L3 old-address float sweep rule | DECISIONS row | H-2/H-3 copy |
| B-14 | Decide: B4-6 Add-funds surface (recommended) vs labeled roadmap line | DECISIONS row | A-12 |

**Monorepo scaffold (Abu + first agent, parallel with credentials):**

- `pnpm init` + `turbo.json` (build/dev/lint/typecheck/test pipeline per quality profile)
- Workspace layout: `packages/sdk`, `apps/web`, `apps/agent`, `apps/mobile`
- Root `biome.json` (format + lint), `tsconfig.base.json`
- Pinned package versions per Integration Inventory (exact versions from eco re-verification)
- `.env.example` with all env var names (values never committed)
- Re-clone `x402-foundation/x402` to `Reference/x402-foundation/` (replace stale `coinbase/x402` clone)
- Pre-commit hook: `biome check --apply-unsafe <staged files>` + `tsc --noEmit`
- GitHub Actions CI: lint → typecheck → test → build (target < 3 min)

### Real Integration Path

B-04 spike must run against real Particle + Magic keys with real funds. There is no simulated path for this phase. The spike confirms external-receiver settlement before any other money-moving code is written.

### Mock/Simulation Policy

**None.** Phase 0 is all Abu-actions and real external calls. No code is written that could carry a mock.

### Checks

- B-04 spike report exists and confirms: (a) Arbiscan tx with external receiver; (b) Express endpoint pick recorded; (c) Express free-tier status recorded; (d) dest-hash presence recorded.
- All B-0x credentials are in the Vercel environment (not committed to git).
- `grep -rniE "atlas|ATL-|maya" apps/ packages/` returns 0 (empty repo; green by default).
- `turbo run build` succeeds on the empty scaffold.

### Acceptance Criteria Covered

- AC-TAB-5(a)(b)(c) — provable 7702: spike confirms the init shape + 3-arg sendTransaction + Arbiscan visibility.
- AC-TAB-2 — cross-chain settlement: spike is the first real instance.
- AC-LEASH-5 — UA float rebalancing: self-top-up leg of spike is the proof run.

### Stop Condition

Phase 0 is complete when: the spike report exists AND all credentials in Vercel env AND monorepo scaffold builds clean AND npm names reserved. Phase 10 is unlocked. Phases 1–9 proceed without waiting.

---

## Phase 1: Monorepo Foundation + Quality Infrastructure

> **Parallel-buildable — does NOT wait on Phase 0.**

### Goal

Establish the project's permanent scaffold: workspace layout, toolchain, package shells, CI, and `AGENTS.md` that locks critical verified facts so no build agent can contradict them.

### Work

**Files and areas:**

- `pnpm-workspace.yaml`, `turbo.json` (pipeline from quality profile)
- Root `package.json` (scripts: dev/build/lint/typecheck/test/format)
- `biome.json` (format + lint rules; no ESLint)
- `tsconfig.base.json` + per-package `tsconfig.json` extending base
- `packages/sdk/package.json` + `src/index.ts` (empty exports, publishable shape)
- `apps/web/package.json` + Next.js 16.2.6+ scaffold with App Router
- `apps/agent/package.json` + Node entry scaffold
- `apps/mobile/package.json` + PWA scaffold (Next.js route family or Vite)
- `.github/workflows/ci.yml` (lint → typecheck → test → build; Turbo remote cache optional)
- `.husky/pre-commit` (biome staged + tsc --noEmit)
- `AGENTS.md` (mandatory reading for every build agent): 7702 init constraint, x402 float pre-positioning pattern, no session keys on 7702 UA, mobile signs nothing, V2 SDK ground truth = tarball types, Magic Core v1 dead, re-clone x402-foundation/x402, grep gate, no universalGas, no flat ownerAddress)
- `CLAUDE.md` (project-level rules mirroring quality profile)

**Pinned packages to install:**

```
@particle-network/universal-account-sdk@2.0.3
magic-sdk@33.9.0
@magic-sdk/admin (latest Express API)
@x402/core@~2.17.0
@x402/fetch@~2.17.0
@x402/evm@~2.17.0
@x402/mcp@~2.17.0
@x402/next@~2.17.0
@x402/paywall@~2.17.0
@modelcontextprotocol/sdk@^1.29.0
viem@^2.48
jose
web-push
drizzle-orm + drizzle-kit
postgres (or @vercel/postgres)
```

### Real Integration Path

No SDK calls yet. This phase installs and type-checks only. The goal is a green `turbo run build` + `turbo run typecheck` with all packages installed.

### Mock/Simulation Policy

No runtime code yet. No mocks possible.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors (empty exports pass trivially)
- `turbo run build` — all packages build
- `turbo run test` — vitest runs with 0 tests, exits green
- `grep -rniE "atlas|ATL-|maya\.chen|atlascoffee|searchgrid|arxival|mapgrid|lexiconapi|newswire|datamall|research\.lab|Research Agent v2|0x7F3a|TAB-7B4A2|482913|9wKpQ2|abu@example|0x8f2e6c1a|leash provision" apps/ packages/` = 0 hits

### Acceptance Criteria Covered

None (infrastructure only).

### Stop Condition

All four quality checks pass. CI workflow passes on push to main. `AGENTS.md` exists and covers all 8 critical facts from the quality profile.

---

## Phase 2: apps/web — Merchant Auth + Settings + Shell

> **Parallel-buildable — does NOT wait on Phase 0.** Magic keys (B-02) are needed for live auth; without them the auth flow renders to a "keys not configured" dev banner and the shell still builds.

### Goal

Working multi-tenant merchant authentication (Magic headless email-OTP), tenant provisioning, settings surface, and the application shell. Merchants can sign up, log in, and configure their account. The shell's TEST/LIVE toggle and environment scoping are real.

### Work

**Files and areas:**

- `apps/web/app/(auth)/signup/page.tsx` + `apps/web/app/(auth)/login/page.tsx` — Magic headless `loginWithEmailOTP({ showUI: false, deviceCheckUI: false })`; OTP 6-box screen; all states (MA-1..MA-6, MA-9): idle / sending / awaiting-code / auto-submit / wrong / expired / rate-limited / login-unknown-email
- `apps/web/lib/auth/magic-client.ts` — Magic client instance; persisted-session restore through `isLoggedIn()` → `getIdToken()` + `getInfo()`; address comes from `getInfo().wallets.ethereum?.publicAddress`
- `apps/web/lib/auth/session.ts` — DID token validation via `@magic-sdk/admin`; session cookie
- `apps/web/app/api/auth/[...route]/route.ts` — session routes (create/destroy)
- `apps/web/app/(dashboard)/settings/page.tsx` — business name + save lifecycle + skeletons; logo upload (Vercel Blob + progress); receiving address (origin + editable + confirm); settlement token locked field labeled "Fixed by Tab"
- `apps/web/app/(dashboard)/layout.tsx` — shell: nav, account block, TEST/LIVE env control, test banner, sign-out
- **DB schema** (Drizzle migrations):
  - `users` table (single principal — DQ-6, PROPOSED)
  - `merchants` table (email UNIQUE, business_name, logo_url, receiving_address, mode, live_activated_at)
  - `api_keys` table (hashed_key SHA-256, prefix, last4, permissions, last_used_at, created_at)
  - `quickstart_progress` table
- `apps/web/lib/db/schema.ts` — full schema per Integration Inventory
- `apps/web/app/api/merchant/route.ts` — `PATCH /api/merchant` for settings save
- Tenant provisioning at SUCCESS: DID → create merchants row + auto-provision pk pair + default receiving address (merchant's Magic EOA at signup, D1 PROPOSED) → session → route

### Real Integration Path

- Magic headless fallback: when no persisted Magic session exists, `loginWithEmailOTP({showUI:false, deviceCheckUI:false})` → `getIdToken()` + `getInfo().wallets.ethereum?.publicAddress`. A valid session skips OTP and is still DID/email-bound by the server. Capability verified against the pinned SDK and real Phase 3 session flow.
- DID validation server-side: `@magic-sdk/admin` `validate(didToken)` → `getMetadata()` → `email`.
- Honest fallback for expired/rate-limit event mapping (exact Magic error codes unverified until B-02 + spike) — generic copy until verified.
- Logo: Vercel Blob `put()` — real upload; if Abu downgrades (D4), button is hidden entirely (no fake progress bar).

### Mock/Simulation Policy

- If Magic keys (B-02) are not yet in env: the auth form renders a dev-only `[Keys not configured — set MAGIC_PUBLISHABLE_KEY]` banner and is non-interactive. The shell scaffold + settings form build and render without keys.
- No fake merchant rows. No seeded tenants. Atlas = real tenant via real signup code (C-2).

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 type errors (Magic + admin SDK types resolve)
- `turbo run test` — merchant provisioning unit tests: email-UNIQUE precheck, pk-pair auto-provision, DID validation path
- `turbo run build` — Next.js builds
- Drizzle `db:migrate` runs against a local Postgres; schema matches Integration Inventory

### Acceptance Criteria Covered

- AC-TAB-6 (merchant side): Magic email-OTP auth works — new merchant completes signup without MetaMask, seed phrase, or external navigation.
- D-3 (auth card all states), D-4 (tenant provisioning), D-5 (settings: name/logo/address), D-1 (shell), D-2 (sign-out).

### Stop Condition

A new merchant can sign up, see the dashboard shell, configure settings, and sign out. Sign-out expires only `tab_session`, never the Magic embedded-wallet session; a same-email return login reuses that valid Magic session and skips OTP. Atlas tenant is provisioned via the real signup code (not a seed). Auth tests pass.

---

## Phase 3: apps/web — Tab Backend + Canonical Lifecycle + Webhooks

> **Parallel-buildable — does NOT wait on Phase 0.** The lifecycle scaffolding (routes, tables, ref_code mint) is plannable now. Inline chain verification is scaffolded but BLOCKED on the spike result for real settlement transitions.

### Goal

The full Tab backend contract per Integration Inventory: create-at-open lifecycle, inline verification scaffold, cron backstop, webhook delivery with HMAC signing, retry scheduler, and the secret-key API plane. Test-mode is the only simulated surface.

### Work

**Files and areas:**

- `apps/web/app/api/v1/payment-intents/route.ts` — sk-auth `POST /api/v1/payment-intents`; accepts exact `{amount,intentUrl}`, derives merchant/environment/current receiving address/fixed asset, and returns `{intent,intentToken}` with a five-minute signed JWS
- `apps/web/app/api/v1/payments/route.ts` — pk-auth `POST /api/v1/payments`; accepts exact `{intentToken}` only, verifies signature, merchant, environment, replay ID, expiry, and the current receiving address; mints `ref_code`; creates the canonical pending row
- `apps/web/app/api/v1/payments/[id]/route.ts` — pk-auth `PATCH /api/v1/payments/:id`; accepts `{transactionId, tokenChanges, buyerDidToken}`. Magic Admin validates the DID and derives `payer_address`; Phase 3 intentionally leaves `payer_email` NULL and omits it from API/dashboard responses while D5 remains open. Inline chain verification remains BLOCKED on B-04 for live confirmation; sk-auth `GET /api/v1/payments/:id` and `GET /api/v1/payments` implement R-TAB-13.
- `apps/web/app/api/internal/settle-sweep/route.ts` — cron endpoint (~1/min); re-verifies `pending` rows beyond threshold; cadence decided per B-12
- `apps/web/lib/payments/verify.ts` — chain verification logic: Particle tx lookup + dest-hash disambiguation by known UA sender address; **never amount + time-window alone**
- `apps/web/lib/payments/lifecycle.ts` — ref_code minting; status transitions; payment settled → fire webhook
- `apps/web/lib/webhooks/deliver.ts` — `X-Tab-Signature: t=<unix_ts>,v1=HMAC-SHA256(whsec, "<t>.<rawBody>")` signing; 10s timeout per attempt
- `apps/web/lib/webhooks/retry.ts` — exactly 3 total attempts: attempt 1 inline, retry after 1m, retry after 4m; 10s response timeout each; immediate terminal `gave_up` after attempt 3; `webhook_deliveries` = single source of truth for M4 badges AND M6 log
- `apps/web/lib/auth/sk-middleware.ts` — sk-auth middleware: validates `sk_*` key, enforces permissions (Full access / Read-only), stamps `last_used_at`
- **DB schema additions:**
  - `payments` table (`ref_code`, `status: pending|settled|failed`, `payer_address`, `payer_email?`, `intent_url`, `env`, `livemode`)
  - `settlements` table (`transaction_id`, `token_changes`, `verification_method: inline|cron_sweep|simulated_test`, `settled_at`)
  - `webhook_endpoints` table (`url`, recoverable AES-256-GCM `ciphertext`/`nonce`/`auth_tag`/`key_version`, `last4`, `verified_at`, `created_at`), AAD-bound to endpoint/merchant/environment
  - `webhook_deliveries` table (`attempt`, `status: delivered|failed|gave_up`, `response_time_ms`, `next_retry_at`, `trigger`)
  - `orders` table (ref_code correlation, per-merchant prefix derived at runtime — never compile-time `ATL-`)
- Test-mode: full real code path; settlement transitions to `settled` via `simulated_test` verification; `env='test'`, `livemode:false`, TEST badges, decided banner copy

### Real Integration Path

- pk-auth middleware validates against `api_keys.hashed_key` (SHA-256). No bearer-token theatre.
- sk-auth stamps `last_used_at` on every call — this is what makes the M3 "LAST USED" column real.
- Webhook HMAC signing is real crypto (`crypto.createHmac('sha256', whsec).update(payload).digest('hex')`).
- Inline chain verification: the BLOCKED note means: when `mode=live` and `transactionId` is present, the code calls Particle tx lookup; if the spike report shows dest-hash is present, that path is wired; the real transition to `settled` happens only on a real on-chain confirmation. **No code path may mark a live payment `settled` without a real confirmation.**
- Test-mode settlement is the ONLY simulation — it is labeled in the UI with decided banner copy.
- "≤15s first-attempt" latency target: **never written into merchant-facing docs** pending D3 resolution.

### Mock/Simulation Policy

- Test-mode settlements: **SIMULATED_DEMO_ONLY** — the UI says so with the decided banner copy. This is the one legitimately simulated surface.
- Live settle on PATCH: **BLOCKED (B-04)** — the inline verification stub accepts the PATCH, logs the transactionId, but does NOT transition to `settled` in live mode until the spike report confirms the verification path. The row stays `pending` (honest state). The cron sweep will also stay pending until verification is real.
- No fake webhook deliveries. No seeded delivery rows.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test` — unit tests covering: HMAC-SHA256 signature vector (known plaintext), ref_code minting (prefix derived at runtime, not compile-time constant), sk-auth `last_used_at` stamp, amount-pinning (receiver validated against tenant row), test-mode `simulated_test` path (labeled), retry backoff timing math
- `turbo run build` — builds clean
- Grep gate: 0 hits on the banned constant set

### Acceptance Criteria Covered

- R-TAB-11 canonical lifecycle (create-at-open + report + inline verify scaffold + cron backstop)
- R-TAB-13 secret-key API plane (GET /api/v1/payments + /:id, permissions, last_used_at)
- R-TAB-3 webhook delivery (HMAC, retry policy, webhook_deliveries as single source)
- B-7 test-mode (SIMULATED_DEMO_ONLY, labeled in UI)
- B-6 sk plane (permissions enforced, last_used_at real)

### Stop Condition

A test-mode payment can be created, reported, verified via `simulated_test`, and a webhook delivery row created and signed. The M4 transactions list shows real rows (empty on day-0). The sk-auth `GET /api/v1/payments` returns the merchant's test rows and stamps `last_used_at`. No live payment can be marked settled (honest pending state).

---

## Phase 4: packages/sdk — PayButton Full State Machine

> **Parallel-buildable — does NOT wait on Phase 0.** The CONFIRMING → execute path and optimistic success are BLOCKED; all other states are buildable now.

### Goal

The complete `<PayButton>` component with all buyer-facing states, Magic headless email-OTP auth, UA balance read, Add-funds surface, and the full state machine — with the live-execute path BLOCKED behind a runtime guard that cannot be faked.

### Work

**Files and areas:**

- `packages/sdk/src/PayButton.tsx` — the root component; requires `apiBaseUrl`, Tab `publishableKey`, `intentUrl`, and `onSuccess(transactionId, tokenChanges)`; owns the state machine
- `packages/sdk/src/states/` — one file per major state (200-line policy):
  - `IdleState.tsx` — "Pay $X.XX" + lock icon; amount from real intent fetch at mount
  - `LoadingState.tsx` — disabled + spinner
  - `AuthState.tsx` — Magic OTP modal (B2 email entry + B3 OTP box)
  - `BalanceState.tsx` — UA balance display: `getPrimaryAssets().totalAmountInUSD`; single USD figure; BALANCE_LOADING → READY → CONFIRMING
  - `InsufficientState.tsx` — real `totalAmountInUSD < amount`; displays real UA deposit address (live read post-auth); copy-to-clipboard; "Send USDC on a supported network to this address" copy; optional universalx.app link (A-12; R-TAB-12)
  - `SuccessState.tsx` — BLOCKED (rendered only when `sendTransaction` returns a real transactionId)
  - `ErrorState.tsx` — real rejection copy map from `UniversalError.code/data`; retry in place; network-kill lands here
- `packages/sdk/src/magic.ts` — persisted Magic restore via `isLoggedIn()` → `getIdToken()` + `getInfo().wallets.ethereum?.publicAddress`; headless `loginWithEmailOTP({showUI:false, deviceCheckUI:false})` + `verifyEmailOTP` only when no session exists; checkout never calls Magic logout
- `packages/sdk/src/ua.ts` — UA init: nested `smartAccountOptions.useEIP7702:true, name:"UNIVERSAL", version:UNIVERSAL_ACCOUNT_VERSION, ownerAddress`; NO `universalGas`; NO top-level `ownerAddress`; `getPrimaryAssets()`; `createTransferTransaction`; `sendTransaction` (3-arg form)
- `packages/sdk/src/execute.ts` — the BLOCKED path: `createTransferTransaction` → extract `userOps` → build `authorizations` array → `personal_sign(rootHash)` → `sendTransaction(tx, sig, authorizations)`. This file exists but is gated: it throws `PAYMENT_EXECUTION_BLOCKED` at runtime unless `process.env.NEXT_PUBLIC_SPIKE_COMPLETE === 'true'` (a named env flag, not a silent feature flag). **No code path may call `sendTransaction` and return a fake `transactionId`.**
- `packages/sdk/src/checkout-api.ts` — pk-auth `GET /api/v1/checkout-context`, signed `{intent,intentToken}` fetch, token-only `POST /api/v1/payments`, and `PATCH /api/v1/payments/:id` report
- `packages/sdk/src/copy.ts` — zero crypto vocabulary enforcer: all buyer-facing strings go through this file; no "chain", "gas", "bridge", "Arbitrum", "EOA", "wallet address", "sign", "EIP" allowed in exported strings
- `packages/sdk/src/index.ts` — named exports; tree-shakeable

**Test-mode label**: mode comes from the pk-auth checkout context. The signed intent and opened payment must agree with it; the SDK surfaces the real context mode on the sheet chrome (A-4).

### Real Integration Path

- Intent fetch: `GET {intentUrl}` → `{intent,intentToken}` and refetch on click. The browser opens with only the newest signed token; amount, receiver, asset, merchant, and environment are never browser authority.
- Magic auth: restore the persisted session first; headless OTP is the fallback. Both paths return a DID token and nested Ethereum address metadata.
- UA init: against `@particle-network/universal-account-sdk@2.0.3` types only.
- Balance: `getPrimaryAssets()` — real network call (keys-gated on B-01/B-02; renders loading skeleton without keys).
- Add-funds address: real UA deposit address read post-auth — never a constant.
- CONFIRMING → execute: **BLOCKED (B-04)** — the official client requires both `checkout-context.capabilities.livePaymentExecution === true` and the named spike build flag before execution. These client gates are reachability controls, not settlement authority; backend live-chain verification remains authoritative and cannot mark live settlement while B-04 is blocked. No fake success state ships.

### Mock/Simulation Policy

- All states through BALANCE_READY: **REAL_MVP** — build and ship now.
- Add-funds (A-12): **REAL_MVP** (per B-14 decision; if Abu downgrades, the surface becomes a labeled roadmap line with no dead-end).
- CONFIRMING / SUCCESS / receipt: **BLOCKED** — the runtime guard exists; UI shell for these states may be written but must throw before returning a fake transactionId. Demo buyer is pre-funded; deck states this.
- Test-mode label (A-4): **REAL_MVP** — merchant mode from real checkout-context.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors; UA + Magic types resolve correctly
- `turbo run test`:
  - Amount-from-intent test: mock intent URL → verify component reads amount from fetch, never from prop
  - Zero-crypto-vocabulary test: scan all exported copy strings for banned words
  - State-machine transition test: idle → loading → auth → balance → insufficient → add-funds → back to idle
  - BLOCKED guard test: calling execute.ts without `SPIKE_COMPLETE=true` throws `PAYMENT_EXECUTION_BLOCKED`
  - Add-funds address test: address is read from UA, never hardcoded
- `turbo run build` — SDK bundles (ESM + CJS)
- Grep gate: 0 hits on banned constants

### Acceptance Criteria Covered

- AC-TAB-1 (invisible-crypto): zero-vocabulary check passes in tests
- AC-TAB-6 (Magic email-OTP): headless auth renders + completes (keys-gated)
- R-TAB-4 (headless Magic), R-TAB-5 (UA-7702 init shape), R-TAB-6 (unified balance), R-TAB-10 (button state machine), R-TAB-12 (Add-funds surface), R-TAB-9 (zero crypto vocabulary)
- AC-TAB-2, AC-TAB-3, AC-TAB-5 — **BLOCKED** (require spike)

### Stop Condition

All states through BALANCE_READY build and type-check. The BLOCKED guard is in place. SDK publishes (dry-run) without errors. Tests pass. Zero-vocabulary check green.

---

## Phase 5: apps/web — Merchant Dashboard

> **Parallel-buildable — does NOT wait on Phase 0.** E-9 (first live settled row) is BLOCKED; all other dashboard surfaces are buildable now.

### Goal

Complete merchant dashboard: Quickstart progress, API keys lifecycle, Transactions list + detail, Webhooks config + delivery log, per-merchant demo page (the real integration-test page), and Go-Live checklist.

### Work

**Files and areas:**

- `apps/web/app/(dashboard)/quickstart/page.tsx` — progress card (E-1): 8 steps; step 1 (`npm install @tab/sdk`) does NOT auto-complete; Mark-done manual path; auto-derivations (key exists / webhook exists / first test settlement); `quickstart_progress` table
- `apps/web/app/(dashboard)/keys/page.tsx` — API keys table (E-6): create / show-once reveal / rotate (confirm + one-time reveal) / delete / LAST USED (real `last_used_at`); permissions radio (`Full access` / `Read-only — list and read payments`); no pre-existing live sk rows (CUT, row E-7)
- `apps/web/app/(dashboard)/transactions/page.tsx` — payments + settlements joined (E-8): scoped by merchant + env; webhook badges from `webhook_deliveries` (single source); pagination + filter popover; detail panel: full hash, Arbiscan link, tokenChanges + raw JSON, intent_url audit, payer email (D5-gated); EMPTY state for day-0
- `apps/web/app/(dashboard)/webhooks/page.tsx` — `webhook_endpoints` (E-12): whsec shown once (AES-GCM-encrypted at rest, recoverable for signing); test webhook (labeled `type:"test"` payload; 2xx → sets `verified_at`); "Listening" = derivation from delivery records; regenerate flow
- `apps/web/app/(dashboard)/webhooks/deliveries/page.tsx` — delivery log (E-13): per-attempt request/signature/response/timing; resend = new row (`parent_delivery_id`, trigger='manual')
- `apps/web/app/(dashboard)/go-live/page.tsx` — Go-Live checklist (E-14): real boolean derivations; warn-and-allow (D6); `live_activated_at`; mode flip re-renders shell
- `apps/web/app/demo/page.tsx` — per-merchant demo page (C-1): rendered from the signed-in merchant's own row + `pk_test`; `GET /api/demo/intent`; Atlas = labeled platform tenant via real signup code (C-2); order prefix derived at runtime from tenant name (C-3 — no compile-time `ATL-`); `wired via onSuccess(…)` dev caption (C-4)
- `apps/web/app/api/demo/intent/route.ts` — per-merchant intent: `GET /api/demo/intent` (pk-auth); returns `{amount, receiver, token:{chainId:42161, address:USDC_ARB}, mode}`
- **DB schema additions:**
  - `quickstart_progress` columns finalized
  - `webhook_endpoints.verified_at` column
- Quickstart step 1 copy: shows the real `npm install @tab/sdk` command; until B-08 npm publish, an honest note "package not yet published — use local path" (never faked as installable)

### Real Integration Path

- LAST USED column: wired directly to `api_keys.last_used_at` stamped by sk-auth middleware (Phase 3). Real — not "Never" forever.
- Webhook badge on M4: wired to `webhook_deliveries` table (Phase 3 single source). Impossible to have an orphan 0x hash.
- Arbiscan link: `https://arbiscan.io/tx/${transactionId}` — real link when live tx exists.
- Test webhook: a real signed delivery to the merchant's own endpoint, labeled `type:"test"`.
- FIRST_TEST_PAYMENT banner (E-5): real join: first test `settlements` row + `webhook_deliveries.response_time_ms`; email only if D5 confirmed, else honest fallback.

### Mock/Simulation Policy

- **E-9 (first live settled row):** **BLOCKED (B-01/B-02/B-04)**. The transactions list renders EMPTY state on day-0. No seeded or fake rows.
- **E-2 (quickstart npm install):** the install command is shown; the package is **BLOCKED (B-08)** until published. Honest note added until publish.
- All other dashboard surfaces: **REAL_MVP**.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - order prefix: test that `ATL-` is never a compile-time constant; prefix derived from `merchant.business_name` at render
  - webhook LAST USED: mock sk call → `last_used_at` updates
  - delivery badge source: verify M4 transaction badge pulls from `webhook_deliveries`, not a mock
  - test-webhook payload: `type: "test"`, labeled, `verified_at` set on 2xx
- `turbo run build` — builds
- Grep gate: 0 hits (no `ATL-` compile-time constant)

### Acceptance Criteria Covered

- Story 1 (merchant integrates Tab): Quickstart walks through all steps; demo page is the integration test.
- E-1..E-8, E-11..E-14 (full dashboard minus BLOCKED live rows)
- C-1..C-4 (per-merchant demo page)
- D-3..D-8 (auth + settings)

### Stop Condition

A freshly signed-up merchant can complete the full Quickstart flow in test-mode (all steps except npm install, which shows an honest pending note), see test transactions, configure and test a webhook, rotate keys, and activate Go-Live. Per-merchant demo page renders with no hardcoded tenant constants.

---

## Phase 6: apps/agent — MCP Proxy + Detection + Remote-Signer Wire

> **Parallel-buildable — does NOT wait on Phase 0.** The EIP-3009 signing path (F-9) and mainnet agent payment (E-10) are BLOCKED. Everything else — proxy, detection, remote-signer wire contract, cap gate, receipt ledger — is buildable now.

### Goal

The Leash agent package: MCP stdio proxy with dual-surface 402 detection, `@x402/fetch` wrapper, `POST /api/agent/sign` remote-signer wire, cap engine, status gate, CAIP-2 float routing, and receipt ledger. The signing call is wired but BLOCKED until B-03 (OIDC issuer) clears.

### Work

**Files and areas:**

- `apps/agent/src/proxy.ts` — MCP stdio proxy: low-level `Server` + `setRequestHandler(ListToolsRequestSchema)` / `setRequestHandler(CallToolRequestSchema)` forwarding to upstream `Client`; sends `{clientName, toolName, transport}` with each pay request (F-12 ORIGIN field)
- `apps/agent/src/detect.ts` — dual-surface 402 detection (F-4):
  - MCP surface: tool-result `isError` + `structuredContent` (tool-result path); AND JSON-RPC `-32042` `JSONRPC_PAYMENT_REQUIRED_CODE` (SEP-1036 path, C4 from eco doc). Uses `isPaymentRequiredError`, `extractPaymentRequiredFromError` from `@x402/mcp`.
  - HTTP surface: v2 `PAYMENT-REQUIRED` response header; v1 HTTP 402 + body
- `apps/agent/src/fetch-wrapper.ts` — `wrapFetchWithPayment(fetch, client)` where `client = new x402Client().register('eip155:8453', new ExactEvmScheme(remoteSigner)).register('eip155:42161', new ExactEvmScheme(remoteSigner))` — registers Base + Arbitrum only (Polygon dropped)
- `apps/agent/src/remote-signer.ts` — `ExactEvmScheme`-compatible signer: `POST /api/agent/sign` → receives `{network, amount, payTo, signerRequest}`; the signer wire is implemented; the Magic Express TEE call inside `POST /api/agent/sign` is **BLOCKED (B-03)** (throws `OIDC_ISSUER_NOT_CONFIGURED` until `MAGIC_OIDC_PROVIDER_ID` env var is set)
- `apps/web/app/api/agent/sign/route.ts` — remote signer endpoint:
  1. Status gate: `agentStatus` in (`paused`|`frozen`|`cancelled`|`nuked`) → 423 `AGENT_PAUSED|FROZEN|CANCELLED` (F-7)
  2. Cap gate: `SUM(settled+pending)` from `receipts` + `amount > cap` → 403 `LEASH_CAP_EXCEEDED`; writes `blocked` receipt (F-6)
  3. Float sufficiency: `balanceOf(agentAddress, network)` via viem → 402-level `FLOAT_EMPTY` if dry; writes `failed` receipt (F-8)
  4. Write `pending` receipt (canonical: `pending|settled|failed|blocked`)
  5. **BLOCKED (B-03):** call Magic Express TEE `POST /v1/wallet/sign/data` (or `/sign/message` per spike result) → returns signature. Until B-03 clears, returns `SIGNER_NOT_CONFIGURED` and writes `failed` receipt.
  6. Return signature
- `apps/web/app/api/agent/pay/result/route.ts` — `POST /api/agent/pay/result`: receives v2 `PAYMENT-RESPONSE` / v1 `X-PAYMENT-RESPONSE` → finalize receipt `pending→settled` (on real response) or `pending→failed` (on error). Network-kill leaves honest `pending` row. (F-10)
- `apps/web/app/api/agent/connect/route.ts` — `POST /api/agent/connect`: MCP `initialize` clientInfo; writes first-seen, per-cycle count, last-seen. Renders `"Unknown client"` if clientInfo is absent (OQ-SDK). (F-13)
- **DB schema additions:**
  - `agents` table (`status: provisioned|paused|frozen|cancelled|nuked`, `signer_subject`, `name`, `owner_id`)
  - `leash_keys` table (`hashed_key`, `prefix`, `last4`, `revoked_at`)
  - `receipts` table (`status: pending|settled|failed|blocked`, `amount_atomic`, `amount_usd`, `asset`, `network`, `pay_to`, `tx_hash`, `origin: {client,tool,transport}`, `intended_network?`, `parent_id?`)
  - `floats` table (`network`, `balance_atomic`, `balance_usd`, `updated_at`)
  - `agent_events` table (audit: connect / sign / block / revoke)
- **CAIP-2 float routing (F-8):** parse `accepts[]`; prefer Base → Arbitrum (no Polygon); `FLOAT_EMPTY` if no matching float
- Leash key lifecycle (F-14): generate / reveal (show-once) / rotate (revokes old)
- `leash-mcp` package entry: stdio binary entrypoint; reads `LEASH_API_KEY` from env; gains optional `--upstream <url>` arg (F-1 snippet requirement)
- `leash-fetch` package entry: re-exports `wrapFetchWithPayment` configured for Leash remote signer (F-3)

### Real Integration Path

- `x402Client` + `ExactEvmScheme` wiring: per `@x402/fetch@2.17.0` d.ts confirmed (`2026-07-06-eco-x402-mcp.md §2`).
- Dual-surface detection: `isPaymentRequiredError` + `-32042` path confirmed in `@x402/mcp@2.17.0` published dist (`2026-07-06-eco-x402-mcp.md C4`).
- Cap gate: `SUM(settled+pending)` — pending receipts count toward gate to prevent race-condition overspend. The 403 threshold matches the displayed number on the spend bar (K-2).
- `balanceOf` calls: via viem; USDC addresses hardcoded from eco doc triple-confirmation (not from docs clone).
- Magic Express signing: **BLOCKED (B-03)**. The route exists, the gate logic runs, the blocking behavior is honest. No fake signature is returned.

### Mock/Simulation Policy

- MCP proxy, dual detection, fetch wrapper, cap gate, status gate, CAIP-2 routing, receipt ledger: **REAL_MVP**.
- TEE signing (F-9) and mainnet agent payment: **BLOCKED (B-03/B-04)**. The sign route throws `SIGNER_NOT_CONFIGURED`; receipt status is `failed` with that reason. No fake `txHash` is written.
- Demo x402 target: BLOCKED on B-10 decision. The proxy code is written against the wire contract; the target URL comes from env (`LEASH_DEMO_TARGET_URL`), never hardcoded.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - Dual-surface detection: mock tool-result 402 (isError path) AND mock -32042 JSON-RPC error — both detected
  - Cap gate unit test: SUM(settled+pending) >= cap → 403; SUM < cap → proceeds; pending counts in gate
  - Status gate: paused → 423; frozen → 423; nuked → 423
  - CAIP-2 routing: `eip155:8453` → Base float; `eip155:42161` → Arbitrum float; unknown → FLOAT_EMPTY
  - Blocked receipt: cap-exceeded attempt writes `blocked` row with `intended_network`, not `failed`
  - BLOCKED guard: sign route with `MAGIC_OIDC_PROVIDER_ID` unset → `SIGNER_NOT_CONFIGURED` + `failed` receipt; no fake sig
- `turbo run build` — agent binary builds
- Grep gate: 0 hits (no hardcoded domain constants, no fake resource domains)

### Acceptance Criteria Covered

- AC-LEASH-1 (interception, dual detection, CAIP-2 routing): wired; **mainnet execution BLOCKED**
- AC-LEASH-2 (cap is hard block at hosted signer): cap gate + status gate proven in tests
- R-LEASH-2 (MCP proxy + fetch wrapper), R-LEASH-3 (cap, server-side), R-LEASH-4 (receipt logging), R-LEASH-5 (CAIP-2 routing)
- Story 3 (agent pays x402): proxy + detection + receipt logging real; payment execution BLOCKED

### Stop Condition

MCP proxy starts and passes tool calls through. Dual-surface detection tests pass. Cap gate and status gate unit tests pass. Remote-signer wire exists but returns `SIGNER_NOT_CONFIGURED` honestly. Receipt ledger writes blocked/failed receipts with correct status. No fake transactions in the DB.

---

## Phase 7: apps/web — Leash Control Plane (Owner Auth + Cap Engine + Cycles + Notifications)

> **Parallel-buildable — does NOT wait on Phase 0.** Float/balance reads are keys-gated but non-blocking.

### Goal

Owner authentication, cap configuration with 4 frequencies, cycle boundaries + countdown + auto-resume, three-tier notification store, and Leash key lifecycle. The spend bar's settled + pending segment model is real.

### Work

**Files and areas:**

- `apps/web/app/(leash)/auth/` — owner Magic headless auth (same SDK as merchant; different tenant namespace); `magic.user.isLoggedIn()` check for returning-user skip
- `apps/web/app/(leash)/dashboard/` — root layout with the W1 overview card
- `apps/web/app/api/leash/caps/route.ts` — `POST|PATCH /api/leash/caps`: cap amount + frequency (daily/weekly/monthly/custom); no restart required; live gate reads updated immediately
- `apps/web/lib/leash/cycles.ts` — cycle boundary derivation: anchor from `cap_cycles.anchor` + frequency (UTC); rollover auto-resumes (no timer theatre); manual reset endpoint `POST /api/leash/cycles/reset`
- `apps/web/lib/leash/cap-display.ts` — **canonical spend bar rule (K-2)**: settled segment (solid, `SUM(settled)`) + pending segment ("incl. $X pending" subline, `SUM(pending)`); cap gate checks `SUM(settled+pending)`; no-cap-set → signer refuses (G-4 behavior; banner "Set a cap to enable payments")
- `apps/web/app/(leash)/notifications/page.tsx` — notification store (W5): list / filters / unread / read-all / sticky / resolved; T3 resolves on remedial event (not a timer); badge = unread T2+T3; merged type enum incl. `float_low|float_empty`
- `apps/web/lib/leash/notifier.ts` — three-tier emission: T1 = log only; T2 (75% cap, first-seen-domain); T3 (cap exceeded, agent halted); anti-cry-wolf: T3 never for routine events
- `apps/web/lib/leash/first-seen.ts` — first-seen-domain T2: `NOT EXISTS` prior receipt same host (J-2)
- **DB schema additions:**
  - `caps` table (`amount`, `frequency: daily|weekly|monthly|custom`, `agent_id`)
  - `cap_cycles` table (`anchor`, `frequency`, `reset_at`, `manual_reset_count`)
  - `notifications` table (`type: settled|float_low|float_empty|cap_approaching|cap_exceeded|first_seen_domain`, `read_at`, `resolved_at`, `sticky`)
  - `push_subscriptions` table (VAPID Web Push endpoint + keys)
- Leash key lifecycle: generate / reveal (show-once) / rotate (revokes old) — `leash_sk_` prefix; hash-at-rest (F-14)

### Real Integration Path

- Cap gate in `POST /api/agent/sign` (Phase 6) reads `caps` + `receipts` directly — Phase 7 only adds the dashboard UI on top of the already-real gate.
- Cycle boundaries: derived math from `cap_cycles.anchor` + frequency. Rollover = the anchor advances; no setTimeout theatre.
- No-cap-set default: the signer refuses all signing requests (G-4). Banner is the only live surface until a cap is set.
- Overage (140%, hatched bar): pure ledger math, rendered in the spend bar (G-3).
- T2/T3 emission: fires from real events in the receipt and cap pipeline (Phase 3/6 events trigger notifier).

### Mock/Simulation Policy

- Cap engine, cycle boundaries, notification store: **REAL_MVP**.
- Float balance reads (`I-3`): `balanceOf` via viem (keys-gated; shows $0.00 if keys absent — designed EMPTY state). REAL_MVP.
- Owner UA unified balance beside top-up (`I-4`): `getPrimaryAssets().totalAmountInUSD` labeled "includes floats" — read-only; keys-gated. REAL_MVP.
- Top-up (I-5), auto-rebalance (I-6), withdraw (I-7): **BLOCKED (B-04)** — their UI shells may exist but the action buttons are disabled with honest "Requires spike completion" state; no fake balance changes.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - Cycle boundary math: daily cycle anchored at UTC midnight rolls over correctly
  - Spend bar: `SUM(settled+pending) = cap` → bar full + "incl. $X pending" subline shown
  - No-cap-set: `cap IS NULL` → cap gate returns 403 immediately
  - T2 notification: cumulative spend crosses 75% → T2 emitted exactly once
  - T3 notification: cap-exceeded → T3 emitted; subsequent payment → T3 not re-emitted (anti-cry-wolf)
  - First-seen-domain: novel host → T2; same host again → no T2
- `turbo run build` — builds
- Grep gate: 0 hits

### Acceptance Criteria Covered

- R-DASH-2 (spend bar + cap config)
- R-DASH-3 (three-tier notifications at correct thresholds)
- R-DASH-5 (autonomy / cap adjustment mid-cycle)
- AC-DASH-2 (spend bar settled + pending segments)
- AC-DASH-3 (notification tiers)
- Story 4 (owner sets and adjusts cap), Story 5 (owner watches spend and is notified)

### Stop Condition

Owner can set a cap and frequency. Spend bar shows correct segments. Cycle countdown is derived from real anchor math. T2 fires at 75%, T3 at 100%, no duplicate interrupts. No-cap-set banner renders. Float balances read live (keys-gated; $0.00 on empty state).

---

## Phase 8: apps/web — Leash Dashboard Render + Revocation Spectrum

> **Parallel-buildable — does NOT wait on Phase 0.** Money-moving revocation actions (top-up before nuclear) are BLOCKED on B-04.

### Goal

Full Leash dashboard render (W1 overview, W2 feed, W3 receipt detail) and the complete four-level revocation spectrum with the OIDC credential lifecycle. Post-nuclear honesty: floats are not withdrawable after nuclear.

### Work

**Files and areas:**

- `apps/web/app/(leash)/dashboard/overview/` — W1 overview (K-1): spend card, reset line, balance card (float total — NOT the UA treasury), connected card, server-key card ("Held in a secure enclave (TEE)"), preview panel, chip strings canonicalized; quick actions
- `apps/web/app/(leash)/dashboard/feed/` — W2 feed (K-3): receipts polled ~3s; "Live" chip tied to poll health; cap-reset banner; blocked "(target)" network chip; **no seeded rows — stranger sees EMPTY on day-0**
- `apps/web/app/(leash)/dashboard/receipts/[id]/` — W3 receipt detail (K-4): per-receipt fields; ORIGIN field (`{clientName, toolName, transport}` from proxy Phase 6); copy affordances; explorer link (Arbiscan for Arbitrum, Basescan for Base); pending detail (ADDED)
- `apps/web/app/api/leash/revoke/route.ts` — `POST /api/leash/revoke`: four levels:
  - L1 Pause: `status → paused`; signer pre-parse halts; payment-stop copy (not "stop the agent's process")
  - L2 Freeze: `status → frozen`; signer gate blocks all signing; credential untouched
  - L3 Cancel: revoke `signer_subject` at OIDC credential layer + invalidate all leash keys; re-provisioning mints NEW OIDC subject; copy variant from OQ-B03 spike result (pre-authored both sets: "rotates your server key" vs "resets the credential chain")
  - L4 Nuclear: pre-destruction dialog shows LIVE float balance + "Withdraw first" offer (B-13, I-7 BLOCKED — the offer is shown even though I-7 is blocked; honest note: "Withdraw requires completing the funded spike"); on confirm: hard-delete credential chain (OIDC subject + all keys + JWT material); `status → nuked`; renders "not provisioned" chip family + honest note; post-nuke copy: "Permanently destroys the signing credential. There is no recovery."
- `apps/web/lib/leash/oidc-issuer.ts` — OIDC credential lifecycle (I-1, B-03 gated): `POST /v1/wallet` provisioning; `signer_subject` management; cancel/nuke logic; all gated on `MAGIC_OIDC_PROVIDER_ID` env var
- `apps/web/lib/leash/revoke-audit.ts` — `agent_events` write on every status transition
- `apps/web/app/(leash)/provision/` — W8 provisioning surface (I-1/I-2): **BLOCKED (B-03)** — the UI renders the "Provision agent" button; on click it throws `OIDC_ISSUER_NOT_CONFIGURED` without any fake wallet address. Agent address display (I-2): renders $0.00 address placeholder with honest "Provisioning requires OIDC setup" note.
- `apps/web/app/(leash)/funds/` — W8 floats (I-3/I-4): per-chain float balances live via viem; owner unified balance labeled "includes floats"; top-up / auto-rebalance / withdraw buttons: **BLOCKED (B-04)** — disabled with honest state; no fake balance changes; "Topping up…" badge only renders on real `rebalance_ops` row
- `apps/web/app/api/leash/receipts/route.ts` — `GET /api/leash/receipts` + `GET /api/leash/receipts/:id`; per-receipt fields; strict reverse-chron (no mock ordering); ORIGIN included

### Real Integration Path

- Feed poll ~3s: real `GET /api/leash/receipts` query; "Live" chip tied to last successful poll timestamp.
- Receipt ORIGIN: real `{clientName, toolName, transport}` from Phase 6 proxy. No hardcoded client names.
- L1/L2 status gates: enforce immediately in Phase 6's `POST /api/agent/sign` status check.
- L3 Cancel: OIDC credential revocation is real (jose JWT invalidation + leash_key nullification). Copy variant from spike.
- L4 Nuclear: `status → nuked` is an irreversible tombstone in `agents.status`. The credential chain delete is real when OIDC issuer is configured.
- Post-nuclear PWA balance: real reads + honest stranded/withdrawn note — the drawn $0.00 is grounded to reality.
- Polygon cap rows: absent (dropped leg).

### Mock/Simulation Policy

- W1/W2/W3 render, all four revocation levels (mechanics): **REAL_MVP**.
- L4 "Withdraw first" offer: **BLOCKED (B-04)** on the withdrawal action itself; the offer dialog and copy are real; the "Withdraw" button is disabled with honest state.
- Provisioning (I-1): **BLOCKED (B-03)**. The provision button exists; it returns a clear not-configured error.
- Top-up / rebalance / withdraw: **BLOCKED (B-04)** buttons; no fake balance changes in DB or UI.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - Revocation state machine: L1 → paused; L2 → frozen; L3 → cancelled (OIDC revoked); L4 → nuked (irreversible)
  - Post-nuclear: any subsequent sign request returns 403/423; `nuked` status is permanent
  - Feed ordering: receipts in strict reverse-chron; no mock ordering
  - BLOCKED guards: provision button → `OIDC_ISSUER_NOT_CONFIGURED`; top-up button → disabled; no fake rows written
  - Nuclear dialog: shows live float balance (real read); "Withdraw first" button present but disabled (honest state)
- `turbo run build` — builds
- Grep gate: 0 hits (no fake resource domain hashes, no fake client name strings)

### Acceptance Criteria Covered

- R-DASH-4 (four-level revocation spectrum — canonical model)
- AC-LEASH-3 (soft pause halts agent): L1 enforcement in Phase 6 gate, UI in Phase 8
- AC-LEASH-4 (nuclear revoke blocks re-invocation)
- AC-DASH-1 (real-time receipt feed accuracy)
- Story 6 (owner revokes spectrum)

### Stop Condition

All four revocation levels work and write to `agent_events`. Feed shows real receipts in reverse-chron. W3 receipt detail has per-receipt ORIGIN field. Nuclear dialog renders live float balance. Provisioning is gated (honest not-configured state). Top-up and rebalance buttons are disabled (no fake balance changes).

---

## Phase 9: apps/mobile PWA

> **Parallel-buildable — does NOT wait on Phase 0.** Push notifications require a live HTTPS origin (B-06). Without B-06, the PWA renders in dev mode without push. The "Topping up…" badge is deferred until Phase 10 (rebalance_ops real data).

### Goal

The mobile PWA: P1 overview mirror, P2 feed, P3 receipt sheet, P4 Web Push T2/T3, P5 rich rows, P6 revoke sheet (all 4 levels), bell → notifications list, tab bar. No signing. No private key. No EIP-7702 on device.

### Work

**Files and areas:**

- `apps/web/app/mobile/layout.tsx` — PWA shell (or separate Vite build if mobile is its own app): manifest + service worker + deep links; installable (HTTPS origin required)
- `apps/web/app/mobile/page.tsx` — P1 overview: UA balance (`getPrimaryAssets()` — keys-gated); offline/stale machinery (`navigator.onLine` + cached last-fetch); "Topping up…" badge reads `rebalance_ops` (renders only when data exists — REAL_LATER until Phase 10)
- `apps/web/app/mobile/feed/` — P2 feed: shared `GET /api/leash/receipts` endpoint; per-status banners (blocked / failed / settled / pending variants); strict reverse-chron
- `apps/web/app/mobile/receipts/[id]/` — P3 receipt sheet: ORIGIN field, copy affordances, explorer links, pending detail
- `apps/web/lib/push/subscribe.ts` — Web Push VAPID subscription: `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` → `POST /api/push/subscribe`
- `apps/web/app/api/push/subscribe/route.ts` — store endpoint + keys in `push_subscriptions`
- `apps/web/lib/push/notifier.ts` — T2/T3 push dispatch via `web-push`; anti-cry-wolf: T3 never for routine events; push carries title/body only (tier colors in-app only, CUT from push payload)
- `apps/web/app/mobile/revoke/` — P6 revoke sheet: same 4 revocation levels as web (calls same `POST /api/leash/revoke` endpoints); L4 hold-3s + empty confirm inputs; no on-device signing
- `apps/web/app/mobile/notifications/` — P1 bell → responsive notifications list (same W5 endpoints)
- P5 lock-screen Revoke action (Android): `sw.notificationclick` → idempotent `POST /api/leash/agent/pause`; session-expired tap → login redirect (no dead end); iOS: OUT_OF_SCOPE (no action buttons in iOS push)
- Tab bar navigation

### Real Integration Path

- Revoke from mobile: HTTP call to `POST /api/leash/revoke` — same endpoint as web. No mobile-private key. No EIP-7702. Constraint 7 verified.
- Web Push: `web-push` VAPID on real events from the notifier (Phase 7). Anti-cry-wolf enforced at the notifier.
- Feed: shared receipt endpoint (Phase 6). Strict reverse-chron. No seeds.
- "Topping up…" badge: reads `rebalance_ops` table — only renders when a real rebalance op row exists. Deferred to Phase 10 milestone but the conditional render is written correctly now.

### Mock/Simulation Policy

- PWA shell, P1..P6, revoke, push: **REAL_MVP** (functionality; push requires B-06 HTTPS origin).
- "Topping up…" badge: **REAL_LATER** (visible correctly once I-6 unblocks in Phase 10). The UI component renders the badge only from real `rebalance_ops` data.
- All canvas furniture (status bars, lock-screen chrome, pre-typed inputs): **CUT**.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - Revoke from mobile: HTTP POST to revoke endpoint → agent status flips (same as web)
  - Push subscription storage: subscribe → `push_subscriptions` row created
  - PWA manifest: validates as installable (lighthouse PWA audit or manual check)
  - "Topping up…" badge: only renders when `rebalance_ops` row has `status: in_progress`; renders nothing on empty table
  - P6 L4 hold-3s: confirm input required; dismiss on wrong input
- `turbo run build` — builds (PWA asset generation)
- Grep gate: 0 hits

### Acceptance Criteria Covered

- R-DASH-6 (mobile monitor PWA: monitor + push + revoke)
- AC-MOBILE-1 (PWA revoke reaches backend and halts agent)
- L-1..L-8 (full mobile surface per matrix)
- Story 5 (partial — push T2/T3 for watching spend)
- Story 6 (revoke from mobile)

### Stop Condition

PWA installs on a real device (HTTPS domain required). All four revoke levels work from mobile. Web Push T2/T3 fires on real cap events. Feed shows real receipts. No on-device signing. "Topping up…" renders only when real rebalance data exists.

---

## Phase 10: Spike-Gated Flagship Milestone

> **BLOCKED until Phase 0 (B-04 spike report) + B-03 (OIDC issuer registration) both complete.**

### Goal

Wire all BLOCKED money-movers once the spike report confirms the Magic-signed UA-7702 path. After this phase, the judged demo can run end-to-end: buyer UA-7702 settle on Arbitrum, merchant live row, agent mainnet pay, top-up, auto-rebalance, withdraw.

### Work (grouped by unblocking prerequisite)

**Unlocked by B-03 (OIDC issuer + first Express wallet provision):**

- `apps/web/lib/leash/oidc-issuer.ts` — implement real `POST /v1/wallet` provisioning via OIDC JWT; synthetic agent `sub` scheme; confirm idempotency; pick copy variant (OQ-B03 result); `POST /v1/identity/provider` registration confirmed
- `apps/web/app/(leash)/provision/` — Enable the Provision agent button (I-1); display real `public_address` (I-2)
- `apps/web/app/api/agent/sign/route.ts` — Replace `SIGNER_NOT_CONFIGURED` stub with real Magic Express TEE call using spike-confirmed endpoint (either `sign/message` or `sign/data` over EIP-191 digest); decimal→hex conversion for `r,s,y_parity` per `eip-7702.mdx:23-124`

**Unlocked by B-04 (funded live spike confirms external-receiver settle + rootHash endpoint):**

- `packages/sdk/src/execute.ts` — Remove `PAYMENT_EXECUTION_BLOCKED` guard; wire real `createTransferTransaction → sign authorizations → personal_sign(rootHash) → sendTransaction(tx, sig, authorizations)` (3-arg form); update optimistic success state (A-13)
- `apps/web/lib/payments/verify.ts` — Wire real inline chain verification: Particle tx lookup using dest-hash field (per spike TransactionResult inspection); disambiguation by buyer's known UA sender address (never amount+window alone); real `settled` transition
- **FIRST_TEST_PAYMENT banner** (E-5): now resolves against real test settlement row
- **First live settled merchant row** (E-9): `mode=live` PATCH with real transactionId → verified → `settled` → webhook fires → M4 shows the proof row
- **Float top-up (I-5):** Enable the top-up button; wire UA self-transfer; TEE-sign with spike-confirmed endpoint
- **Auto-rebalance watcher (I-6) — THE flagship UA cross-chain move:**
  - `apps/agent/src/rebalance-watcher.ts`: polls floats; when Base float < 25% of target → `ua.createTransferTransaction({token:{chainId:CHAIN_ID.BASE_MAINNET, address:BASE_USDC}, amount:"20", receiver:agentAddress})` → TEE-sign rootHash → `ua.sendTransaction(tx, sig)` → write `rebalance_ops` row → "Topping up…" badge renders on mobile (Phase 9 component already written to handle this)
  - Each successful rebalance = real `transactionId` visible at `universalx.app/activity/details?id=...` = AC-LEASH-5 satisfied
- **Withdraw float (I-7):** Enable withdraw button; UA transfer to owner-named address; Base + Arbitrum v0; pre-nuclear sweep target
- **Agent mainnet pay (E-10):** With B-03 + B-04 + B-10 all cleared: leash-mcp proxy + real TEE-signed EIP-3009 pays x402 demo target; receipt writes real `txHash`; dashboard shows proof row
- npm publish: `@tab/sdk`, `leash-mcp`, `leash-fetch` (names reserved in B-08); Quickstart step 1 now auto-detectable
- Remove all `BLOCKED` dev banners that were gated on this phase

### Real Integration Path

Every action in this phase is REAL_MVP with no fallback. If any action fails at runtime (not in tests), the honest state persists (pending row, disabled button, error banner) — the code never fakes completion.

The canonical spike-script items (from reintegration §Plan Prerequisites item 5) each have a named consequence in this phase:
- rootHash endpoint pick → `sign/route.ts` endpoint constant
- dest-hash present → `verify.ts` primary path (vs fallback log-scan)
- Express free-tier confirmed → no custody fallback needed (if gated → PROPOSED fallback row in DECISIONS fires)
- new OIDC subject → new wallet → copy variant (a); same address → copy variant (b)
- Claude Code clientInfo string → `agent/connect` telemetry verbatim display

### Mock/Simulation Policy

**None.** This phase removes all BLOCKED guards. After this phase:
- No code path fakes a settled state.
- No code path fakes a txHash.
- No code path fakes a rebalance in progress.
- Test-mode settlements remain the ONLY simulation (labeled in UI).

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test` — all prior phase tests still pass; new tests:
  - Real TEE sign: integration test with real `MAGIC_OIDC_PROVIDER_ID` present → sign route returns a valid signature (not `SIGNER_NOT_CONFIGURED`)
  - Live payment lifecycle: `POST /api/v1/payments` → `PATCH /:id` with real transactionId + real chain verification → `settled` → webhook fired
  - Rebalance watcher: below-threshold float → `createTransferTransaction` called (mock UA SDK in test) → `rebalance_ops` row written
- **Live stranger test:** delete all seed state → fresh signup → use demo buyer pre-funded by Abu → complete checkout → confirm Arbiscan tx → merchant M4 shows live settled row → webhook fired to test endpoint → Leash agent pays demo target → receipt feed shows real txHash → universalx.app confirms rebalance op → PASSES (gate 14 adversarial audit)
- **Grep gate must still pass** (0 hits on banned constants)
- `turbo run build` — all packages build, including published SDK

### Acceptance Criteria Covered

After this phase:
- **AC-TAB-2** ✓ Cross-chain settle on Arbitrum (real Arbiscan tx)
- **AC-TAB-3** ✓ Optimistic success on `sendTransaction` return
- **AC-TAB-5** ✓ 7702 provable: nested init + 3-arg sendTransaction + Arbiscan
- **AC-LEASH-1** ✓ Agent pays x402 autonomously (mainnet, no code change in agent)
- **AC-LEASH-5** ✓ UA float rebalancing fires real cross-chain op (universalx.app visible)
- **Story 2** ✓ (buyer pays by email end-to-end)
- **Story 7** ✓ (UA float rebalancing demo)
- **Story 8** ✓ (flagship human cross-chain op — the judged RAT)

### Stop Condition

The stranger-test passes. Arbiscan shows a real tx from the buyer's Magic EOA to the merchant's Arbitrum address. The merchant's M4 shows the live settled row. The Leash agent pays the demo target and the receipt has a real txHash. The universalx.app explorer confirms a rebalance op. The grep gate still passes.

---

## Phase 11: Tab-as-x402-Resource (Stretch)

> **BLOCKED until Phase 10 is complete AND B-09 (CDP keys) + B-10 (demo target decision confirms Tab's own endpoint) are both in hand.**
> This is sequenced LAST per DECISIONS.md 2026-07-02.

### Goal

Tab exposes its own x402 endpoint (`POST /api/pay/x402`) so a Leash agent (or any x402 payer) can pay it headlessly. Closes the "one rail, two payer types" narrative. The merchant receives the same webhook whether the payer is human or agent.

### Work

**Files and areas:**

- `apps/web/app/api/pay/x402/route.ts` — hand-rolled `x402ResourceServer` from `@x402/core/server` (NOT `@x402/next` — that requires per-route merchant config beyond the simple middleware; the hand-rolled path is simpler); returns 402 with `{x402Version, accepts:[{scheme:"exact", network:"eip155:42161", maxAmountRequired, asset:USDC_ARB, payTo:MERCHANT, resource, maxTimeoutSeconds}]}`; on PAYMENT-SIGNATURE: calls CDP facilitator `https://api.cdp.coinbase.com/platform/v2/x402` (requires B-09 CDP keys); on settlement confirmation → creates `payments` row with `payer_type='agent'` → webhook fires same shape as human payment
- `apps/agent/src/fetch-wrapper.ts` — add Tab endpoint to the demo integration test
- Merchant M4 transactions: `payer_type` column renders "Agent" badge on agent-paid rows (vs "Human")
- R-RAIL-2 (merchant webhook receives same payload regardless of payer type): verified by inspection

### Real Integration Path

- CDP facilitator: authenticated `https://api.cdp.coinbase.com/platform/v2/x402` (B-09 keys); Arbitrum One active (confirmed `2026-07-06-eco-x402-mcp.md §6`).
- Leash agent `fetchWithPay(tabEndpoint)` uses the Phase 6 remote signer to sign EIP-3009.
- The same webhook delivery pipeline (Phase 3) fires after x402 settlement confirmation.

### Mock/Simulation Policy

**REAL_MVP** if B-09/B-10 are cleared. If CDP keys are not available before demo recording, this phase is labeled **DEFERRED** in the deck — the two-payer narrative is described as "implemented, pending facilitator keys" with honest disclosure. No fake agent-payment webhook is fabricated.

### Checks

- `biome check .` — 0 errors
- `turbo run typecheck` — 0 errors
- `turbo run test`:
  - 402 response shape: Tab endpoint returns correct x402 v2 `PAYMENT-REQUIRED` header with Arbitrum One `accepts[]`
  - Webhook fired on agent payment: agent pays Tab endpoint → `payments` row created with `payer_type='agent'` → webhook delivery row created
- `turbo run build` — builds
- **End-to-end test:** Leash agent calls `fetchWithPay(tabEndpoint)` → Tab 402 returned → Leash pays → CDP facilitator settles → merchant M4 shows agent-paid row with "Agent" badge → webhook received by test endpoint

### Acceptance Criteria Covered

- R-RAIL-1 (x402 endpoint on Tab checkout)
- R-RAIL-2 (one rail, two payer types, consistent webhook)
- AC-RAIL-1 stretch (agent pays Tab headlessly)
- Story 9 (one rail, two payers)

### Stop Condition

A Leash agent pays Tab's own x402 endpoint without any human interaction. The merchant's M4 shows both a human-paid row (Phase 10) and an agent-paid row (Phase 11) in the same transactions list. Both rows have real txHashes and real webhook deliveries.

---

## Verification Checkpoint

Run before any "it's done" or "it's real" claim is made. Per the no-shipping-mock contract and gate 14/15 from canton-lessons.

### Adversarial gate-14 audit (run first)

A fresh context (new browser session, no cookies) walks the full stranger path:
1. Open the merchant demo page cold
2. Click Pay → enter a real email address → complete Magic OTP
3. Confirm UA balance shows real `totalAmountInUSD` (not a constant)
4. Complete payment → confirm Arbiscan tx exists with the buyer's Magic EOA as sender and the merchant's Arbitrum address as receiver
5. Confirm M4 live settled row appears in the merchant dashboard
6. Confirm webhook delivery row exists with real HMAC-signed payload
7. Confirm Leash agent pays demo target → receipt feed shows real txHash
8. Confirm `universalx.app` shows a real rebalance op from the UA treasury

If any step fails, the phase that owns that step is not done. No status report claims it is.

### Machine checks (run before every demo recording)

```bash
# 1. Quality gates — all must pass green
turbo run lint && turbo run typecheck && turbo run test && turbo run build

# 2. Grep gate — must return 0 hits
grep -rniE \
  "atlas|ATL-|maya\.chen|atlascoffee|searchgrid|arxival|mapgrid|lexiconapi|newswire|datamall|research\.lab|Research Agent v2|0x7F3a|TAB-7B4A2|482913|9wKpQ2|abu@example|0x8f2e6c1a|1783088581|leash provision|@leash/mcp" \
  apps/ packages/

# 3. Seed-free boot — delete all seed state → app boots, golden loops work
# (manual — no test fixture imported by any request path)

# 4. Network-kill tests — per surface
# - Kill network during PayButton CONFIRMING → lands in ERROR state
# - Kill network during webhook delivery → retry scheduler fires
# - Kill network during feed poll → "stale" indicator appears (PWA)
```

### Status report format

Every status report begins with:

```
Stranger-test result: PASS / FAIL
  Buyer checkout (Arbiscan tx): [link or BLOCKED]
  Merchant live row (M4): [screenshot or BLOCKED]
  Leash agent receipt (txHash): [link or BLOCKED]
  UA rebalance op (universalx.app): [link or BLOCKED]
```

---

## Handoff Notes

### The single most important handoff note for Abu

**Phase 0 is entirely Abu's actions and it is the only thing blocking the flagship money-movers.** The build team can ship Phases 1–9 completely (the full merchant dashboard, buyer checkout through balance read, the MCP proxy, the full Leash control plane, the PWA) without Phase 0 being done. But Phases 10 and 11 — and specifically the judged demo — are 100% blocked on B-04 (the funded live spike). The spike is not hard to run; it is hard to defer. Run it early and produce the written spike report. Everything in this plan that carries the label BLOCKED is unblocked the moment that report exists.

**The spike script must cover all five named unknowns in one run:**
1. `createTransferTransaction(receiver=EXTERNAL_ADDRESS)` → confirm on Arbiscan
2. Which Magic Express endpoint reproduces `personal_sign(rootHash)` (try `sign/message` first; fall back to `sign/data` over EIP-191 digest)
3. Does `TransactionResult` contain a dest-hash field?
4. Does Magic Express provision wallets on the free Developer plan?
5. Does a new OIDC subject yield a new wallet address or the same address?

### Additional handoff notes

1. **Spec delta batch sign-off before any build agent touches Phase 2+.** The deltas are enumerated in the reintegration synthesis §SPEC DELTAS and repeated in the Open Questions above. A build agent that hits an unsigned delta will either block or resolve it silently. One sitting, one approval round, before coding begins in earnest.

2. **Atlas is provisioned via real signup code, not a seed.** If a build agent asks "how do I create the Atlas demo tenant", the answer is: run the signup flow with the Atlas email and business name. There is no `seed.ts` to run.

3. **The Magic Express API's Core v1 retires 2026-07-31.** If any agent writes code that uses the Core API v1 (`tee.magiclabs.com/v1/api` with `encryption_context`), stop and delete it. Express API only (`tee.express.magiclabs.com`). This is in `AGENTS.md`.

4. **UA SDK 2.0.3 types are the ground truth, not the docs.** If a build agent reads `Reference/particle-docs-mintlify/` and tries to use the flat init form or `universalGas`, stop and point it to the installed `2.0.3` tarball `.d.ts`. This is in `AGENTS.md`.

5. **The x402 canonical repo is `x402-foundation/x402`, not `coinbase/x402`.** The stale `coinbase/x402` clone (`dd927a2`, 2026-04-21) is a fork. Code patterns come from the published `@x402/*@2.17.0` npm tarballs or a fresh `x402-foundation/x402` clone. Phase 0 re-clones this.

6. **No Polygon.** UA SDK 2.0.3 removed Polygon from `CHAIN_ID`. The CDP facilitator does support Polygon mainnet, but the UA treasury cannot rebalance a Polygon float. Float chains = Base + Arbitrum only. Any code that adds a Polygon float target is wrong.

7. **The "≤15s first-attempt" webhook claim must never appear in merchant-facing docs** until D3 (scheduler/hosting decision) is made and confirmed. Internal latency target only.

8. **Phase gating for reporting:** any progress update that says "Phase N is done" must be accompanied by passing output from the four quality checks AND the grep gate AND the Phase N stop condition. No phase is done until all three are green.

---

*Source authority for every row label, route name, table name, enum value, and package version in this plan: `.thoughts/prototype-reintegration/2026-07-06-tab-v1.md` §Screen-to-Reality Matrix + §Integration Inventory (the canonical contract). Any deviation from those sections is a new proposal, not a plan execution.*
