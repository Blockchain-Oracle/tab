# Project Quality Profile: uxmax (Tab + Leash)

**Date:** 2026-07-02 · **Status:** Greenfield — no application code yet; only `.thoughts/` research
and `Reference/` cloned docs exist. All sections below are forward-looking recommendations.

---

## Detected Stack

Greenfield. The stack below is derived from the research wiki and constraints, not inferred from
existing code.

### Recommended: TypeScript throughout, pnpm workspaces + Turborepo monorepo

**Justification grounded in the wiki:**

- The Particle UA SDK (`@particle-network/universal-account-sdk`) and Magic SDK (`magic-sdk`,
  `@magic-sdk/admin`) are TypeScript-first. All three verified 7702-provider demos (Privy, Dynamic,
  Magic) are Next.js + TS. No Python or non-JS runtime appears in any integration path.
- viem is the canonical EVM primitive across Particle UA, x402 (`@x402/fetch`, `@x402/evm`), and
  Magic's recipe code; ethers is present in some Particle examples but viem is the cleaner pick.
- Turborepo gives incremental builds across packages without ceremony; pnpm workspaces is the
  default for Turbo and keeps lockfiles lean. The alternative (Nx) is heavier than a hackathon needs.

### Package breakdown

| Package | Contents | Key deps |
|---|---|---|
| `packages/sdk` | `<PayButton>` React component + TypeScript types; embeds as a drop-in `npm install` for merchants | react, viem, `@particle-network/universal-account-sdk`, `magic-sdk` |
| `apps/web` | Next.js 14 app (App Router): (a) checkout demo/modal for buyers, (b) merchant demo page, (c) Tab payment-intent API route + webhook handler, (d) Leash spend dashboard | `@particle-network/universal-account-sdk`, `magic-sdk`, `@magic-sdk/admin`, viem, `@x402/fetch`, `@x402/evm` |
| `apps/agent` | MCP stdio proxy (primary interception path for Claude Code/Desktop/Cursor) + hosted signer integration (Magic Server Wallet TEE); routes x402 payments per CAIP-2 network to pre-positioned USDC floats on Base/Arbitrum/Polygon; cap enforced server-side in the hosted signer (rejects signing on overspend); background UA float watcher issues async `createTransferTransaction` top-ups; per-payment receipt logging; no LLM | `@x402/core`, `@x402/fetch`, `@x402/mcp`, `@modelcontextprotocol/sdk`, viem, `@particle-network/universal-account-sdk`, `@magic-sdk/admin` (Server Wallets TEE) |
| `apps/mobile` | Monitor + notify + revoke client (see Open Questions — PWA vs RN) | depends on mobile decision; if PWA: Next.js or Vite; if Expo: `expo`, `expo-notifications` |
| `packages/contracts` | Foundry project — **only if** a spend-cap or revoke contract is actually needed (see Open Questions) | foundry, `@openzeppelin/contracts` |

**Why this split:** the SDK must be tree-shakeable and publishable independently (no Next.js
server-only code). The agent is a long-running Node process and should not share Next.js's
request/response model. The mobile surface needs no signing and calls the `apps/web` backend
for revoke — it is purely a read + call-backend client.

**x402 note from the research:** Leash is always the payer, never the facilitator. The CDP
hosted facilitator handles on-chain settlement; the agent never broadcasts. Interception has
three layers: (1) MCP stdio proxy (`@x402/mcp` + `@modelcontextprotocol/sdk`, primary — covers
Claude Code/Desktop/Cursor with zero agent code changes); (2) HTTP fetch-wrapper (`@x402/fetch`,
secondary — for direct-HTTP agents); (3) transparent MITM proxy + CA cert (last resort, opt-in
only). The wallet is a **hosted signer** (Magic Server Wallet TEE), not a raw private key in an
env var. USDC floats are pre-positioned on Base (primary, ~75% of real x402 traffic), Arbitrum
One (Tab + ~6% ecosystem), and Polygon (~8% ecosystem). Background float rebalancing uses the
Particle UA SDK (`createTransferTransaction`) asynchronously — never on the x402 hot path. The
Particle UA SDK (`@particle-network/universal-account-sdk`) is used only for the background
treasury→float top-ups; the x402 payment loop uses only `@x402/core` + the hosted signer.
**Dropped from the stack: Vercel AI SDK, `@openrouter/ai-sdk-provider`** — Leash has no LLM.

