# DECISION MEMO — UXmaxx (Particle UA + Arbitrum + Magic) hackathon

**Date:** 2026-06-30 (v2 refresh) · **For:** Abu · **Scope principle:** The submission deadline is not a factor in scope or quality (per Abu) — build the right product; prioritize by product/demo merit, not time.
**Shared thesis:** MAKE CRYPTO INVISIBLE. UX is the top-weighted axis everywhere (40% flagship / 30% Arbitrum).
**Max stack on the flagship path:** UA flagship $2,500 + Arbitrum $2,000 + Magic $500 = **$5,000** (Openfort/ZeroDev subtracks belong to the General Track and are mutually exclusive with the flagship — pick ONE main track).

> **This is a v2 refresh of the prior memo, not a replacement.** I did an independent web pass + applied Abu's win-formula lens (`Win = try-in-30s × obviously-needs-this-platform × real-product-not-demo`). Where I agree with v1 I say so; where I dispute or add, it's marked **[DISPUTE]** / **[ADD]**. Bottom line moved: v1 recommended *Tab (pay button), fused with an agent angle*. **v2 reframes the call as a near-tie between two clean archetypes and leans the other way — toward the chain-abstracted agent as the hero — for reasons below. The final pick is yours.**

---

## 0. What changed since v1 (web-verified corrections)

1. **[DISPUTE] "Particle shipped Universal Agent Accounts" — false.** Particle's own May 3 2026 post ("Chain-Abstract Everything: Announcing 2 Upcoming Products") lists **Universal Agent Accounts as roadmap** ("the next item in our roadmap," after V2), and the **Universal Deposit SDK as also upcoming** ("our next product release," unshipped). Neither is GA during the hackathon window. Two consequences:
   - The agent-on-UA build is **demoing Particle's announced-but-unbuilt future** → maximally on-thesis for judges *and* the single best incubation pitch ("we shipped your roadmap in 5 weeks"). v1 treated "Particle is building it themselves" as a *negative*; it's actually a **positive** while the product doesn't exist yet.
   - Tab's defensibility knock ("Particle's own Universal Deposit SDK already does embeddable chain-abstracted flows") softens — that SDK isn't out yet — **but** Universal Deposit is a *funding/deposit-into-the-app* widget, while Tab's hard part is *payout/settlement to a third-party merchant address*. Different mechanism; the knock that survives is genre-saturation, not "it's literally their SDK."
