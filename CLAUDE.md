# CLAUDE.md — Tab + Leash Project Rules

Mirror of the quality profile and AGENTS.md key rules.
Read AGENTS.md first. This file is the fast-reference subset.

## Stack

TypeScript monorepo: pnpm + Turborepo.
- `packages/sdk` — `<PayButton>` + `new Tab(sk)`, publishable npm package
- `apps/web` — Next.js **16.2.10** App Router (merchant + Leash dashboards, checkout, backend)
- `apps/agent` — Leash MCP stdio proxy + x402 fetch wrapper + cap engine
- `apps/mobile` — PWA monitor (read + revoke only; **no on-device signing**)

## Commands

```bash
pnpm install          # install all workspace deps
pnpm dev              # turbo dev (all apps in parallel)
pnpm build            # turbo build
pnpm lint             # biome check . (NO ESLint, NO Prettier)
pnpm typecheck        # turbo typecheck (tsc --noEmit per package)
pnpm test             # turbo test (vitest per package)
pnpm format           # biome format --write .
```

## Quality Gates (must all pass before any phase is "done")

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Plus the grep gate (0 hits):
```bash
pnpm check:showcase
```

## Pinned Versions (do NOT drift without a DECISIONS.md entry)

| Package | Pin |
|---|---|
| `@particle-network/universal-account-sdk` | `2.0.3` |
| `magic-sdk` | `33.9.0` |
| `@x402/*` | `~2.17.0` |
| `@modelcontextprotocol/sdk` | `^1.29.0` |
| `viem` | `^2.48` |
| `next` | `16.2.10` |

## Hard Rules (from AGENTS.md)

1. **No fake money state.** Every TEE/UA money-mover is BLOCKED until the written Phase 0
   spike report exists. A client-visible environment flag is never sufficient authorization.
2. **7702 init shape:** nested `smartAccountOptions.useEIP7702: true` only.
   No flat `ownerAddress`, no `universalGas` (both removed in UA SDK V2).
   The wallet provider must be embedded/WaaS (Magic in this project) or a raw server key;
   never use an injected extension or JSON-RPC wallet for 7702 mode.
3. **No Polygon.** Floats = Base primary + Arbitrum One. UA SDK 2.0.3 dropped Polygon.
4. **Pre-position floats.** x402 spends USDC already at the signer EOA on Base/Arbitrum;
   Particle UA rebalancing is asynchronous and never runs in the payment hot path.
5. **No session keys on UA.** Session keys are Biconomy-v2-only; incompatible with 7702 UA.
6. **Mobile signs nothing.** No `signAuthorization`, no `signMessage` in apps/mobile.
7. **No ESLint, no Prettier.** Biome only (`biome.json` at root).
8. **Trust installed types.** Particle docs lag SDK by weeks. Read `node_modules` types, not docs.
9. **Re-clone x402 from `x402-foundation/x402`** (not coinbase/x402 — that's a fork).
10. **File length:** target 200 lines, hard cap 300 lines (excludes generated/fixtures/migrations).
11. **Magic Core API v1 is dead** (EOL 2026-07-31). Express API only.
12. **Do NOT edit `.thoughts/`** as a side effect of coding. Propose deltas separately.

## Grep Gate (fabricated-showcase-constants — must return 0 hits)

```bash
pnpm check:showcase
```

0 source hits = green. Any hit = phase is NOT done. Generated output and dependency directories
are excluded to prevent binary cache matches from producing false failures after a build.