---

## Existing Commands

None yet (greenfield). Proposed canonical scripts for the root `package.json` / `turbo.json`:

```jsonc
// turbo.json (proposed)
{
  "pipeline": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":       { "cache": false, "persistent": true },
    "lint":      { "outputs": [] },
    "typecheck": { "outputs": [] },
    "test":      { "outputs": ["coverage/**"] }
  }
}
```

| Script (root) | Command | Notes |
|---|---|---|
| `dev` | `turbo run dev` | starts Next.js dev server + agent watcher in parallel |
| `build` | `turbo run build` | incremental; respects dep graph |
| `lint` | `turbo run lint` | Biome check across all packages |
| `typecheck` | `turbo run typecheck` | `tsc --noEmit` per package |
| `test` | `turbo run test` | vitest per package |
| `format` | `biome format --write .` | manual; not in Turbo pipeline |

---

## Required Local Checks

Run before every PR / before demo recording. All must pass green.

1. **Format + lint:** Biome (`@biomejs/biome`) — single tool for both; faster than ESLint+Prettier
   for a hackathon, zero config drift. `biome check --apply .`
2. **Type check:** `tsc --noEmit` per package (via `turbo run typecheck`). Catches the
   Particle/Magic/x402 type boundaries that are easy to violate.
3. **Unit tests:** `vitest` — focus on the payment-intent amount-pinning logic, the webhook
   signature verification, and the agent's spend-cap accounting. These are the three paths where
   a silent bug means a real financial error.
4. **Build:** `turbo run build` — ensures the SDK bundles correctly and the Next.js app compiles.
   Catches "works in dev, breaks in prod" ESM/CJS issues common with viem + Particle SDK.

Explicitly NOT required locally (save for CI or skip): coverage thresholds, Lighthouse, e2e.

---

## Required CI Gates

Minimal viable CI for a hackathon (GitHub Actions, single workflow file):

1. **lint** (`biome check .`) — fail fast on style/import errors.
2. **typecheck** (`turbo run typecheck`) — catches SDK boundary regressions.
3. **test** (`turbo run test`) — runs vitest across all packages; no coverage gate (threshold
   enforcement costs time; focus on fast feedback).
4. **build** (`turbo run build`) — catches bundling/SSR regressions before the demo.

Run on: push to `main` and every PR. Target total wall-clock: under 3 minutes (Turbo remote
cache if you set it up, otherwise local cache via GitHub Actions cache action).

**Not** required in CI for this hackathon window: e2e (Playwright/Cypress), Docker builds,
deployment previews (Vercel auto-deploys handle this), contract audits.

---

## Suggested Hooks

Keep pre-commit fast. A slow hook gets disabled in the heat of a hackathon sprint.

```jsonc
// .husky/pre-commit (proposed — ~5s on a modern Mac)
biome check --apply-unsafe $(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx)$')
tsc --noEmit --project tsconfig.json
```

**What this does:** format+lint only the staged TS/TSX/JS files (not the whole repo), then run
typecheck. The typecheck is project-wide (unavoidable for cross-package type safety) but
`--noEmit` is fast (~2-4s on a small monorepo).

**Do NOT add vitest to pre-commit.** Tests belong in CI, not the commit loop, for a hackathon.

**Commit-msg hook (optional):** validate conventional commit prefix (`feat|fix|chore|docs|refactor`)
via `commitlint`. Light to add, easy to skip-with-`-n` if needed under crunch. Recommend adding
it but not enforcing `--no-verify` blocks.

---

## File Size Policy

- **Target:** 200 source lines per file (soft; aim for this during writing).
- **Warning:** > 200 lines — split if there's a clean seam (separate the Particle UA transaction
  builders from the Magic auth wiring; separate the x402 fetch wrapper from the agent spend-cap
  logic).
