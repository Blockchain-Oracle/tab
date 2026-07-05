# Refactor Candidates — port OTHER-ecosystem winners into Particle UA + EIP-7702

> Strategy: ecosystem-refactor. Novelty is LOCAL — a Base/Solana/Celo/Polygon winner that
> has NOT been built on Particle Universal Accounts + 7702 is novel *here*. For each, we add
> a **target-native wedge** that was structurally impossible on the source chain:
> true one-balance cross-chain settlement via UA, gasless via Universal Gas, or
> agent-driven via a server-key 7702 signer.
>
> Hard constraints honored in every candidate (from wiki):
> - **UA SDK in EIP-7702 mode** (`smartAccountOptions.useEIP7702: true`) + **>=1 cross-chain value-moving op** via UA + functional demo. [particle-universal-accounts.md]
> - **7702 can only be signed by embedded/WaaS wallets (Magic/Privy/Dynamic) or raw server keys** — NEVER extension/JSON-RPC wallets. So the signer is always Magic-embedded (human flows) or a server key (agent flows). [surface-feasibility.md]
> - Stack the **Arbitrum $2,000** (settle primarily on Arbitrum, `CHAIN_ID.ARBITRUM_MAINNET_ONE` is first-class) + **Magic $500** (embedded onboarding) bonuses on top of the flagship UA Track.
> - The **AI-agent angle = server key signing `rootHash` + `authorizeSync` 7702 authorizations** — wiki calls this the exact shape of an autonomous agent operating a wallet.
>
> Corpus sources: `~/.claude/skills/sahil-ecosystem-refactor/scripts/query.py` (68k Devpost+ETHGlobal).
> Web grounding: ChatterPay (ETHGlobal Bangkok 2024, Polygon/Scroll, ERC-4337); x402/AP2 agent
> commerce live on Base+Solana USDC in 2026; Particle UA consumer dApp ecosystem still nascent
> (UniversalX + "first 10 dApps") → most consumer verticals are wide open on UA.

---

## 1. Sendline — chat-native payment agent (text a message, money moves cross-chain)

- **Source project:** ChatterPay (ETHGlobal Bangkok 2024, won 2 prizes) — "Now WhatsApp is all you need to pay with crypto." Built on **Polygon / Scroll** with classic **ERC-4337** account abstraction (separate smart-account address you must fund). Active team (Product Hunt, X, live site).
- **One-liner:** Text "send $20 to Sam" in Telegram/WhatsApp and the money leaves your single Universal balance and lands in whatever token+chain Sam already holds — no app, no chain, no gas token.
- **Wedge added (impossible on source chain):** ChatterPay was single-chain Polygon with a *separate* ERC-4337 smart account the user had to pre-fund. On UA + 7702 the user's **Magic-embedded EOA itself becomes the account** (no new address, no funding step), and the recipient is paid from a **unified cross-chain balance** — the transfer *is* the required cross-chain value move (`createTransferTransaction` routes liquidity from any chain). The bot's **server key signs the 7702 authorization + rootHash on the user's behalf within scoped caps** = the autonomous-agent pattern the wiki blesses. **Universal Gas** means the user never holds a gas token in any chat.
- **whyGoodUX:** The entire crypto stack disappears into a chat thread a billion people already use. Screen-recording a WhatsApp/Telegram conversation that moves *real value cross-chain* with zero wallet UI is a 30-second "make crypto invisible" demo — exactly the 40%-UX + Arbitrum "feels like a normal consumer app" rubric.
- **Surfaces:** chat bot (Telegram first — no Business-API approval delay; WhatsApp as stretch) + web onboarding (Magic email/social) + server (the agent loop).
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500.
- **toolsUsed:** Particle UA SDK (7702) · Magic embedded wallet · Telegram Bot API · server-key agent signer · Arbitrum settlement.
- **Risks:** (a) **Custody/interpretation risk** — a server key signing on the user's behalf blurs "the *user's* EOA"; frame as scoped delegation + per-message confirmation to stay safe. (b) **Team recompete** — ChatterPay is a live product; if they enter they out-polish us, but they are not on Particle/UA, so our wedge stands. (c) Chat-payment is a crowded category — lean hard on the one-balance + gasless differentiators. (d) WhatsApp onboarding latency → default to Telegram for the demo.

