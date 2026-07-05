# Corpus Landscape — Prior Art + Refactor Seeds (UXmaxx / Particle 7702 Collective)

> Source: local winner corpus (68,294 projects — ETHGlobal showcase + Devpost) via
> `~/.claude/skills/sahil-ecosystem-refactor/scripts/query.py`, plus 2 grounding web searches.
> Grounded against domain wiki: `index.md`, `strategy/surface-feasibility.md`, `concepts/agent-wallets.md`.
> Date: 2026-06-30.

## Context locks (affect every portability note)

- **Hackathon = "UXmaxx" by the 7702 Collective** (Particle + Arbitrum + Magic + ZeroDev + Openfort).
  $15.5K prize pool, 100% online. The submission deadline is not a factor in scope or quality (per Abu)
  — build the right product; prioritize by product/demo merit, not time.
  → **Scope call: target a sharp single-flow demo on product/demo merit;**
  don't over-index on multi-surface breadth at the cost of the one mandatory cross-chain value-moving op.
- **Hard constraint (wiki-verified):** UA 7702 mode can ONLY be signed by embedded/WaaS wallets
  (Dynamic, Magic, Privy) or raw server keys — NOT MetaMask/extension/JSON-RPC. So any seed below that
  centers on a *browser-extension wallet surface* must be re-homed onto an embedded/Magic signer or a
  server key (the agent case). This is WHY the AI-agent angle is the cleanest fit: a server-held key
  signing 7702 authorizations == exactly how an autonomous agent operates (wiki: agent-wallets.md).
- **What "porting to Particle UA + 7702" almost always means here:** (1) replace the project's bespoke
  bridging/router layer (Li.Fi, Hyperlane, CCIP, Klaster, Circle CCTP/Arc, LayerZero) with the UA's
  single chain-abstracted balance; (2) swap MetaMask/injected onboarding for Magic/Privy/Dynamic embedded
  (also lands the Magic $500 bonus); (3) collapse approve+swap+send into ONE 7702-batched UserOp;
  (4) deploy primarily on Arbitrum for the $2,000 bonus; (5) if agentic, move the signer to a server key.
- **Macro signal (web):** x402 is the breakout agent-payments rail — 119M+ tx on Base, 35M on Solana,
  ~$600M annualized by Mar 2026; AWS Bedrock AgentCore Payments shipped x402 (May 2026); Google AP2 + x402.
  EIP-7702 framed as the complementary wallet-UX upgrade. Particle is "all-in on 7702" (blog). The judges'
  north star is literally "make crypto invisible" → invisible *agent* payments is the most on-thesis demo.

---

## A. Chain abstraction / unified cross-chain balance (the UA core)

- **Payzzy** (ethglobal, ETHIndia 2022) — "hassle-free cross-chain pay-easy." **Prize: Li.Fi Best use of
  LI.FI SDK + ENS Integration + Li.Fi pool.** Chain/eco: EVM multichain via Li.Fi. *Portability:* textbook
  UA refactor — UA's single balance replaces Li.Fi bridging entirely; keep ENS for human-readable recipients.
- **ChainPe** (ethglobal, ETHIndia 2022) — non-custodial wallet that pays any **UPI ID** from a crypto
  balance ("buy a chai via crypto"). **Prize: ETHIndia Finalist + Li.Fi Best use + Push + Covalent + more.**
  Chain/eco: EVM + UPI off-ramp. *Portability:* very strong consumer wedge — UA cross-chain balance →
  fiat/UPI settlement; 7702 makes the on-chain leg a single gasless tx. Localizable to any real-world rail.
- **USDCentral** (ethglobal, HackMoney 2026) — "chain-abstracted USDC wallet, one-click earn into high-yield
  DeFi." Chain/eco: multichain USDC. *Portability:* near-identical to UA thesis; rebuild the abstraction
  layer on UA, 7702-batch deposit→stake, deploy on Arbitrum.