- **Hard cap:** 300 lines. A file over 300 lines in a hackathon codebase almost always means a
  missing module boundary.
- **Exclusions** (never count): generated files (`*.generated.ts`, `.next/`, `dist/`, `out/`),
  lockfiles, Foundry artifacts, test fixtures/snapshots, migration files.
- **Rationale:** the Particle UA SDK integration has multiple concerns (init, auth flow, tx builder,
  7702 authorization loop, send). If they all land in one file the logic becomes impossible to test
  or hand to an AI editor. The 200/300 policy forces the seams early.

---

## Commit Policy

**Conventional Commits — recommended but not hard-enforced for the hackathon.**

Suggested prefix set:

| Prefix | When |
|---|---|
| `feat:` | new user-facing capability |
| `fix:` | bug or incorrect behavior |
| `chore:` | deps, config, tooling |
| `spike:` | RAT / proof-of-concept (may be reverted) |
| `wip:` | explicit in-progress (fine to push, signals incomplete) |

Use `--no-verify` sparingly (only under live demo crunch). If CI fails on main, fix forward
rather than force-pushing — the demo recording needs a green CI badge.

---

## AGENTS.md Notes

The future repo `AGENTS.md` (instructions for any AI coding agent working in this repo) should
surface the following so agents don't contradict verified facts:

1. **Primary knowledge source:** `.thoughts/wiki/` contains the verified, source-cited domain
   wiki. Read `wiki/index.md` first. All SDK pages, concept pages, and strategy pages are there.
   Do not guess SDK API shapes — read the wiki page or the cloned `Reference/` docs.

2. **The 7702 hard constraint** (`wiki/sdks/particle-universal-accounts.md`, surface-support
   section): EIP-7702 mode only works with embedded/WaaS wallets (Magic, Privy, Dynamic) or raw
   server keys — never MetaMask/extension/JSON-RPC wallets. Any code that wires an injected
   wallet to `useEIP7702: true` will silently fail. The nested `smartAccountOptions.useEIP7702: true`
   form (not the flat quickstart form) is required to prove 7702 mode to judges.

3. **x402 multi-chain float pattern** (`research/2026-07-02-x402-multichain-strategy.md`, §3):
   the agent's USDC must be **pre-positioned** at the agent's EOA address on Base (primary,
   ~75% of real x402 traffic), Arbitrum One (~6%), and Polygon (~8%). Chain-abstracted UA
   balance is NOT visible to the x402 facilitator — it checks `balanceOf(EOA, network)` at
   settlement time. Leash routes each payment to the correct float by reading
   `accepts[].network` (CAIP-2) from the 402 response. The Particle UA SDK is used
   **asynchronously and separately** to top up floats in a background watcher — never in the
   x402 hot path (on-demand bridging takes 10–90s and breaks the synchronous payment loop). Do
   not wire `ua.sendTransaction` or `ua.createTransferTransaction` inside the x402 payment
   handler. Solana x402 (`@x402/svm`) is out of scope for v0.

4. **No session-key delegation on UA 7702:** Particle's session keys are Biconomy-v2.0.0-only and
   cannot attach to a UA in 7702 mode. Leash spend caps are app-layer policy (agent loop +
   server-held key rotation/disable), not a cryptographic delegation primitive. Do not generate
   code that calls a session-key API on a UA.

5. **Mobile signs nothing** (`research/x402-tab-leash-mechanics.md`, §5): the mobile monitor app
   makes no EIP-7702 authorizations and holds no private key. Revoke is an HTTP call to the
   `apps/web` backend which disables/rotates the server key. Do not add any `signAuthorization`
   or `signMessage` to the mobile package.

6. **V2 migration warning** (Particle UA page, gotchas): UA V2 migration is live. Re-verify
   account version before any demo recording. The `UNIVERSAL_ACCOUNT_VERSION` import in the SDK
   init may need updating.

---

## Open Questions

These are real decisions for Abu. Do not silently resolve them in code.

