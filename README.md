# Tab

### Invisible payments — for you, and for your AI.

Paying online is still clunky — and now it's not just *us* paying, it's the AI agents
working for us too. People fight with wallets, cards, and logins. Agents hit a paywall and
stop cold. **Tab makes paying disappear:** you pay for anything with nothing but an email,
and your AI agents pay their own way — so they never get stuck. One balance. Anyone, or
anything, can pay from it.

Built for the **Particle Network Universal Accounts** hackathon (EIP-7702 chain abstraction),
targeting the Arbitrum and Magic Labs bonuses.

---

## What it is

**One balance, two ways to spend it:**

- **You pay (Tab checkout):** a drop-in pay button. Log in with just an email — no wallet,
  no cards, no chains. Your funds are sourced from wherever they live and the merchant is
  paid on Arbitrum. It feels like a normal checkout; you never know it's crypto.
- **Your AI pays (agent mode):** install Tab alongside your own AI agent (as an MCP server or
  an HTTP wrapper). When the agent hits a paywall — an **x402** (HTTP 402) charge — Tab pays
  it automatically, then the agent continues. You set the cap, watch every cent, and can
  cut the agent off instantly.

## How it works (the machinery, kept invisible to users)

- **Particle Universal Accounts + EIP-7702** turn an email login into one chain-abstracted
  account — one balance that works across chains with no gas or bridges to think about.
- **x402** is the "pay-per-call" standard agents hit; Tab is the consumer-side auto-payer that
  most of the ecosystem is missing (existing tools have no spend caps, kill switch, or
  monitoring).
- A **hosted signer** (Magic Server Wallets, TEE) holds the key and enforces the spend cap
  *outside* the agent — so a runaway agent can't overspend.
- **Multi-chain floats** (Base primary, plus Arbitrum) are pre-positioned and
  **rebalanced in the background** from the one Universal Account treasury — that cross-chain
  rebalance is a genuine UA cross-chain move.

## Status

**The product is live.** Marketing site ([runtab.xyz](https://runtab.xyz)), app
([app.runtab.xyz](https://app.runtab.xyz) — merchant dashboard, buyer checkout, agent control
plane, mobile monitor), and docs ([docs.runtab.xyz](https://docs.runtab.xyz)) are deployed, and
both packages are published on npm: [`@runtab/sdk`](https://www.npmjs.com/package/@runtab/sdk)
(drop-in `<PayButton>`) and [`@runtab/mcp`](https://www.npmjs.com/package/@runtab/mcp) (the
`tab-mcp` agent proxy). Payments run end-to-end on Base Sepolia sandbox with caps, kill switch,
receipts, and live monitoring.

The funded live spike in Phase 0 is not complete, so every money-moving path remains visibly
blocked: buyer settlement, agent mainnet payment, float movement, and automatic rebalance are
not simulated as real behavior. Particle and x402 integration work is grounded in installed
package types and the canonical `x402-foundation/x402` source clone.

## Repository map

```
.thoughts/
  wiki/          domain knowledge (Particle UA, EIP-7702, x402, chain abstraction, the SDKs)
  research/      reality + feasibility research (x402 mechanics, interception, multi-chain, UX)
  specs/         the product spec (what/why/done, requirements, acceptance criteria)
  stories/       BDD user stories, traceable to spec requirements
  design/        product surface map + designer brief (screens, states, data)
  decisions/     DECISIONS.md — the durable decision log
  brand-and-vision.md
apps/
  web/           Next.js checkout, backend, merchant + agent dashboards; mobile monitor
                 PWA at app/mobile (read + revoke only; no on-device signing)
  site/          marketing site (runtab.xyz)
  docs/          documentation site (docs.runtab.xyz, Fumadocs)
  agent/         Tab MCP proxy (tab-mcp / @runtab/mcp), x402 wrapper, cap engine, receipts
packages/
  sdk/           @runtab/sdk — drop-in PayButton and Tab client package
instuctions.md   the original hackathon brief
PITCH-DECK-PROMPT.md   5-slide pitch-deck generation prompt
```

> `Reference/` (cloned partner + x402 docs, ~709 MB) is git-ignored — it's third-party source,
> reproducible from the clone commands referenced in the wiki.

---

*Tab — invisible payments for people and the AIs working for them.*
