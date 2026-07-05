# Applause — cross-chain creator tipping + optional auto-tip agent

- **Type:** refactor
- **Geometric mean:** 0.66 (rank #3 of 13)
- **Verdict:** viable-risky
- **Scores:** novelty 0.45 · judgeFit 0.80 · buildability 0.78 · prizeStack 0.88 · wedgeStrength 0.50

## One-liner
Tip any creator in any token from one pooled cross-chain balance — they receive a single unified balance on whatever chain they cash out to — plus an optional budget-capped AI agent that auto-tips creators you watch based on engagement.

## Why it wins (anchored to judging weights + prize math)
- **UX axis (40% flagship / 30% Arbitrum) — high.** The tip = a clean instantiation of invisible-crypto chain abstraction ("tipping feels like a Like — no chain picker, no gas"). Directly serves UX-40% + prominent-UA-use-30%.
- **Prominent UA+7702 use (30%) — satisfied by the core.** The tip itself is the required cross-chain value move via UA (`createTransferTransaction`, `useEIP7702:true`, Magic as signer).
- **Buildability — the single most documented happy path in the wiki:** a literal `ua-7702-magic-demo`, transfer/buy builders, and server-key 7702 signing (`authorizeSync`) for the agent.
- **Distribution edge — strong.** "Set $10/week, it rewards the best clips you watch" is a shareable autonomy demo that travels (Abu's edge), and the paylink/overlay narrative feeds the 20% adoption axis.
- **Prize stack math:** flagship UA **$2,500** + Arbitrum **$2,000** + Magic **$500** = **$5,000** / 3 prizes. CEILING — cannot add Openfort ($100) or ZeroDev ($500) (General Track, mutually exclusive). Magic does double duty as signer + bonus.

## The wedge
**Pooled-to-pooled cross-chain tipping with an autonomous auto-tipper as the differentiator.**

**Uncomfortable truth:** the headline differentiator (AI auto-tipping creators) ALREADY SHIPPED AND WON — the candidate's own source "Tip This Creator" (an AI agent that tips creators on X with crypto) won a Coinbase AgentKit prize at Agentic Ethereum. If judges read the agent as a re-skin, what remains is the single most obvious UA demo there is — "move value cross-chain to another person" = a tip jar — which many entrants will independently arrive at. The pooled-to-pooled wedge is just "use UA on both sides" (UA's default behavior, no proprietary insight). Novelty and wedge collapse together if the agent doesn't carry weight. Base concept (plain tipping) is saturated (400+ above-threshold in corpus). It IS port-novel-here (no UA-7702 tipping app in corpus).

## Surfaces
- Web tip-button (X/YouTube overlay must stay pure UI handing off to the Magic signer — an injected extension wallet CANNOT sign Type-4 7702 authorizations per the verified hard constraint).
- Creator dashboard (unified balance, cash-out chain pick).
- Server-key agent (the autonomous auto-tipper) signing 7702 headlessly.
- CUT the mobile surface (unverified native UA-7702, not load-bearing).
- Needs two live creator payout wallets scripted for the demo.

## Single riskiest assumption
That the auto-tip AGENT is a real differentiator. It is the candidate's stated freshness, yet "Tip This Creator" already shipped AND won. If the agent reads as a re-skin, the remaining product is the most obvious UA demo possible (a tip jar), with no moat.

## <=2h Riskiest-Assumption Test
Clone `ua-7702-magic-demo`; prove ONE server-key 7702 cross-chain tip from a pooled UA balance to a creator payout wallet on Arbitrum settles cleanly (verify on Arbiscan / universalx activity). Then — the real risk is differentiation, not plumbing — pull up "Tip This Creator" / ClapCoin and write ONE sentence describing what the auto-tipper does that they didn't. If you can't, lead with the AGENT's cross-chain budget-allocation as the hero (a server-key autonomous tipper spending a chain-abstracted float — exactly the "crypto invisible to AI agents too" lens), not the human tip, since the human tip is where the obviousness/precedent risk lives.

## Build guidance
- Cut mobile; keep web tip-button + creator dashboard + server-key agent.
- Make the AGENT the visible hero, not the human tip.
- Any social overlay = pure UI handoff to Magic; never let an extension wallet attempt the 7702 signature.
- Verify UA V2-migration state at build time.

## Verdict framing
A competent, highly-buildable, full-stack-eligible SAFE pick whose risk is crowding/obviousness, not feasibility.