2. **[CORRECTED] The submission deadline is not a factor in scope or quality (per Abu).** Scope for a sharp single-flow demo on product/demo merit; multi-surface breadth (Abu's lens) is prioritized last on product merits, not cut by a clock.
3. **[AGREE] The verified 7702 hard constraint holds:** UA 7702 mode is signable only by embedded wallets (Magic/Privy/Dynamic) or **raw server keys** — never MetaMask/extension/JSON-RPC. This is why a browser-extension surface is dead on the flagship track and why a **server-held agent key is a first-class 7702 signer, not a hack.**
4. **[AGREE] V2 migration is live** ("beginning the rollout of Universal Accounts V2"). Re-verify account-version state at build time regardless of pick.

---

## 1. Landscape read (what's crowded, what's open)

The peer corpus (68k ETHGlobal/Devpost) + my web pass agree on the shape. Three saturated clusters cover nearly every "obvious" UA demo: **(A) chain-abstracted unified pay/checkout/split/tip/payroll** (every entry just swaps its bespoke bridge for a UA balance — judges clock "another crypto-Stripe / split-bill / tip-jar" instantly); **(B) AI-agent-with-onchain-wallet + x402** (post-Coinbase "Agents in Action," AWS Bedrock AgentCore Payments, Google AP2 — the hottest *and* most crowded space in the market); **(C) gasless embedded onboarding / Venmo-style send.** None of these exist *on UA-7702 yet*, so every candidate is "port-novel **on this ecosystem**" — but the user-facing concepts are heavily pattern-matched.

**The one genuine white space** (flagged by corpus, online research, *and* Particle's own roadmap): an **autonomous agent moving value out of a chain-abstracted UA balance, signed by a server-held 7702 key.** It (a) satisfies the flagship's mandatory cross-chain value-move, (b) sidesteps the extension-can't-sign-7702 constraint by design, (c) is the use case where chain abstraction is **load-bearing, not cosmetic** (an autonomous agent literally cannot sit clicking through bridge UIs and network switches), and (d) answers a question Particle's docs left open. Particle states the thesis themselves: *"most agents are still constrained by the same cross-chain fragmentation as users, leading to wasted credit usage, trapped balances, and limited execution flexibility."*

**The honest discomfort:** that same agent angle is *also* the most-saturated concept in the broader 2025–26 market (Coinbase Agentic Wallets, Stripe×Tempo, AWS AgentCore, x402 everywhere). So the white space is real **on this ecosystem** and crowded **as a market idea**. Differentiation must come from the **UA chain-abstraction + 7702 mechanics**, not the "AI agent that spends" framing — that framing alone is a red-flag repeat.

---

## 2. The decision in one frame (Abu's win-formula)

`Win = (judge tries it in 30s) × (obviously needs THIS platform) × (looks like a real product)`. It's multiplicative — one weak factor sinks it. Scored honestly, the field splits into exactly two archetypes, and **each is strong on the factor the other is weak on:**

| Archetype | Try-in-30s | Obviously needs UA | Real product | Product (×) |
|---|---|---|---|---|
| **A. Consumer pay-button / pot** (Tab, Jar, Applause, Sendline) | **0.9** — one self-serve tap, green check | **0.55** — "pay any token any chain" reads like a *bridge*; value not visibly lost on a generic rebuild unless you force the cross-chain source on-screen | **0.9** — Stripe/Venmo/Splitwise shape | **~0.45** |
| **B. Chain-abstracted agent** (Leash / "Conductor") | **0.5–0.7** — risk: a passive agent is a *watch*-demo, not a *do*-demo; fixable by making the judge initiate one action | **0.85** — autonomy across chains genuinely *collapses* without UA; matches Particle's roadmap verbatim | **0.6–0.7** — agent-allowance dashboards are a real, emerging product (AWS AgentCore) but crowded | **~0.42** |

**They're a near-tie (~0.45 vs ~0.42), inside the noise.** The peer's 5-factor geometric means say the same thing (Tab 0.698 vs Leash 0.665, gap narrowed by the v2 fact-correction). So **the score does not decide this — your priorities do.** The two tiebreakers that actually matter:
- **Tab is the safer bet to *place*** (best floor, best buildability, three clean non-cosmetic prize maps) but the **weaker bet to *win the flagship outright*** (least novel, weakest "needs-UA," most pattern-matched).
- **The agent is the stronger bet to *win the flagship + earn incubation*** (innovative UA use = the 30% axis; demos Particle's own unshipped roadmap; viral content that travels = Abu's edge) but carries a **watch-demo risk** and an honest **"the moat is the UA+agent combination, not a novel cryptographic primitive"** caveat.

---

## 3. Ranked table — all candidates

> Primary read = Abu's 3-factor win-formula product (multiplicative floor). GM = peer's 5-factor geometric mean, carried forward and adjusted for the v2 fact-correction. Verdicts: none clears a clean "commit" line — this is a choice of *which risk to accept*.

| # | Name | Type | Win-formula × | GM (v1→v2) | Verdict | One-liner |
|---|------|------|----|----|---------|-----------|
| 1 | **Tab** (PayButton) | fresh | **~0.45** | 0.698 → ~0.70 | safe-place | Drop-in Stripe-style `<PayButton>`; buyer logs in with email, UA silently sources liquidity from any chain, settles the merchant's exact token on Arbitrum — no chain pick, bridge, or gas. |
| 2 | **Conductor** (sharpened Leash) | fresh | **~0.45** | 0.665 → ~0.69 | swing-flagship | Give an AI assistant a capped budget and **one job**; you type the instruction, watch it execute a cross-chain buy/pay live via a server-key UA-7702 account, and a big red button kills it. Demo = a *single judge action*, not a passive ticker. |
| 3 | **Leash** (passive allowance + ticker) | fresh | ~0.24 | 0.665 | swing, worse demo | Same engine as Conductor but the demo is "fund it, watch the ticker" — the *watch-demo* trap. Keep the engine, drop this demo shape. |
| 4 | **Jar** (group pot) | refactor | ~0.37 | 0.637 | safe-place alt | Shared pot (trip/gift/pool); everyone chips in by email from any chain, jar shows one warm USD total, releases to organizer on Arbitrum on goal. Judge *is* a participant (good for try-in-30s). |
| 5 | **Applause** (cross-chain tipping + auto-tipper) | refactor | ~0.32 | 0.660 | crowded | Tip any creator in any token from one pooled balance; optional budget-capped auto-tipper. **Precedent risk:** "Tip This Creator" already won a Coinbase AgentKit prize. |
| 6 | **Roster** (payroll) | refactor | ~0.34 | 0.659 | safe, dry | Employer funds once from one Universal balance; each contractor paid automatically in their preferred stablecoin/chain. Strong "real product," but payroll is a watch-over-time, low-wow demo. |
| 7 | **Sendline / Concierge** (chat-send) | refactor | ~0.30 | 0.640 | crowded | "Venmo in your DMs" — Telegram send; money leaves your one balance, lands in whatever token/chain the recipient holds. |
| 8 | **Splitstream** (paylink fan-out) | refactor | ~0.31 | 0.656 | crowded | One email paylink; fans pay with an email, payment fans-in to a UA then auto-splits to collaborators on their own token/chain. |
| 9 | **Sprout** (yield-sweep agent) | refactor | ~0.19 | 0.593 | avoid | Set-and-forget agent sweeps spare stablecoins into best cross-chain yield. Watch-demo **and** the most-saturated DeFi-agent lane. |
| 10 | **Standby** (rule-based payer) | fresh | ~0.20 | 0.580 | avoid | Plain-language rule ("when invoice X arrives, pay it"); headless agent fires on trigger. Setup-heavy, low on-screen wow. |
| 11 | **Vendor** (agent-to-agent marketplace) | fresh | ~0.14 | 0.500 | avoid | Agents call each other's paid x402 endpoints from UA balances. Marketplace lane is heavily duplicated (A2A, Envoy, yellowX). |

*(Roster/Splitstream/Sendline/Jar are the same UA core as Tab with a different consumer skin; they rise/fall together on the same "needs-UA is only cosmetic" weakness.)*

---

## 4. Top 3 in detail

### #1 (safe-place) — Tab — drop-in crypto `<PayButton>` → `tab.md`
**Wedge: *invisible SOURCE.*** Drop in one button; the buyer's funds can live on ANY chain and still settle the merchant's exact token on Arbitrum. Screenshot-perfect: ETH-on-Base buyer, USDC-on-Arbitrum merchant, modal just says "Pay $5."
**Surfaces.** Web (merchant snippet + buyer modal) + thin server; **Magic email as the 7702 signer** (turns the extension-can't-sign constraint into the product). No native mobile, no extension-7702.
**Prize-stack math.** UA flagship $2,500 + Arbitrum $2,000 (settle primarily on Arbitrum) + Magic $500 (the literal 7702 signer) = **$5,000**. All three load-bearing, none cosmetic.
**Why it's the safe pick.** Best floor + best buildability in the set; bullseye on the 40% UX axis; the best adoption story ("npm-install a Stripe button for crypto") and the most content-friendly.
**The uncomfortable part.** It is the **least novel idea in the set** and its **needs-UA factor is its weakest** — to a non-technical judge "pay any token any chain" looks like any bridge unless you *force the cross-chain source visibly on one screen.* "Is it just a payment widget?" is the correct worry. Genre is saturated (ZiPay, Slipstream, SuiPort, in-market Stripe/Transak).
**Riskiest assumption.** That ONE UA-7702 op lands the EXACT merchant token at the EXACT merchant address on Arbitrum, sourced from a *different* chain, reliably enough to screen-record — and V2 migration doesn't break it. The subtle leg: `createBuyTransaction` buys INTO the UA; third-party payout needs `createTransferTransaction(receiver=merchant)` / `createUniversalTransaction`.
**≤2h RAT.** Clone `Particle-Network/ua-7702-magic-demo`; run ONE `createTransferTransaction({ token:{ chainId: ARBITRUM_MAINNET_ONE, address: USDC }, amount:"1", receiver:<merchant test addr> })` from a UA funded ONLY on Base; sign via Magic email-OTP; confirm on Arbiscan the **merchant** address received USDC. Lands → core proven, rest is UI. Verify V2 state in the same spike.

### #2 (swing-flagship, my lean) — Conductor — a single-job chain-abstracted agent → see `leash.md` (same engine, sharpened demo)
**It's like** ChatGPT/Perplexity "buy it for me," **but** it pays onchain across any chain from your one balance, gaslessly, with a kill switch — and a server key (not a human at a popup) is the 7702 signer, which is *exactly how an autonomous agent operates.*
**Wedge: chain abstraction is the thing that makes agent autonomy POSSIBLE, not just nicer.** This is the only candidate whose "obviously needs UA" passes the skill's collapse test hard: a single-chain agent fumbles the instant a payment lives on another chain; UA is load-bearing. Particle's roadmap says this in their own words — you'd be first to demo it.
**The fix that makes it competitive — kill the watch-demo.** v1's Leash demo ("fund it, watch the ticker, revoke") is a *watch*-demo and that's its one fatal weakness on the 30s-try axis. Reshape it so **the judge performs one action**: they type/click ONE concrete instruction ("buy this $3 API call" / "pay this invoice" / "tip this creator $1"), and watch the agent execute a cross-chain settlement live, then hit the red kill button. Judge *did* something + *saw* the cross-chain autonomy + *felt* the control. That converts B's 0.5 try into ~0.7.
**Narrow it to ONE job.** A vague "allowance agent that shops" pattern-matches to the saturated lane. Pick ONE legible job (my lean: **agent pays an x402-metered service from a UA balance** — answers the open wiki question "can an agent pay x402 out of a chain-abstracted UA balance?" and rides the x402 macro wave; or **agent auto-pays one recurring bill**). One job, done invisibly, beats a generic spender.
**Surfaces.** Web dashboard (Magic funds + revoke + live execution) + headless server-key UA-7702 agent loop; settle on Arbitrum. No mobile/extension.
**Prize-stack math.** UA flagship $2,500 + Arbitrum $2,000 ("AI apps with invisible onchain payments" is literally in Arbitrum's example list) + Magic $500 (human onboarding/funding/kill-switch UI) = **$5,000**. Correctly scoped; does NOT overclaim a General subtrack.
**The uncomfortable part (say it to judges first).** The "guardrails" are **economic + operational** (capped funding + kill switch + off-chain policy + a trivial contract), **NOT** a Particle cryptographic session key — Particle's session keys are documented only on Biconomy v2.0.0, which may not line up with UA 7702 mode. Pitch the leash as economic, not cryptographic; judges punish overclaiming.
**Riskiest assumption.** That flagship judges accept an **agent-held server key** as the "user's EOA" doing the required cross-chain op (wiki open question; the track text says "user's EOA"). If they demand the *human* wallet be the UA, the agent needs on-chain session-key delegation → collides with the Biconomy-v2.0.0 caveat.
**≤2h RAT.** Run `Particle-Network/universal-account-example/examples/7702-convert-evm.ts` headlessly with a raw throwaway server key: build + sign (`rootHash` + `authorizeSync`) ONE `createBuyTransaction` settling on Arbitrum from pooled assets, no browser. Green = the agent-as-7702-UA path is proven (the literal flagship requirement). **In parallel, ping the UXmaxx Discord/FAQ: do judges accept an agent-held key as the "user EOA"?** Both pass → this jumps to commit.

### #3 (safer alt to Tab) — Jar — group pot → see ranked table
**It's like** Splitwise / a group-gift pot, **but** everyone chips in from any chain and the pot shows one warm USD total, releasing to the organizer on Arbitrum at goal.
**Why it's here.** It may actually beat Tab on **try-in-30s**, because the judge *is a participant* (scan → "pay my $7 share" → watch the pot tick up) rather than role-playing a merchant integration. Same $5,000 stack, same UA core.
**Same weakness as Tab.** "Needs-UA" is cosmetic unless the cross-chain source is forced on-screen; genre is saturated. Pick Jar over Tab only if you decide the participatory pot demos warmer than the merchant button.
**Riskiest assumption / RAT.** Identical mechanism to Tab (pooled fan-in → single payout on Arbitrum); reuse Tab's RAT, adding a second funder wallet on a different chain to prove the fan-in.

---

## 5. RECOMMENDATION

**My lean: build #2 — the single-job chain-abstracted agent ("Conductor") — with the watch-demo killed (one judge-initiated action + live execution + kill switch), narrowed to ONE legible job (lean: agent pays an x402-metered service out of a UA balance).** Name **Tab** as the explicit safe-fallback if the ≤2h agent RAT or the Discord "agent-as-EOA" check comes back red.

Why I move off v1's "Tab, fused with an agent angle": **fusing both in a constrained hackathon window risks doing neither well.** Forced to choose, the agent is the better-aligned bet for *this* hackathon and *this* builder:
- **Judging:** the flagship's 30% "innovative UA use" axis and the incubation upside both reward the agent's load-bearing, novel-on-ecosystem UA use over a polished-but-commodity button. The agent is the only candidate that passes the "value collapses without UA" test *hard*.
- **The roadmap fact:** Universal Agent Accounts is **announced but unshipped** — a working demo of Particle's own stated future is the single strongest incubation pitch available this cycle. (Cuts the other way too: don't let it look like a thin preview — your job is the *invisible UX*, which Particle's API won't hand you.)
- **Abu's edge & lens:** "crypto invisible to AI agents too" is your stated thesis, and an autonomous agent moving money cross-chain behind a kill switch is far more viral content than a checkout button — your distribution advantage compounds on the agent.

**The discomfort you must sit with, stated plainly:** the agent path is *higher-variance.* Its moat is the UA+agent **combination and the invisible UX**, not a cryptographic primitive — be honest about that or judges will dock you. Its demo risk (watch-vs-do) is real and you only beat it by ruthlessly designing the demo around a *single judge action*. And "AI agent that spends" is the most pattern-matched concept in the market, so your one narrow job + visible chain-abstraction mechanics are what keep it from reading as a red-flag repeat. **If your honest answer is "I want to bank a placing + the bonus stack with the least risk," then Tab is the correct pick and you should take it without guilt** — it scores effectively tied and has the better floor.

**Confirm-first before committing to the agent path:**
1. **"Agent-held key as user EOA"** acceptance for the flagship (Discord/FAQ) — this single answer de-risks the agent path's interpretation half.
2. **UA V2 migration state** at build time (live withdraw-funds warning).

The submission deadline is not a factor in scope or quality (per Abu) — build the right product; prioritize by product/demo merit, not time.

**No track or idea is locked. The call is yours.**