- **Slipstream** (ethglobal, HackMoney 2026) — "Pay USDC from any network, settle anywhere via Arc + Circle;
  paylinks, QR, receipts, timeline." Chain/eco: Circle Arc/CCTP. *Portability:* swap Arc+Circle settlement
  for UA; the paylink/QR/receipt consumer UX is the keeper and is exactly the "invisible" surface judges want.
- **arc-router** (ethglobal, HackMoney 2026) — "cross-chain USDC transfers settled in 10s using Circle Arc
  as a liquidity hub." Chain/eco: Circle Arc. *Portability:* infra→consumer reframe; UA replaces the router,
  wrap a one-tap send UX on top.
- **HyperPay** (ethglobal, ETHGlobal NY 2025) — "PyUSD anywhere via composable cross-chain intent engine."
  **Prize: Hyperlane Best Use + Best Infrastructure.** *Portability:* UA's intent settlement replaces
  Hyperlane plumbing; keep the "stablecoin anywhere" promise.
- **OSY** (ethglobal, ETHGlobal Taipei) — "auto-allocates USDC to highest APY across DeFi, cross-chain &
  effortless." **Prize: Circle Multichain USDC + Hyperlane Best Use.** *Portability:* UA balance + an agentic
  rebalancer signing via 7702 server key = chain-abstraction + agent autonomy in one.
- **Multichain Disperse** (Chain Abstraction Hackathon **winner**, web-sourced) — instant multi-chain token
  transfers in one tx; **already uses Particle Connect + Klaster SDK**, pays gas on any chain. *Portability:*
  Particle-adjacent prior art; the obvious upgrade is Connect→UA + Klaster→UA-native 7702 batching.

## B. EIP-7702 / smart-account consumer apps (the headline trick)

- **Absynth** (ethglobal, ETHGlobal Taipei) — "smart account powered by passkeys, cross-chain
  interoperability." **Prize: Circle — Build a Smart Wallet with Dynamic Security Controls.** *Portability:*
  passkey signer + 7702-upgraded EOA + UA cross-chain; passkey is a clean Magic/embedded story.
- **UpiCrypto** (ethglobal, Scaling Ethereum 2023) — "unified payment interface for crypto using AA +
  sponsored transactions." *Portability:* UA + 7702 gasless "UPI for crypto"; the sponsored-tx UX is the
  invisible-fees axis judges weight.
- **LimpehFI** (ethglobal, ETHGlobal Bangkok) — "pre-authorize dapps, trade seamlessly even without USDC
  (Uniswap trade, prediction-market buys)." *Portability:* this IS the 7702 batched-approval pattern; rebuild
  as a one-tap pre-authorized session over a UA balance.
- **Ethcode** (ethglobal, ETHIndia 2022) — "one-click ERC-4337 abstraction-account paymaster template/codegen."
  **Prize: Ethereum Foundation Best ERC-4337 Tool.** Chain/eco: EVM AA. *Portability:* more devtool than
  consumer; useful as a scaffolding reference for the gasless/paymaster wiring, not a headline demo.
- **Gundwane** (ethglobal, HackMoney 2026) — "agentic, non-custodial DeFi assistant on **EIP-7702 + ERC-8004**."
  *Portability:* the closest existing prior art to our thesis (7702 + agent identity). Differentiator to add:
  UA chain abstraction so the agent acts across chains from one balance, not single-chain.

## C. AI agent with its own onchain wallet (our lens — strongest fit)

- **Jarvis** (ethglobal, ETHGlobal Buenos Aires) — "x402 to pay or buy any service — request an uber from
  ChatGPT or any agent." **Prize: EVVM Best integration 1st place.** *Portability:* flagship-fit — agent signs
  with a server 7702 key, pays x402 invoices out of a chain-abstracted UA balance; satisfies the UA Track's
  cross-chain-value-move requirement AND the invisible-agent thesis in one.
