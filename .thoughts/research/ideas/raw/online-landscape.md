# Online landscape — shipped products + recent hackathon winners (2025–2026)

> Research date: 2026-06-30. For the Particle Network chain-abstraction hackathon.
> Sources: WebSearch (2025–2026) + local winner corpus (68,294 projects: ETHGlobal + Devpost).
> Grounded against domain wiki (`../../wiki/`): Particle UA 7702, agent-wallets, surface-feasibility.
> Goal: map what's already out there, find integrate-and-rebuild targets, flag crowded vs open.

---

## 0. The single most important new fact

**Particle shipped "Universal Agent Accounts" (announced May 3, 2026).** An API + dashboard
that lets **AI agents own, fund, and manage their own Universal Accounts** — chain abstraction
for autonomous programs. LLM-friendly API; agents "define a desired outcome" and UA picks the
optimal cross-chain path (gas, liquidity routing, bridging, settlement). This **resolves the
wiki's open question** (agent-wallets.md flagged "Universal Agent Accounts" as possibly
marketing/roadmap — it is now a real, announced product). EIP-7702 support for UA was
integrated **Mar 24, 2026**.
→ Strategic read: an **AI-agent-with-a-Universal-Account** build is no longer a stretch
interpretation — it's *on Particle's own roadmap*, so judges will read it as on-thesis, not
off-label. The hard constraint (7702 can only be signed by embedded wallets or **server keys**)
maps perfectly: a server-held agent key signing the 7702 authorization = exactly how an
autonomous agent operates.
Sources: blog.particle.network/2025-review, weex.com/news (UA roadmap), Particle docs.

---

## 1. EIP-7702 consumer apps in the wild (2025–2026)

EIP-7702 went live (Pectra, May 2025) and is now active on Arbitrum (ArbOS 40 "Callisto").
The *dominant* production use is **gas-sponsored onboarding** (new user with no ETH, app
paymaster pays first tx, user signs one authorization) and **session keys for games**
(no popups per action). Embedded wallets are the fastest adopters; MetaMask/Rabby/Coinbase
Wallet shipped 7702 behind flags by mid-2025.

Named shipped/winning 7702 apps found:
- **BeamPay** (ETHGlobal, 2025) — payment infra using EIP-7702 to *wrap ERC-20 transfers with
  extra data*; ships a browser plugin + smart contracts so users don't build their own infra.
- **PrivyCycle** (ETHGlobal 2025) — AI-powered period tracker with encrypted logs; cited as a
  real-world app that **abstracts the blockchain away entirely** and onboarded thousands.
- **ShowUp** (ETHGlobal 2025) — Telegram bot for event-attendance staking; "abstract the
  blockchain away" consumer pattern.
- Infra-side (not consumer apps but relevant): **Circle** gasless USDC via 7702; **Fireblocks**
  universal gasless EVM; **Biconomy/Openfort/ZeroDev** all ship 7702 paths.

Read: **Consumer-facing 7702 apps are still thin.** Most 7702 in production is *plumbing*
(gasless onboarding, session keys) rather than a headline consumer product. That's an opening —
a polished consumer app where 7702 is the *visible magic* is underexplored.

Sources: openfort.io/blog/eip-7702, circle.com/blog, biconomy.io/blog, zircuit.com (Cannes
winners), fern blog (NY 2025 winners).

---

## 2. Particle Universal Accounts projects/demos in the wild

- **Overtime** — first live external UA integration; a **chain-agnostic onchain sportsbook**
  (bet from one balance regardless of chain). The flagship "real consumer app on UA" reference.
