# AGENTS.md

## Project Snapshot

**Tab — "Invisible payments — for you, and for your AI."** One balance: people check out with
just an email; their AI agents auto-pay their own x402 bills on a leash (budget + kill switch).
Built on Particle Universal Accounts + EIP-7702, settling on Arbitrum.

TypeScript monorepo (pnpm + Turborepo):
- `packages/sdk` — the drop-in `<PayButton>` + `new Tab(sk)` client
- `apps/web` — Next.js **16.2.6+** (checkout + Tab backend/intent API + webhooks + merchant dashboard + Leash dashboard)
- `apps/agent` — the Leash MCP stdio proxy + `@x402/fetch` wrapper + cap engine + receipt ledger
- `apps/mobile` — PWA monitor (feed / notify / revoke; **no on-device signing**)

## Working Rules

- **The plan is the map.** Build in the phase order of `.thoughts/plans/2026-07-06-tab-build-plan.md`. Each phase ends with a runnable, verified checkpoint + its named acceptance criteria.
- **`.thoughts/decisions/DECISIONS.md` is authoritative.** When in doubt, it wins over older docs.
- **This is a product, not a demo.** No demo accounts, no seeded tenants, no hardcoded showcase data. Every number on a screen must have a real source or be a labeled BLOCKED/dev state.
- **Realness over speed. The deadline is NOT a factor** — never scope-cut for time.
- **Ground everything; never invent an SDK capability.** Trust the *installed* package types over docs (Particle/x402 docs lag the shipped SDKs — see DECISIONS + `.thoughts/quality/`). Mark unverified things `(unverified)`.

## Commands

> Live after Phase 1 scaffold. Canonical (from the quality profile):
- Install: `pnpm install`
- Dev: `pnpm dev` (turbo) · Build: `pnpm build`
- Lint/format: `pnpm lint` (Biome) · Typecheck: `pnpm typecheck` (`tsc --noEmit`)
- Test: `pnpm test` (Vitest)

## Quality Gates (per phase, before "done")

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green. File length target 200 / warn 200 / hard-cap 300 source lines (exclude generated/fixtures). Verify by running — evidence before "it works".

The fabricated-showcase grep gate in `CLAUDE.md` must also return 0 hits in `apps/` and
`packages/` before a phase is complete. Run it with `pnpm check:showcase`; the script excludes
generated and dependency directories so build caches cannot create binary false positives.

## Context Workflow

Before touching code, read the relevant `.thoughts/`: `plans/2026-07-06-tab-build-plan.md`,
`specs/2026-07-02-tab-leash.md`, `prototype-reintegration/2026-07-06-tab-v1.md` (the screen-to-reality
matrix + no-shipping-mock labels), `decisions/DECISIONS.md`, and `quality/2026-07-02-project-quality-profile.md`
(pinned package versions + ecosystem-drift warnings). The prototype at `.thoughts/design/prototype-v1/` is
**visual law only** — it governs how things look, never how they work.

## PR And Review Expectations

Work per phase on a branch. Before completion of any phase: run the quality gates, then the
`verification-audit` (spec→story→plan→code→tests traceability). No claim of "done" without run evidence.

## Do Not

- **Do NOT fake, mock, or hardcode a money-moving state on any judged path.** Buyer settle, agent mainnet pay, float top-up/withdraw, and the flagship auto-rebalance are **BLOCKED until the funded live spike (Phase 0)** — build those surfaces with the money-path visibly disabled/test-mode, never simulated-as-real.
- **No LLM / model picker in Leash** — it's a pure x402 auto-payer.
- **Pre-position floats; never bridge in the x402 hot path.** x402 pays only from USDC already
  present at the signer EOA on Base or Arbitrum. Particle UA rebalancing is asynchronous.
- **No Particle session keys on a 7702 UA.** The cap is app-layer policy enforced before signing.
- **No Polygon** (UA SDK V2 removed it; floats = Base primary + Arbitrum only). **No flat UA init / `universalGas`** (V2 is nested-`smartAccountOptions`-only).
- **7702 requires an embedded/WaaS wallet or raw server key.** Never wire an injected extension
  or JSON-RPC wallet to `useEIP7702: true`; this project uses Magic for the wallet provider.
- **Magic Express API only.** Core API v1 is retired; never build new code on it.
- Do not use the pinned deps' unpinned/major-next versions (e.g. `@modelcontextprotocol/sdk` stays `^1.29.0`, not v2 beta). Re-clone x402 from `x402-foundation/x402`, not the coinbase fork.
- Do not commit `.env`/secrets. `Reference/` is git-ignored (third-party clones). Do not edit `.thoughts/` specs/plans as a side effect of coding — propose deltas.