- **Payflow** (ethglobal, ETHGlobal Buenos Aires) — "x402 agent that manages onchain subscriptions with
  autopay, autocancel, and **cross-chain balance**." *Portability:* almost the exact UA+7702 agent build —
  the agent's spend authority = a 7702/session-scoped UA; reframe as "your subscriptions, paid invisibly."
- **SpendMate** (ethglobal, ETHGlobal Buenos Aires) — "zero-code platform to create AI agents that spend
  safely with rules and limits." *Portability:* maps onto session-key/7702 spend policies over a UA; the
  "safe spending rails for agents" angle is judge-legible and composes with Openfort/ZeroDev policies.
- **Droid** (ethglobal, Agentic Ethereum) — "AI agent that does every onchain task **on Arbitrum** by prompt."
  *Portability:* Arbitrum-native already → stacks the $2,000 Arbitrum bonus; add UA so "every onchain task"
  becomes "every onchain task across every chain, from one balance."
- **Maru** (ethglobal, Agentic Ethereum) — "AI agent capable of every onchain task just by giving a prompt."
  *Portability:* agent = 7702 server key over UA; the prompt→tx UX is the invisible-crypto demo.
- **Fluxo** (ethglobal, ETHGlobal Cannes) — "platform that simplifies onchain transactions through an
  AI-powered agent." **Prize: LayerZero Best Omnichain Interaction 2nd.** *Portability:* UA replaces the
  LayerZero omnichain plumbing; the agent stays, the bridging disappears.
- **I.D.I.O.T. Protocol** (ethglobal, ETHGlobal Buenos Aires) — "machine economy of agents + x402 for IoT."
  **Prize: Nethermind Agentic Frontier 1st place.** *Portability:* device/agents pay each other from
  UA-settled balances; niche but strong if a tangible IoT/agent demo is feasible in the window.