---

## 2. Applause — one-balance creator tipping + an autonomous auto-tip agent

- **Source project:** ClapCoin (ETHGlobal New Delhi, crypto creator tipping) + CRUND (ETHOnline 2025, "tip creators instantly with PYUSD") + **Tip This Creator** (Agentic Ethereum, *won prize* — "AI agent that tips your favorite creators on X with crypto"). All single-chain / single-token (PYUSD on one chain, etc.).
- **One-liner:** Tip any creator in any token from your one balance — they receive it as a single unified balance on whatever chain they cash out to — plus an optional AI agent that auto-tips creators you watch based on engagement.
- **Wedge added:** Source tippers forced fan *and* creator onto the same chain/token. With UA, the fan tips from a **pooled cross-chain balance** and the creator's UA **receives it pooled** — the tip itself is the cross-chain value move (`createTransferTransaction`/`createBuyTransaction`), and neither side ever bridges or holds gas. The **auto-tip agent runs on a server key (7702)** — a budget-capped autonomous tipper is the agent pattern, now spending from a chain-abstracted balance instead of a single-chain float.
- **whyGoodUX:** "Tip" feels like a Like — one tap, no chain picker, no gas, creator paid instantly. The agent variant ("set $10/week, it rewards the best clips you watch") is a vivid, shareable autonomy demo. Plays directly to Abu's creator-distribution edge.
- **Surfaces:** web (tip button + creator dashboard) + mobile + auto-tip agent (server). *Optional* X/YouTube overlay — but signing stays in the Magic-embedded iframe, never an extension wallet (see risk).
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500.
- **toolsUsed:** Particle UA SDK (7702) · Magic embedded wallet · server-key agent (auto-tip) · Arbitrum settlement.
- **Risks:** (a) A **browser-extension overlay cannot sign 7702** — keep any overlay as pure UI that hands off to the Magic-embedded signer, or judges/our own demo will hit the JSON-RPC-wallet wall. (b) Tipping is well-trodden — the auto-tip *agent* is the freshness; don't ship a plain tip jar. (c) Tip This Creator's team could re-enter (not on UA). (d) Needs creators with payouts in the demo — script two Magic wallets.

---

## 3. Sprout — autonomous round-up / DCA savings agent into best cross-chain yield

