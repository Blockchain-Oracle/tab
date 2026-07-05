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
- **Your AI pays (Leash mode):** install Tab alongside your own AI agent (as an MCP server or
  an HTTP wrapper). When the agent hits a paywall — an **x402** (HTTP 402) charge — Tab pays
  it automatically, then the agent continues. You set the budget, watch every cent, and can
  pull the leash instantly.

## How it works (the machinery, kept invisible to users)

- **Particle Universal Accounts + EIP-7702** turn an email login into one chain-abstracted
  account — one balance that works across chains with no gas or bridges to think about.
- **x402** is the "pay-per-call" standard agents hit; Tab is the consumer-side auto-payer that
  most of the ecosystem is missing (existing tools have no spend caps, kill switch, or
  monitoring).
- A **hosted signer** (Magic Server Wallets, TEE) holds the key and enforces the spend cap
  *outside* the agent — so a runaway agent can't overspend.
- **Multi-chain floats** (Base primary, plus Arbitrum/Polygon) are pre-positioned and
  **rebalanced in the background** from the one Universal Account treasury — that cross-chain
  rebalance is a genuine UA cross-chain move.

## Status

**Research + product design complete; implementation is the next phase.** This repository is
the full context-engineering groundwork behind Tab — every requirement is grounded in real,
cited research (including cloned/read source from `coinbase/x402` and prior-art proxies), and
cross-checked for consistency. No fabricated capabilities.

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
instuctions.md   the original hackathon brief
PITCH-DECK-PROMPT.md   5-slide pitch-deck generation prompt
```

> `Reference/` (cloned partner + x402 docs, ~709 MB) is git-ignored — it's third-party source,
> reproducible from the clone commands referenced in the wiki.

---

*Tab — invisible payments for people and the AIs working for them.*