- **MCPay.fun** (ethglobal, ETHGlobal Prague — **ETHGlobal Finalist**) — "pay-per-use APIs via **x402 + MCP**."
  **Prize: Blockscout pool + Prague Finalist.** *Portability:* MCP server + agent paying from a UA balance;
  ties directly to Claude/Codex MCP tooling (Abu's "crypto invisible to AI agents" lens).
- **router402** (ethglobal, HackMoney 2026 — **Finalist**) — "one API, many LLMs, true pay-per-use, x402
  micropayments on Base." **Prize: LI.FI Best AI x LI.FI Smart App + HackMoney Finalist.** *Portability:*
  UA-funded agent settles cross-chain; replace Li.Fi routing with UA.
- **Agent Pay** (ethglobal, ETHGlobal Cannes 2026) — "decentralized API database for AI agents, payable with
  crypto." **Prize: Ledger AI Agents x Ledger 3rd.** *Portability:* x402 + UA balance for agent API access.
- **A2A** (ethglobal, ETHGlobal Cannes 2026) — "verified AI agent marketplace; humans register, discover, and
  pay agents via **ENS + x402**." *Portability:* agent-to-agent payments settled from chain-abstracted UAs;
  ENS for identity. (Note: agent-marketplace is a crowded lane — many near-dupes: Envoy, Rogue Capital, yellowX.)

## D. Gasless / embedded-wallet onboarding (no MetaMask) + Magic bonus

- **Face Pass** (ethglobal, ETHGlobal Paris) — "a wallet based on your face, no seed phrase or private key."
  **Prize: WalletConnect Most Innovative + QuickNode Top 5.** *Portability:* biometric → Magic/embedded signer
  that CAN do 7702 (extension wallets can't); lands the Magic $500 bonus + the no-MetaMask requirement.
- **RIP-7212 Onboarding** (ethglobal, ETHGlobal Sydney) — "seamless onboarding via RIP-7212 + EIP-4337."
  *Portability:* passkey/P-256 onboarding → 7702-upgraded account; reference for the frictionless first-run.
- **Flash** (ethglobal, ETHOnline 2023) — "gasless stablecoin payments via QR — as easy as web2, no
  centralization." *Portability:* UA + paymaster behind a QR-pay UX; the "feels like web2" framing is the thesis.
- **CryptGate** (ethglobal, ETHOnline 2023) — "crypto payment gateway for web2/web3 with AA + zk identity."
  *Portability:* merchant-side gateway settling to a UA; gasless checkout.

## E. Consumer payments / Venmo-style send-receive (invisible-crypto mobile)

- **UNSU Wallet** (ethglobal, ETHGlobal London) — "use crypto as the easiest way to send and receive value."
  **Prize: Arbitrum Qualifying Submission + ApeCoin Most Creative Consumer Use Case.** *Portability:* strong
  consumer + Arbitrum-bonus base; rebuild on UA + Magic onboarding + 7702 gasless sends.
- **CloakPay** (ethglobal, ETHGlobal Cannes 2026) — "the first crypto wallet where the merchant never sees
  your address. Pay anyone. Reveal nothing." **Prize: WalletConnect — Best use of WalletConnect Pay 1st.**
  *Portability:* privacy-pay over a UA balance; differentiated angle (stealth) on top of invisible UX.
- **Monkey Bridge** (ethglobal, ETHOnline 2025) — "PYUSD → escrow → virtual card; pay with crypto on any site."
  **Prize: PayPal USD Grand Prize (Best Overall).** *Portability:* UA balance → virtual card / web2 checkout;
  the "spend crypto on any normal site" bridge is a vivid invisible-crypto demo.
- **Pay with USDC** (ethglobal, ETHOnline) — "mobile app to send/receive USDC with friends, Venmo style."
  *Portability:* canonical consumer base — UA + Magic + 7702 = gasless cross-chain Venmo.
- **W3NPAY** (ethglobal, ETHSF 2022) — "Web3 Venmo — send/request crypto to any EVM wallet." **Prize: ENS
  Integration + XMTP pool.** *Portability:* UA + ENS handles; add request/messaging via XMTP.
- **Frenmo** (ethglobal, ETHGlobal Lisbon) — "request and send any tokens to frens gasless." **Prize: Polygon
  Build on Polygon.** *Portability:* gasless social send over UA.

## F. Cross-border remittance / payment routing

- **Mirano Pay** (ethglobal, ETHNewYork 2022) — "multi-chain trusted payment ecosystem for LATAM."
  **Prize: Swivel Best Use + Optimism + Superfluid + more.** *Portability:* UA-settled remittance corridor;
  localize to a real corridor with fiat off-ramp.
- **Flashpay** (ethglobal, HackMoney 2026) — "pay anyone by their .eth name — gasless, instant, cross-chain
  USDC via ENS." *Portability:* UA cross-chain + ENS + 7702 gasless; very close to a finished UA demo.
- **Papaya** (ethglobal, ETHOnline 2025) — "send/receive remittances between PayPal and crypto/fiat."
  *Portability:* UA balance bridged to PayPal rail.

## G. Subscriptions / recurring / split / loyalty (delegated-authority demos)

- **onchain-subscription** (ethglobal, HackMoney 2026) — "subscriptions that renew only with cryptographic
  user consent." *Portability:* 7702 + session-key consent over a UA = the textbook delegated-spend demo.
- **Split/3** (ethglobal, ETHNewYork 2022) — "Web3 Splitwise; friend-to-friend debt reconciliation + implicit
  lending." **Prize: WalletConnect Best DeFi + Valist Best Use.** *Portability:* UA-settled group expenses,
  gasless via 7702.
- **BaseSplit** (ethglobal, ETHGlobal Buenos Aires) — "snap your receipt, split between friends, settle
  crypto-natively." *Portability:* UA + Magic onboarding; OCR-receipt UX is demo-friendly.
- **MetaCert** (ethglobal, ETHGlobal Waterloo) — "loyalty program that rewards certified users for activity +
  knowledge." **Prize: Polygon Best use of Polygon ID.** *Portability:* onchain points minted/redeemed across
  chains from one UA; invisible-rewards angle.
- **PearlZZ** (ethglobal, ETHOnline 2021) — "disintermediated loyalty points + B2B alliances marketplace."
  *Portability:* cross-chain loyalty balance unified in a UA.

## H. One-click DeFi for normies / AI DeFi assistant

- **TipMe (Melon)** (ethglobal, Scaling Ethereum 2024) — "the DeFi experience at one click with Melon Wallet."
  **Prize: Arbitrum Qualifying Submission.** *Portability:* one-click DeFi over a UA on Arbitrum (bonus stack).
- **WhisperFi** (ethglobal, HackMoney 2026) — "AI DeFi assistant: chat to swap, bridge, manage crypto with
  privacy." **Prize: ENS Integrate ENS.** *Portability:* the bridge step vanishes under UA; agent + 7702.
- **Orai** (ethglobal, ETHOnline 2025) — "AI cross-chain payment assistant to send, swap, or stake."
  *Portability:* UA backs the assistant; 7702 server key for autonomy.
- **Nomis** (ethglobal, ETHGlobal New Delhi) — "super DeFi app for seamless token swaps & RWA investing with
  stablecoins." *Portability:* UA-funded one-tap RWA/swap.

## Devpost (consumer / AI, thinner crypto coverage)

- **Hamilton** (devpost, Battle of the Hacks v2.0 — **Winner**) — "your personal finance assistant."
  *Portability:* concept seed only — a finance-assistant front-end that, on the crypto side, becomes an
  agent acting over a UA. Devpost corpus returned little crypto-native agent material (most agent prior art
  lives in the ETHGlobal set), so weight ETHGlobal for this hackathon.

---

## Synthesis — where the white space + best refactor seeds are

1. **Highest-fit, lowest-dup:** an **autonomous AI agent that pays/subscribes/settles from a chain-abstracted
   UA, signed by a server 7702 key** (seeds: Jarvis, Payflow, SpendMate, Maru). This is the ONE build that
   simultaneously (a) satisfies the UA Track's cross-chain value-move req, (b) dodges the MetaMask-can't-7702
   constraint (server key), (c) hits the "invisible crypto for AI agents too" lens, (d) rides the x402 macro wave.
2. **Most demo-able consumer flow:** a **Venmo/UPI-style gasless cross-chain pay app** (seeds: ChainPe, UNSU,
   Pay with USDC, Slipstream, Flashpay) on **Magic embedded + Arbitrum** → stacks both bonuses, pure
   invisible-UX axis. Crowded lane though — needs a sharp differentiator (stealth pay à la CloakPay, or
   real-world off-ramp à la ChainPe).
3. **x402 ↔ UA bridge is genuinely underexplored:** the open wiki question "can an agent pay via x402 out of a
   chain-abstracted UA balance?" is unanswered in docs. Nearly every x402 winner settles single-chain (Base).
   A demo that funds x402 invoices from a UA's cross-chain balance is a credible *technical* novelty, not just a UX skin.
4. **Caution / crowding:** agent *marketplaces* (A2A, Envoy, Rogue Capital, yellowX) and generic "AI agent does
   any onchain task" (Maru, Droid, Fluxo) are heavily duplicated in 2025-2026 corpora — differentiate on the
   UA chain-abstraction + 7702 mechanics, not the agent framing alone.
5. **Constraint reminders baked into every seed:** no extension-wallet surface for the 7702 track; embedded
   (Magic/Privy/Dynamic) or server key only; deploy primarily on Arbitrum for the bonus; one mandatory
   cross-chain value-moving op via UA is non-negotiable for the flagship track.