- **Source project:** wealthwise (Devpost *winner*, "automatically invests spare money") + SpareCent (Devpost *winner*, "Acorns for disaster relief") + RoboSaver / AutoSafe (ETHGlobal, *won prizes* — round-up savings on **Gnosis Pay / Gnosis chain only**).
- **One-liner:** A set-and-forget agent that sweeps spare stablecoins from your unified balance and parks them in the best yield on any chain — round-ups and DCA, fully automatic, gasless, no bridging.
- **Wedge added:** RoboSaver was locked to the Gnosis Pay card on one chain; wealthwise/SpareCent were web2 (no chain at all). On UA + 7702 a **server-key agent** sweeps from a **cross-chain unified balance** and deploys to the best venue on *any* chain (e.g., Aave on **Arbitrum**) — the auto-invest is the required cross-chain value move (`createUniversalTransaction` with `expectTokens`), with **Universal Gas** hiding gas entirely. The autonomous loop is literally the server-key-signs-7702 agent pattern.
- **whyGoodUX:** "Saving" that needs zero thought — the user sees one growing number, never a chain, a bridge, or a gas prompt. A timelapse of the balance auto-compounding across chains is a clean, honest UX story and hits Arbitrum's "normal consumer product, just onchain" tell.
- **Surfaces:** web dashboard + mobile + CLI/server agent (the sweeping loop).
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500.
- **toolsUsed:** Particle UA SDK (7702) · Magic embedded wallet · server-key agent · an Arbitrum yield venue (Aave) · Universal Gas.
- **Risks:** (a) **Cross-chain yield routing is the hard part** — cap to 1–2 protocols on Arbitrum so it ships in the window. (b) "Spare change" needs a spend signal — simulate with a mock card feed or scheduled DCA for the demo. (c) Agent-as-owner custody interpretation (same as #1). (d) Yield ≠ flashy; carry the demo on the *invisible-cross-chain* magic, not APY.

---

## 4. Allowance — budgeted AI agent that shops & pays from one chain-abstracted balance

- **Source project:** SpendMate (ETHGlobal Buenos Aires — "AI agents that spend safely with rules and limits") + Personal Shopper Agent (Devpost AI Agents Hackathon *winner*) + Jarvis (ETHGlobal BA, *won EVVM prize* — x402 "pay or buy any service"). 2026 x402/AP2 agent commerce is overwhelmingly **single-chain Base/Solana USDC**.
- **One-liner:** Give an AI agent a monthly budget; it buys services, APIs and goods on your behalf — every payment sourced from your one cross-chain balance with hard spend caps, never pre-funding a chain.
- **Wedge added:** Every x402/AP2 agent today must hold USDC on the *exact* settlement chain (Base or Solana). On UA + 7702 the agent pays out of a **unified cross-chain balance** — it just-in-time `createBuy`/`createConvert`s into the settlement token on whatever chain the invoice demands (that conversion *is* the cross-chain value move), so it **never has to pre-position funds or manage gas**. The **server key is the agent's 7702 signer**; spend caps + allowlists are the safety leash.
- **whyGoodUX:** "Here's $100 for the month, go" → watch the agent buy three things and the single balance tick down, with no chain switching, no gas, no approvals. The most legible demo of agent autonomy + chain abstraction in one shot; also a clean General-Track/ZeroDev session-key story if we want a fallback track.
- **Surfaces:** CLI/agent (the autonomous loop) + web budget dashboard + chat trigger.
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500. (Fallback: General Track + ZeroDev $500 via session-key spend policies.)
- **toolsUsed:** Particle UA SDK (7702) · server-key agent signer · x402 client · Magic embedded (owner onboarding) · Arbitrum settlement · (optional) ZeroDev session keys.
- **Risks:** (a) **Most crowded 2026 theme** — judges have seen many agent-commerce demos; differentiate *only* on the one-balance/no-prefund wedge + UX polish. (b) Wiki flags **"agent pays x402 out of a chain-abstracted UA balance" as undocumented** — de-risk by doing the UA convert→settlement-token step explicitly (still a valid cross-chain UA op). (c) SpendMate/Jarvis teams could re-enter (not on UA). (d) Real merchant rails are hard in a weekend — demo against x402 test endpoints / a mock storefront.

---

## 5. Tab — cross-chain split-the-bill where everyone pays from their own balance

- **Source project:** BaseSplit (ETHGlobal Buenos Aires — "snap your receipt, split, settle in crypto", **Base only**) + SplitMonies / CeloSplit (ETHGlobal, *won prizes* — split via **Celo MiniPay only**) + TunnyBunny (ETHGlobal Cannes 2026 — "split bills across any chain any token").
- **One-liner:** Snap a receipt, split it with friends, and each person pays from whatever chain+token they already hold while you receive one pooled balance — Splitwise that actually settles, invisibly.
- **Wedge added:** BaseSplit forced everyone onto Base; CeloSplit onto Celo MiniPay — same-chain or bust. With UA, **each participant pays from their own unified balance on any chain** and the organizer's UA **receives it pooled** — settlement is inherently the cross-chain value move, no one bridges, no one buys a gas token. **Magic email onboarding** lets a friend with *no wallet* join the split from a link in seconds.
- **whyGoodUX:** The viral social loop (a friend taps a link, pays their share from an email login, done) is the most shareable, screenshot-able flow in the set — tailor-made for Abu's distribution edge — and "no app, no chain, no gas, just pay your share" nails the consumer-product tell.
- **Surfaces:** mobile-first PWA + web. (No extension — keep all signing in Magic-embedded.)
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500.
- **toolsUsed:** Particle UA SDK (7702) · Magic embedded wallet (email onboarding is the hero) · receipt OCR (optional) · Arbitrum settlement.
- **Risks:** (a) **Closest prior art is TunnyBunny** (already "any chain any token" at Cannes 2026) — but *not* on Particle UA, *not* 7702, and (so far) no prize; our wedge is UA + embedded-email onboarding. (b) Needs multiple users live — orchestrate 2–3 Magic wallets in the demo. (c) Split apps are plentiful — the email-onboarding + true-one-balance combo must carry it.

---

## 6. Roster — fund-once global payroll that fans out to any chain/token per contractor

- **Source project:** PayRolled (HackMoney 2026, *won prize* — "pay employees on any chain in one click" via **Circle Arc / CCTP, USDC-only**) + Crypto Wages (ETHIndia) + zkPayroll (ETHIndia 2022, *won prize*).
- **One-liner:** An employer funds once from a single Universal balance; each contractor is paid automatically in *their* preferred stablecoin on *their* preferred chain — no per-chain treasury, no bridging, no gas ops.
- **Wedge added:** PayRolled was rail-locked to Circle Arc + CCTP (USDC only, Circle-supported chains). UA pays out in **any token on any chain from one pooled balance** via N `createTransferTransaction`s — a vivid one-funding → many-chains fan-out that *is* the cross-chain value requirement, several times over. A **scheduled server-key agent** runs payroll cycles autonomously (7702 agent pattern); **Universal Gas** removes per-chain gas entirely.
- **whyGoodUX:** One "Run payroll" button → a dashboard lights up as ten people on ten chains get paid in the token they want, no treasury juggling. A satisfying, high-trust B2B demo that still feels like a clean consumer SaaS, and the strongest "adoption potential" (20%) narrative in the set.
- **Surfaces:** web dashboard + CLI/server (scheduled payroll agent).
- **tracksHit:** Universal Accounts Track · Arbitrum $2,000 · Magic $500. (Fallback: General + ZeroDev session keys for the recurring payout policy.)
- **toolsUsed:** Particle UA SDK (7702) · server-key/scheduled agent · Magic embedded (employer login) · Arbitrum settlement · Universal Gas.
- **Risks:** (a) Less flashy than the consumer ideas — wins on adoption/technical, weaker on raw UX wow. (b) Multi-recipient fan-out across many chains may hit liquidity/routing limits — cap recipients/chains for the demo. (c) PayRolled team could re-enter on Arc (different rail; our UA wedge is distinct). (d) B2B payroll needs more trust scaffolding (audit log, approvals) than a weekend allows — scope tightly.

---

## Cross-cutting notes
- **Strongest UX-demo + distribution fit:** #5 Tab and #1 Sendline (both are 30-second, shareable, consumer-grade clips).
- **Strongest "innovative UA+7702 use" (30%):** #4 Allowance and #3 Sprout (autonomous server-key agent spending a chain-abstracted balance — the wiki's exact agent-fit thesis).
- **Recurring de-risk:** the "agent owns the user's EOA" custody/interpretation question (wiki Open question) recurs in #1/#3/#4/#6 — mitigate with scoped delegation + visible caps, or frame the agent as acting *for* a Magic-embedded human owner.
- **Buildable priority (product/demo merit):** all are TS/React/Solidity-light; the long poles are cross-chain yield routing (#3) and multi-chain fan-out liquidity (#6) — both scope-capped above. Prioritize the single happy-path cross-chain op first; additional surfaces are included when they strengthen the demo, not driven by a time window.