- **UniversalX** (Particle's own) — chain-agnostic trading platform / CEX alternative; V2/V3
  shipped 2025 (real-time token discovery, portfolio tracking, MEV protection). This is the
  reference UX bar Particle itself holds up.
- **90+ projects** reported "on their way to integrating UA"; first 10 dApps announced.
- **Universal SDK** launched Jul 23, 2025; chain integrations through 2025–2026 added Mantle,
  Plasma, Monad.
- Official 7702 demos (from wiki / GitHub): Privy, Dynamic, Magic embedded-wallet demos +
  server-side `7702-convert-evm.ts`.

Read: outside Particle's own products + Overtime, **there are very few third-party UA consumer
apps with strong UX shipped publicly.** The category is *new and uncrowded* — first-mover
advantage on a polished UA-7702 consumer app is real. Most "chain abstraction winners" in the
corpus used *other* stacks (LI.FI, Connext, Avail Nexus, Hyperlane, 1inch Fusion+), not UA →
fertile rebuild ground (port a winning chain-abstraction UX onto UA-7702).

Sources: blog.particle.network/2025-review, developers.particle.network, github.com/particle-network.

---

## 3. AI-agents-with-wallets (the hottest, most crowded space)

Coinbase **"Agents in Action" hackathon** (May–Jul 2025, AgentKit + x402 + CDP Wallet) defined
this category. Winners:
- **Paystabl** — payroll agent: recurring, programmable stablecoin salary disbursements (CDP Wallet).
- **AgentVault** — autonomous trading vault: monitors markets, trades, manages assets.
- **Monetization Templates** — library of agent-powered service-monetization templates.
- **FastAPI x402** — Python pkg + HF space for automated x402 payouts.

Corpus agent-wallet projects (ETHGlobal):
- **Jarvis** (Buenos Aires, WON 2x) — x402 to pay/buy *any* service; "request an uber from
  ChatGPT or any agent." Agent-commerce front-end.
- **SpendMate** (Buenos Aires) — **zero-code platform to create AI agents that spend safely with
  rules and limits.** Directly the session-key/guardrail consumer angle.
- **Orbit** (HackMoney 2026) — autonomous AI agent managing a treasury of RWAs.
- **SentinelDao** (HackMoney 2026, WON ENS) — policy-driven agent manages DAO treasury payouts
  autonomously onchain.
- **La Wallet** (Agentic Ethereum, WON) — voice/AI wallet, "just talk, let the AI handle it."
- **Adapt.ai / Lero / AgentSwap / CryptoSentinel** (Agentic Ethereum, AgentKit-pool winners) —
  AI agents executing DeFi strategies / yield / trading.
- **Maru / Project0 / poink chat** — "AI does any onchain task by prompt" companions.
- **Agent Pay** (Cannes 2026, WON Ledger) — decentralized API database for agents, payable in crypto.

Shipped infra/products (2026) — agent payments going mainstream:
- **World AgentKit** (Mar 2026) — x402 + **World ID** so human-verified agents pay autonomously.
- **AWS Bedrock AgentCore Payments** (Preview) — managed x402 with built-in wallet, **policy-based
  spend controls**, audit trail.
- **Cloudflare pay-per-crawl** (x402); **Nous Research** per-inference billing (x402).
- **Stripe + Tempo "Machine Payments Protocol"** (Mar 18, 2026); **Visa** agent-transaction rails;
  **OpenAI shopping inside ChatGPT** (early 2026).
- x402 scale: **119M+ tx on Base, 35M on Solana, ~$600M annualized** (Mar 2026), zero protocol fee.

Read: **Generic "AI trading/yield agent" and "x402 pay-per-API/inference marketplace" are
SATURATED** (a dozen near-identical corpus + hackathon entries). The *differentiated* slice is
**agents that spend out of a CHAIN-ABSTRACTED balance with hard guardrails for real-world
obligations** — almost nobody combines x402/agent-spend with chain abstraction (UA). Particle's
own Universal Agent Accounts product is the wedge enabler.

Sources: coinbase.com/.../agents-in-action-winners, aws.amazon.com/blogs/industries (x402),
coinbase.com/.../google_x402, openfort.io/blog/best-agent-wallets, agentwallet.md.

---

## 4. Chain-abstraction consumer apps (payments / checkout)

Strong, repeatedly-winning pattern: "pay any token, any chain, gasless, invisible."
- **ChainPe** (ETHIndia, WON 7x incl. LI.FI) — pay any **UPI ID** with your crypto balance ("buy
  a chai with crypto"). The canonical consumer chain-abstraction winner.
- **Payzzy** (ETHIndia, WON 3x) — hassle-free cross-chain pay-easy.
- **Monkey Bridge** (ETHOnline 2025, WON) — "Pay with crypto on any site. PYUSD → escrow →
  virtual card."
- **ZiPay** (New Delhi) — "Shopify for Web3: pay any token, any chain, gasless."
- **SAMM** (ETHOnline 2025) — hyper-concentrated AMM for **chain-abstracted stablecoin merchant
  payments**.
- **USDCentral** (HackMoney 2026) — chain-abstracted USDC wallet, one-click DeFi earn.
- **Fill Me Up** (Singapore, WON 4x) / **gastly** (WON 3x) / **GasStation** (WON 2x) — gas
  abstraction: approve on one chain, all chains auto-refill / pay gas in any token any chain.
- **METAINTENTS** (Bangkok, WON 2x) — smart-wallet module for default cross-chain txs.
- **Fluvia** (NY 2025, WON 2x Circle) — treasury infra; **UniFlow** (HackMoney 2026) — programmable
  payroll/treasury on Circle Arc; **Treasury Guard Wallet** (Paris, WON) — treasury mgmt wallet.

Read: consumer **"pay any token/any chain at checkout"** is well-trodden but UA-7702 makes it
*trivially better and invisible* (one balance, no bridge, gas in any token) — a rebuild-with-UA
of a proven pattern is low-risk for the UA track's cross-chain-value-move requirement. Gas
abstraction specifically is **near-solved by UA's Universal Gas natively**, so rebuilding *just*
gas abstraction adds little — wrap it in a real consumer use case instead.

Sources: corpus (ETHGlobal/Devpost), ethglobal.com/events/*/prizes, weex.com (BA top-10).

---

## 5. Subscriptions / recurring / payroll (the standout open wedge)

- **Payflow** (Buenos Aires) — **"x402 agent that manages onchain subscriptions with autopay,
  autocancel, and cross-chain balance."** This is the *single closest prior* to the on-thesis
  sweet spot (agent + subscriptions + x402 + chain abstraction) — and it did **not** win, i.e.
  the space is unproven/open.
- **onchain-subscription** (HackMoney 2026) — subscriptions that renew only with cryptographic
  user consent (consent/guardrail framing).
- **Paystabl** (Coinbase winner) — recurring stablecoin payroll agent.
- **Smart Contract Wallet / SubNFT / Subscription** (older) — basic web3 subscription primitives.

Read: **Autonomous recurring-payment agents with chain-abstracted funding + revocable
guardrails = under-built and directly on the hackathon's "invisible crypto + AI agent" thesis.**
The wedge: a consumer gives an agent a *revocable allowance on their own EOA* (7702 + session
key), and the agent pays subscriptions/payroll/bills out of one cross-chain balance, on Arbitrum,
with hard spend caps — stacks UA track + Arbitrum + Magic.

---

## 6. Crowded vs Open (synthesis)

**CROWDED (differentiate hard or avoid):**
- Generic AI trading/yield/DeFi-strategy agents (10+ near-clones).
- x402 pay-per-API / per-inference marketplaces (post-Agents-in-Action saturation).
- "Talk to your wallet" conversational AI companions.
- Pure gas abstraction ("pay gas any token any chain") — also natively solved by UA.
- Pay-any-token-at-checkout / crypto card (many winners, but UA upgrades it cheaply).

**OPEN / UNDEREXPLORED (good wedges):**
- **Agent that pays real-world recurring obligations** (subscriptions, payroll, bills) out of a
  **chain-abstracted balance** with **revocable hard guardrails** — Payflow is the lone weak prior.
- **Chain-abstracted agent spend** generally (x402/agent-commerce funded by a UA unified balance,
  not pre-funded on one chain) — almost nobody combines the two; Particle's Universal Agent
  Accounts just made it buildable.
- **Polished consumer app where 7702 is the *visible* magic** (not just invisible plumbing).
- **Third-party UA-7702 consumer apps with real UX** — category barely populated outside Overtime.
- **Blockchain-invisible *non-DeFi* real-world apps** (health/PrivyCycle, events/ShowUp, sports/
  Overtime) — far less crowded than the DeFi-agent pile.
- **Multi-surface "human gives intent, server-agent does the crypto"** — fits the verified hard
  constraint (server key signs 7702) and Abu's "crypto invisible to agents too" lens.

---

## 7. Integrate-and-rebuild shortlist (strong products that DON'T use sponsor tools but COULD)

| Prior product | What it does | Could rebuild on |
|---|---|---|
| **Payflow** (x402 subscription agent) | autopay/autocancel onchain subs, cross-chain balance | UA-7702 unified balance + session-key guardrails + Arbitrum settle |
| **Paystabl** (Coinbase, CDP Wallet) | recurring stablecoin payroll agent | UA-7702 (pay team from one cross-chain balance) or ZeroDev session keys |
| **SpendMate** (agent spend rules/limits) | zero-code safe-spending AI agents | ZeroDev/Openfort session keys + UA balance; consumer-facing guardrail UX |
| **Monkey Bridge / ZiPay / SAMM** (pay any token any chain) | chain-abstracted checkout | UA-7702 cross-chain value move = the required op, on Arbitrum |
| **ChainPe** (crypto → UPI/real-world pay) | spend crypto balance at real merchants | UA unified balance + Magic onboarding (invisible) |
| **AgentVault / Orbit / SentinelDao** (autonomous treasury) | agent manages a treasury onchain | Particle Universal Agent Accounts + UA-7702 + Arbitrum |
| **World AgentKit / AWS AgentCore** (x402 agent pay, single-chain) | agents pay autonomously | settle out of UA chain-abstracted balance instead of pre-funded chain |
| **La Wallet** (voice/AI wallet) | talk to move crypto | thin client over a UA-7702 agent backend (CLI/voice surface) |

---

## 8. Caveats / verify-at-build

- Particle "Universal Agent Accounts" is announced (May 2026) — **verify API availability +
  whether it composes with the *embedded-wallet* 7702 UA track requirement** (the track text says
  "user's EOA"; an agent-owned UA may be judged differently — see agent-wallets.md open questions).
- x402 + UA-chain-abstracted-balance settlement is **undocumented end-to-end** — prototype early.
- Hackathon **deadline unknown** — all wedges above are buildable in a typical hack window IF you
  use the official Particle 7702 demo (Privy/Magic/Dynamic) as scaffold; the agent/subscription
  logic is the only net-new code. Flag: a multi-surface (web+extension+mobile+CLI) build is NOT
  hack-window-realistic; pick web + one agent/CLI surface. Extension surface CONFLICTS with the
  flagship 7702 track (MetaMask can't sign Type-4 auths) per surface-feasibility.md.