### (1) Mobile surface: true React Native / Expo app vs responsive PWA

**The trade-off:**
- **PWA (Vite or Next.js `/mobile` route):** no App Store, instant iteration, zero RN setup
  friction, ships in the same `apps/web` deployment. Push notifications via Web Push API (works
  on iOS 16.4+ Safari, Android Chrome). Adequate for a hackathon judge demo. Weakness: judges
  who want to scan a QR and see a "real app" may mark it down visually.
- **React Native / Expo:** native push (Expo Notifications), real app-store look-and-feel,
  and — critically — the Particle RN SDKs (Auth/Connect) and Magic RN SDK are first-party.
  However the UA signing path is web-only (`@particle-network/universal-account-sdk` is TS/JS
  and unverified for RN, per `wiki/strategy/surface-feasibility.md`). Since mobile does NO
  signing, this is not a blocker for Leash's monitor/revoke, but Expo setup time is non-trivial
  under a hackathon deadline.

**Recommendation pending your call:** start with a PWA; add the Expo upgrade only if it genuinely strengthens the demo (native push, real app-store look) once the Tab/Leash core is solid. The spend dashboard (web) is more demo-critical than the mobile surface.

### (2) Demo-critical vs cuttable surfaces — scope call before writing a line of code

The submission deadline is not a factor in scope or quality (per Abu) — build the right product; prioritize by product/demo merit, not time. Building web + mobile + SDK + agent all to depth simultaneously risks doing none of them well; the research memo explicitly flags this. Proposed priority order (by product/demo merit):

| Priority | Surface | Why |
|---|---|---|
| **1 — must ship** | Particle UA 7702 + Magic email-OTP flow (the buy-side checkout core) | Proves the flagship requirement AND the Magic $500; 30% of judging is "innovative UA use" |
| **2 — must ship** | Merchant `<PayButton>` SDK + payment-intent API route + webhook (Tab) or headless agent + one x402 call (Conductor/Leash) | The "product" story; pick ONE archetype (Tab or agent), not both |
| **3 — high value** | Leash spend dashboard (web) | UX judging weight is 40%; a real spend-control UI scores here |
| **4 — lowest-priority surface** | Mobile monitor app | Nice-to-have; adds surfaces but not depth; include when the core rail is solid and the mobile surface strengthens the demo |
| **5 — cut** | Browser extension | Dead on the flagship track (7702 requires embedded wallet, not injected EOA) |

**This is a spec-gate scope call.** Commit to (1) + one of (2) + (3) before writing any code.

### (3) Monorepo tooling — confirm pnpm + Turborepo

Recommended: pnpm workspaces + Turborepo. Alternative is a flat repo (no monorepo) if the
SDK package is never published and is just imported locally. The monorepo is the right call IF
the SDK is genuinely a separate publishable package — which it is if Tab is the chosen archetype.
If the agent archetype is chosen and there is no merchant SDK, a flat Next.js + `/agent` folder
may suffice and saves tooling overhead. Confirm the archetype first, then confirm the monorepo.

### (4) Is any custom Solidity contract actually needed?

**Current evidence says: almost certainly no.**

From `research/x402-tab-leash-mechanics.md` §4 and the wiki: the "leash" (spend cap) is
explicitly described as an **app-layer policy** — the agent loop enforces a ceiling on
cumulative spend, and revoke is a backend key rotation/disable, not an on-chain transaction.
Particle's session-key delegation (the one thing that would need a contract) is confirmed
blocked on UA 7702 mode (Biconomy-v2.0.0-only). The only contract scenario that could arise
is a custom spend-cap guard on-chain for judging credibility, but the research memo explicitly
says to "pitch the leash as economic, not cryptographic" and warns judges will dock overclaiming.

**Decision:** do not add `packages/contracts` / Foundry until a concrete, judge-convincing
on-chain requirement emerges. App-layer policy is the correct and honest architecture.
If a contract is eventually added, scope it to a minimal `SpendCapGuard.sol` (< 100 lines)
with a Foundry test; do not reach for OpenZeppelin governors or complex delegation schemes.
