# Fresh Hackathon Wedges — Particle Network Chain-Abstraction Hackathon

> Generated 2026-06-30. Grounded in the domain wiki SDK pages (Particle UA 7702, Magic,
> ZeroDev, Arbitrum), the surface-feasibility matrix, the agent-wallets concept page, the
> local winner corpus (68,294 projects), and 2025-2026 web research (EIP-7702 consumer
> onboarding, x402 / agentic commerce).

## Ground rules baked into every idea (the hard constraints)

- **Flagship UA-7702 track requires:** `smartAccountOptions.useEIP7702: true` **AND** ≥1
  cross-chain value-moving op via UA (`createBuyTransaction` / `createTransferTransaction` /
  `createConvertTransaction` → `sendTransaction(tx, sig, authorizations)`) **AND** a working demo.
- **7702 can ONLY be signed by** an embedded/WaaS wallet (Magic / Privy / Dynamic) **or a raw
  server key** — never MetaMask/extension/JSON-RPC. So: consumer ideas sign 7702 with **Magic**
  (also banks the $500 Magic embedded-wallet bonus); agent ideas sign 7702 with a **server key**
  (= exactly how an autonomous agent operates → fits Abu's "crypto invisible to AI agents" lens).
- **The dream stack = $5,000:** Magic embedded wallet ($500) → Particle UA 7702 ($2,500) →
  settle on **Arbitrum One** (42161, $2,000). Arbitrum has EIP-7702 live (ArbOS 40 "Callisto")
  and is first-class in Particle's quickstart (`CHAIN_ID.ARBITRUM_MAINNET_ONE`).
- **Magic bonus is scoped to the *embedded* (client) wallet** — agent-only server-key builds must
  still ship a Magic client onboarding/funding surface for the human owner to claim the $500.
- **Cross-cutting risks to flag everywhere:** (a) Particle **V2 account migration** warning is
  live on the docs — confirm account version before demo; (b) Particle session-keys are
  documented only on **Biconomy v2.0.0**, which may not compose with UA-7702 → prefer "agent owns
  its OWN UA funded by the human" over true cryptographic session-key delegation; (c) UA track
  text says "the **user's** EOA" — judges accepting an **agent-held** key as "the user" is an
  interpretation risk; (d) demo needs real primary assets in the UA (fund testnet/mainnet ahead).

---

## 1. Tab — the Stripe checkout button that doesn't care what chain your money is on

**Type:** fresh · **Non-crypto-person usable:** YES

**One-liner:** A drop-in `<PayButton>` any web app embeds; the buyer logs in with their email,
and Particle UA silently sources liquidity from whatever they already hold on *any* chain and
settles the merchant's preferred token on Arbitrum — no chain pick, no bridge, no gas, ever.

- **Tracks/prizes:** Flagship UA-7702 ($2,500) + Magic embedded wallet ($500) + Arbitrum ($2,000).
- **Tools:** Particle UA (`useEIP7702:true`, `createBuyTransaction`/`createConvertTransaction` →
  merchant token on `ARBITRUM_MAINNET_ONE`), Magic (email-OTP embedded wallet signs the 7702 auth),
  Arbitrum One settlement, React/TS SDK + Solidity merchant-receiver contract.
- **Surfaces:** web (drop-in widget) + CLI/server (merchant webhook + receipt). Optional extension-
  free by design (extension can't sign 7702 — so we deliberately use Magic, turning the constraint
  into the product).
- **Wedge / invisible-crypto moment:** buyer holds ETH on Base, merchant wants USDC on Arbitrum; the
  modal just says "Pay $5" → email code → "Paid." No chain name appears anywhere in the UI. It's
  Stripe Checkout for a multi-chain world where the buyer's funds can be *anywhere*.
- **Why the UX demos:** a fake storefront, one button, an email code, a green check, an Arbiscan
  receipt. Screenshot-perfect and a dev can literally `npm install` it — exploits Abu's distribution
  edge ("the Stripe button for crypto that ignores chains" is a shareable dev-tool narrative).
- **Risks:** "is it just a payment widget?" novelty worry → lean on the chain-agnostic *source* +
  AI receipt; merchant-token routing via UA across chains needs testing; real funds on testnet for
  the demo; verify UA V2 migration state.

---

## 2. Leash — give an AI agent a budget you can watch fill and yank in one tap

**Type:** fresh · **AI-agent angle: bullseye**

**One-liner:** You fund one balance with an email login, hand an AI agent a scoped allowance
(weekly cap + category allowlist + expiry), and it autonomously shops/pays *across chains* while a
live dashboard tickers every purchase behind a big red "revoke" button.

- **Tracks/prizes:** Flagship UA-7702 ($2,500, agent's server-key UA signs via `authorizeSync`) +
  Magic ($500, human funds/controls via embedded wallet) + Arbitrum ($2,000, settlement).
- **Tools:** Particle UA (server-key 7702, `createBuyTransaction`/`createTransferTransaction`),
  Magic embedded wallet (owner onboarding + top-up + kill switch UI), Arbitrum One, an LLM agent
  loop (TS) with policy guardrails, Solidity allowance/limits contract.
- **Surfaces:** web dashboard (human) + CLI/headless (agent) + AI-agent. Multi-surface — hits Abu's
  "web + CLI + agent" preference cleanly.
- **Wedge / invisible-crypto moment:** the agent buys across 3 chains and the human just sees
  "Agent spent $4.20 of your $50" — no chains, no gas, no confirmations — and can freeze it instantly.
  "Crypto invisible to the AI agent too," not just the human.
- **Why the UX demos:** split-screen video — left = agent terminal reasoning + buying; right = human
  dashboard ticking up; then a dramatic "revoke." The "I gave an AI my card... safely" narrative
  travels enormously on X (Abu's distribution edge).
- **Risks:** the "leash" is enforced by **funding cap + kill-switch (defund/freeze)**, NOT a Particle
  cryptographic session key (Biconomy-v2 caveat) — be precise about this in the writeup; "agent as
  EOA owner" UA-track interpretation risk (frame the *human* as owner, agent as funded sub-account);
  agent safety/guardrails must be visibly real to score the UX axis.

---

## 3. Splitstream — one paylink in your content that fans-in tips and fans-out a revenue split across chains

**Type:** refactor (ports creator tip-jar / revenue-split winners into chain abstraction) ·
**Non-crypto-person usable:** YES (fan side)

**One-liner:** A creator drops a single link in a video/tweet/post; fans pay with just an email, and
each incoming payment is auto-split to collaborators who each receive *their own* token on *their own*
chain via UA — nobody on either side ever sees a bridge.

- **Tracks/prizes:** Flagship UA-7702 ($2,500) + Magic ($500, fan + creator onboarding) +
  Arbitrum ($2,000, hub settlement).
- **Tools:** Particle UA (collect on UA, then N× `createTransferTransaction` to collaborators on
  different chains), Magic embedded wallet (walletless fan tip + creator login), Arbitrum One hub,
  React paylink widget + a small split-config (optionally AI-described: "60% editor, 40% me").
- **Surfaces:** web (embeddable link/widget) + content surfaces (the link lives in tweets/videos).
- **Wedge / invisible-crypto moment:** a single $10 tip lands as USDC-on-Arbitrum for the editor and
  ETH-on-Base for the host, automatically, with no contributor or recipient ever choosing a chain.
- **Why the UX demos:** Abu *makes content* — the paylink IS the distribution; he can demo it live on
  his own video, which is exactly the kind of demo that travels and scores adoption (20%).
- **Refactor source:** corpus tip/split winners (ClapCoin, "Tip This Creator", borch, 0xSplits-style
  patterns) — differentiator = walletless + automatic *cross-chain* fan-out via UA.
- **Risks:** tip jars are crowded → must lead with the cross-chain auto-split, not "tipping"; multiple
  receivers on multiple chains = more moving parts to demo reliably; UA V2 migration check.

---

## 4. Concierge — a chat box where you type money in plain English and an agent does the crypto

**Type:** fresh · **Non-crypto-person usable:** YES · **AI-agent angle**

**One-liner:** A clean chat UI (or Telegram mini-app): type "send Mom $50" or "buy me $20 of ETH,"
an LLM turns intent into a UA cross-chain transaction, a server key signs the 7702 authorization, and
it settles on Arbitrum — the agent never once asks "which chain?"

- **Tracks/prizes:** Flagship UA-7702 ($2,500) + Magic ($500, onboarding/funding) + Arbitrum ($2,000).
- **Tools:** Particle UA (intent → `createTransfer/Buy/ConvertTransaction`), an LLM intent parser
  (Claude/TS), Magic embedded wallet (login + fund), Arbitrum One, optional confirm-tap UI.
- **Surfaces:** web chat + mobile-ish (Telegram mini-app) + AI-agent. Multi-surface friendly.
- **Wedge / invisible-crypto moment:** the chat *is* the wallet; one English sentence becomes a
  chain-abstracted transfer with the agent handling every chain/gas/bridge decision. "Invisible to the
  human, and an AI does the crypto under the hood."
- **Why the UX demos:** type a sentence → money moves → receipt. Maximally legible to a non-crypto
  judge; trivially screen-recordable; very Abu-content-friendly.
- **Risks:** chat-payment bots are crowded (PayBot, web3telbot) → novelty must come from the UA
  chain-abstraction + true autonomy, not "another GPT wrapper"; LLM-intent→tx safety (confirmation
  step / spend caps) is essential and must be shown; overlaps idea #2 — keep them distinct (this is
  interactive NL, #2 is autonomous-budgeted).

---

## 5. Standby — an agent that watches a condition and pays/buys for you while you sleep

**Type:** fresh · **AI-agent angle**

**One-liner:** Set a rule in plain language ("when this invoice arrives, pay it" / "if my reorder
trigger fires, buy $50 of X"); a headless agent monitors it, and when it fires, executes a
cross-chain value move via its own UA (server-key 7702) and pings you "done while you were away."

- **Tracks/prizes:** Flagship UA-7702 ($2,500) + Magic ($500, human funds/limits) + Arbitrum ($2,000).
- **Tools:** Particle UA (server-key 7702 + transaction builders), a monitoring/trigger loop (TS),
  Magic embedded wallet (owner funding + cap UI), Arbitrum One, push/email notification.
- **Surfaces:** CLI/headless (the watcher) + web (rule-setup + notifications) + AI-agent. Strong
  multi-surface story.
- **Wedge / invisible-crypto moment:** autonomous, conditional, *cross-chain* spend with zero human in
  the loop at execution time — the vivid "the agent did it for you overnight" demo.
- **Why the UX demos:** set rule → trigger fires on camera → agent executes → notification arrives with
  an Arbiscan link. Great short-form video beat.
- **Risks:** overlaps DCA/automation winners (ASTRA, Dui AI) → needs ONE crisp, non-finance use case to
  avoid feeling generic (invoice autopay or restock are more "consumer" than trading); trigger source
  must be real, not faked, to score; "agent as owner" UA interpretation risk.

---

## 6. Jar — a walletless group fund where everyone chips in from a different chain and sees one number

**Type:** refactor (Splitwise / borch group-expense pattern → chain-abstracted) ·
**Non-crypto-person usable:** YES

**One-liner:** A shared "jar" (group gift, trip fund, team pool) where each person contributes with just
an email from whatever they hold on whatever chain, the jar shows a single USD total, and on goal it
releases to the organizer on Arbitrum — nobody involved knows it's crypto.

- **Tracks/prizes:** Flagship UA-7702 ($2,500) + Magic ($500, walletless contributors) + Arbitrum ($2,000).
- **Tools:** Particle UA (each contribution + final `createTransferTransaction` release on Arbitrum,
  `getPrimaryAssets().totalAmountInUSD` for the one-number balance), Magic embedded wallet (email
  contributors), Arbitrum One, React progress-bar UI.
- **Surfaces:** web (shareable jar link) + content surfaces (the link spreads socially).
- **Wedge / invisible-crypto moment:** five people fund from Base / Polygon / Solana / Arbitrum and the
  jar UI just says "$240 / $300" — the unified balance makes multi-chain pooling look like a single
  warm progress bar.
- **Why the UX demos:** a jar filling up as contributors pay; soft, consumer, zero crypto vocabulary —
  the kind of "feels like a normal app" UX the Arbitrum bounty explicitly rewards. Shareable link =
  distribution.
- **Refactor source:** borch, Chip-In, Rio, PayWithFriends (corpus) — differentiator = walletless +
  cross-chain pooling into one number via UA.
- **Risks:** group-pay/bill-split is *very* crowded → lead with cross-chain pooling + walletless, not
  "split a bill"; refund/goal-not-met flows add scope; UA V2 migration check.

---

## 7. Vendor — an agent that pays *other* agents per-call via x402, funded from one chain-abstracted balance

**Type:** fresh · **AI-agent angle · technical-novelty play**

**One-liner:** An agent-to-agent service marketplace where agents call each other's paid endpoints over
x402 (HTTP 402), but every payment is drawn from a *chain-abstracted UA balance* and settled on
Arbitrum — answering the wiki's explicit open question "can an agent pay via x402 out of a UA balance?"

- **Tracks/prizes:** Flagship UA-7702 ($2,500, server-key agent UAs) + Arbitrum ($2,000, x402 settles on
  Arbitrum per CDP facilitator) + Magic ($500, human owner top-up/limits panel — needed to bank Magic).
- **Tools:** Particle UA (server-key 7702 funding the x402 payer), x402 client/facilitator (Arbitrum),
  Magic embedded wallet (owner funding console), Arbitrum One, two demo agents (TS) + a paid endpoint.
- **Surfaces:** CLI/headless (agents) + web (owner console) + AI-agent. ERC-8004 (live Jan 2026)
  identity framing optional.
- **Wedge / invisible-crypto moment:** it resolves a genuinely *undocumented* integration (x402 settled
  out of a chain-abstracted UA), scoring hard on the "innovative/prominent UA use" axis (30%) — the
  technical "how is that even possible" wow.
- **Why the UX demos:** two agent terminals transacting in real time + a live payment ledger on Arbiscan.
  Strong for a technical audience; weaker for a lay judge (mitigate with a thin consumer wrapper).
- **Risks:** HIGHEST buildability risk — x402 ↔ UA composition is **unverified**; abstract for non-crypto
  judges where UX is 30-40%; best as a "technical wow" secondary bet, not the lead. If the window is
  short, this is the first to cut. Flag deadline sensitivity explicitly.

---

## Quick selection guidance

- **Safest full-stack consumer winners (UX-axis-heavy, non-crypto-usable):** #1 Tab, #6 Jar, #4 Concierge.
- **Strongest "crypto invisible to AI agents" (Abu's lens) with full stacking:** #2 Leash, #5 Standby.
- **Best distribution-edge fit (Abu makes content → the artifact IS the demo):** #3 Splitstream, #1 Tab, #2 Leash.
- **Highest novelty / highest risk (verify buildability first):** #7 Vendor.
- **Deadline flag:** all are buildable in TS/React/Solidity in a hackathon window EXCEPT #7 (x402↔UA
  unverified) and the multi-receiver complexity of #3 — treat those as the risky long-poles.
