# Leash — capped-allowance AI agent on a UA balance

- **Type:** fresh
- **Geometric mean:** 0.665 (rank #2 of 13)
- **Verdict:** viable-risky
- **Scores:** novelty 0.52 · judgeFit 0.82 · buildability 0.76 · prizeStack 0.80 · wedgeStrength 0.50

## One-liner
Fund one email-login balance, hand an AI agent a capped allowance, and it autonomously shops/pays across chains via a server-key UA-7702 account while a live dashboard tickers every purchase behind a big red revoke button.

## Why it wins (anchored to judging weights + prize math)
- **UX axis (40% flagship) — bullseye, AND it carries Abu's lens.** "Invisible crypto for the human AND the agent" is the strongest expression of the sponsor thesis. The split-screen "agent buys / dashboard ticks up / dramatic revoke" video is exactly Abu's distribution edge and a more viral demo beat than a pay button.
- **Prominent/innovative UA+7702 use (30%) — load-bearing and inventive.** A server-held key signing 7702 authorizations IS how an autonomous agent operates (per the verified hard-constraint note), so this is the most ON-PURPOSE use of the flagship primitive — and the part of the rubric that rewards INNOVATIVE (not just prominent) UA use.
- **Lands the identified white space.** Both corpus and online landscape flag "autonomous agent moving value out of a chain-abstracted UA balance via a server 7702 key" as the best open white space on THIS ecosystem.
- **Prize stack math:** UA flagship **$2,500** + Arbitrum invisible-UX **$2,000** + Magic embedded **$500** = **$5,000** across 3 prizes. Correctly scoped — does NOT overclaim a General-Track subtrack (mutually exclusive). Magic is load-bearing (verified 7702 provider doing human onboarding/funding/kill-switch UI), and Arbitrum's own example idea list literally names "AI apps with invisible onchain payments."

## The wedge
**An economic + operational leash on an autonomous spender.** Fund once, cap the allowance, watch it spend cross-chain, revoke instantly.

**Brutal honesty — the moat is thin.** The "guardrails" (weekly cap + category allowlist + expiry) are enforced by the team's own OFF-CHAIN policy + a trivial Solidity contract, NOT by any Particle chain-abstraction primitive. The candidate already concedes the leash is app-level funding-cap + kill-switch, NOT a Particle cryptographic session key — so the "scoped allowance" pitch rides on FRAMING, not a chain-enforced primitive. This is also the single most-pitched AI-payments pattern of 2025-2026 (SpendMate, Agent Command Center, AgentPass, SentinelDao in-corpus; Coinbase Agentic Wallets, Stripe Link-for-agents, Openfort agent wallets, x402/AP2 in-market), and **Particle is shipping the same concept itself ("Universal Agent Accounts").** Flip side: demoing the sponsor's own roadmap as a working first-mover is GOOD for judgeFit/incubation — but you must be honest the leash is economic, not cryptographic, because judges punish overclaiming.

## Surfaces
- Web dashboard: human funds via Magic + the big-red revoke/freeze button + live purchase ticker.
- Server-key UA-7702 agent: headless TS LLM loop that shops/pays cross-chain.
- Optional simple Solidity allowance contract (treat as cut-able polish — capped funding + off-chain policy already enforces the cap).
- Settlement: Arbitrum (first-class CHAIN_ID).
- Explicitly NOT building: native mobile, extension-7702.

## Single riskiest assumption
That an AGENT-held raw server key (not the human) can be the EOA that becomes the UA in 7702 mode, AND that flagship judges accept it as the "user's EOA" doing the required cross-chain value op — with the human's Magic wallet merely funding it. The wiki explicitly flags this as an OPEN question ("will UA-Track judges accept an agent, not a human, as the EOA owner? The track says 'user's EOA'"). If judges demand the human wallet be the 7702 UA, the agent must act via on-chain session-key delegation under it — which collides with Particle's verified **Biconomy-v2.0.0-only session-key caveat** that may not line up with UA 7702 mode.

## <=2h Riskiest-Assumption Test
Clone `Particle-Network/universal-account-example/examples/7702-convert-evm.ts`, fund a throwaway SERVER key with a few dollars of USDC on one chain, and run ONE `createBuyTransaction` targeting an Arbitrum token from pooled assets — signing the Type-4 authorization via `wallet.authorizeSync` plus the `rootHash`, then `sendTransaction(tx, sig, authorizations)`. **Green = a raw server key ALONE (no browser, no human wallet) signs a UA-7702 cross-chain value move and it settles on Arbitrum** (verify on the universalx activity link). That single test proves the agent-as-7702-UA path — the literal flagship requirement and the core of Leash. **In parallel, ping the hackathon Discord/FAQ to confirm judges accept an agent-held key as the "user EOA"** — that one answer de-risks the interpretation half. If both pass, this jumps toward commit.

## Build guidance
- Tighten the pitch to be HONEST that the leash is economic (capped funding) + operational (revoke/freeze), not a cryptographic Particle session key. The honest version still demos beautifully.
- Make the kill switch visibly real (defund/freeze the agent's funded sub-account + halt the loop) to score the 40% UX axis.
- Consider cutting the Solidity allowance contract to optional polish to protect the timeline.
- Scope is large for the window (agent loop + two-wallet 7702 wiring + dashboard + cross-chain demo) — re-verify V2-migration state at build time.

## Grounding files
- `/Users/abu/dev/hackathon/uxmax/.thoughts/wiki/sdks/particle-universal-accounts.md` (server/CLI 7702 = yes; verified providers Dynamic/Magic/Privy + server keys; V2 caveat)
- `/Users/abu/dev/hackathon/uxmax/.thoughts/wiki/concepts/agent-wallets.md` (agent-as-owner open question; Biconomy-v2.0.0 session-key caveat; "Universal Agent Accounts" roadmap)
- `/Users/abu/dev/hackathon/uxmax/.thoughts/wiki/strategy/surface-feasibility.md` (Particle agent column = partial / build-it-yourself, unverified as official use case)
