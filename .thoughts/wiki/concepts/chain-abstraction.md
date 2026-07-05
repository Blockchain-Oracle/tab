# Chain abstraction

> Sources: Particle UA "CHA" overview + web-quickstart; Particle dev docs intro; Particle whitepaper/abstraction-functionalities (via search); ZeroDev docs. See ../../raw/sources.md.

## What it is (plain English, define jargon inline)

**Chain abstraction (CHA)** hides "which blockchain am I on?" from the user. The
user sees **one account and one balance**, and the infrastructure figures out
which chains the funds actually live on, how to move them, and how to pay gas.

Particle frames CHA as delivering **"a single account and balance across all
supported chains"** — EVM or non-EVM. The key promise: **"a user's balance of any
token will be treated as a collective of their tokens across any chain they're
on."** (Particle CHA overview.)

Three friction points CHA removes (Particle CHA overview):
- **Fragmented liquidity** — assets scattered across chains; user no longer
  manually manages or consolidates them.
- **Per-chain gas** — no need to hold the native gas token (ETH, ARB, SOL…) of
  every chain you touch; gas is handled automatically.
- **Manual bridging** — user transacts without running a bridge themselves;
  routing/bridging happens under the hood, per transaction.

Jargon:
- **EOA** (Externally Owned Account) — a normal private-key wallet (e.g.
  MetaMask), one address controlled by one key.
- **Smart account** — a wallet that is a smart contract, so it can be programmed
  (batching, gas sponsorship, session keys, recovery).
- **Paymaster** — a contract/service that pays gas on the user's behalf (and may
  let the user reimburse it in any token).
- **Bundler** — service that packages account-abstraction operations and submits
  them on-chain.

## How it works (technically correct, concise)

Particle implements CHA through **Universal Accounts (UA)** and three coordinated
"abstraction" layers (Particle whitepaper / docs):

1. **Universal Accounts = wallet abstraction.** A UA is a **specialized ERC-4337
   smart-account implementation deployed and coordinated across chains by the
   Particle Chain** (a coordination L1). One logical account spans many chains.
2. **Universal Liquidity = liquidity abstraction.** Aggregates the user's
   balances across all chains into one view and **coordinates cross-chain
   transactions atomically, per transaction** — so a cross-chain action looks
   like a single transaction. This is what makes "one balance" real: a transfer
   on chain X can be funded by assets the UA holds on chains Y and Z, routed
   automatically.
3. **Universal Gas = gas abstraction.** A native Paymaster lets the user **pay
   gas in any token from any chain**, removing the need to pre-hold each chain's
   native gas token.

Supporting infrastructure (per third-party summaries — Messari/DAIC, *verify
against whitepaper before quoting precisely*): a **Master Keystore Hub** as the
source of truth for accounts/balances, a **Decentralized Messaging Network**
(reported as Hyperlane-powered) for cross-chain comms, and a **Decentralized
Bundler** that executes ops against liquidity providers.

**EIP-7702 mode (the hackathon-required mode).** EIP-7702 lets an existing EOA
temporarily/persistently delegate to smart-contract code, i.e. **upgrade the EOA
in place**. In 7702 mode the UA SDK turns the user's existing EOA into a
chain-abstracted account: **no new address, no migration, no smart-account
deployment** — the EOA's current assets are immediately spendable through the UA
(Particle CHA overview; hackathon brief).

**SDK shape** (Particle web-quickstart):
- `new UniversalAccount({ projectId, projectClientKey, projectAppUuid,
  ownerAddress, tradeConfig })` — only the EOA address is needed at construction.
- `ua.getPrimaryAssets()` → cross-chain asset snapshot incl. `totalAmountInUSD`
  (the unified balance). "Primary Assets" are the chains' assets the UA can
  source from.
- Cross-chain transfer = three steps: `createTransferTransaction()` (token =
  chain + address, amount, receiver) → sign the transaction's `rootHash` →
  `sendTransaction()`. The UA does **not** need the target token or gas on the
  destination chain; the SDK sources liquidity from Primary Assets and routes
  automatically.
- Signer-agnostic: the same API works with `ethers.Wallet`, Particle Auth,
  browser wallets, or a Magic embedded wallet as the owner/signer.

## Distinguish from account abstraction (AA)

- **Account abstraction** makes a *single account programmable on one chain*:
  ERC-4337 smart accounts or EIP-7702-upgraded EOAs, enabling gas sponsorship,
  batching, session keys, recovery. Scope = the wallet, on a given chain.
- **Chain abstraction** makes *one account span many chains* with a unified
  balance, cross-chain liquidity routing, and any-token/any-chain gas. Scope =
  the multi-chain experience.
- Relationship: **CHA is built on top of AA.** Particle's UA is literally an
  ERC-4337 smart account (AA) coordinated across chains (CHA). AA is necessary
  but not sufficient for CHA.

## Why it matters for THIS hackathon

- **Universal Accounts Track ($2,500 / $2,000 / $1,500)** *requires* the UA SDK
  in **EIP-7702 mode** plus **at least one cross-chain operation moving value via
  the UA**. CHA is the core thing being judged — "one login, one balance,
  transactions on any chain with any asset." (hackathon brief.)
- **Arbitrum bounty ($2,000)** explicitly rewards "chain-abstracted UX patterns"
  where the user "never has to think about wallets, gas fees, bridges, or what
  chain they're using," with Arbitrum as backend settlement. CHA is the named
  pattern.
- **General Track / UX judging** rewards apps that "feel less like crypto apps
  and more like normal consumer products." Hiding chains is the strongest UX
  lever available.
- Practical build implication: a demo should *show* the unified-balance number
  (`getPrimaryAssets().totalAmountInUSD`) and a single cross-chain action funded
  from assets on a different chain — that visibly proves CHA.

## Relationship to the sponsor SDKs

- **Particle Universal Accounts (headline).** *Is* the CHA layer. Provides the UA
  SDK, Universal Liquidity, Universal Gas, and the required EIP-7702 mode.
  Everything else plugs into it.
- **Magic ($500 bonus).** Embedded-wallet / social-login **signer**. Magic can be
  the EOA owner behind a UA (SDK is signer-agnostic) → walletless onboarding +
  CHA in one flow. Strong combo for the Magic bounty.
- **ZeroDev (General subtrack, $500).** AA infrastructure: ERC-4337 + EIP-7702
  smart accounts, gas sponsorship, ERC-20 gas, batching, session keys. *Also*
  ships its own chain-abstraction feature — "**spend tokens on any chain without
  bridging**." So ZeroDev overlaps Particle on CHA but is a different stack;
  pick one as the primary account layer (the UA track mandates Particle's).
- **Openfort (General subtrack, $100).** Embedded-wallet / smart-account +
  session-key infra (AA layer), usable as the signer/onboarding under a UA.

## Open questions

- Exact internals of Universal Liquidity's "atomic" cross-chain coordination
  (settlement guarantees, failure/rollback) — primary docs are thin; whitepaper
  needed. *Unverified.*
- Whether the Master Keystore Hub / Hyperlane-DMN / Decentralized Bundler names
  are current and how they map to the public SDK — sourced from third-party
  write-ups, not Particle dev docs. *Unverified.*
- Which chains are "supported" for Primary Assets at hackathon time, and whether
  Arbitrum is a first-class source/destination (it should be — confirm).
- Latency/cost of a cross-chain UA transaction vs a same-chain tx (affects demo
  UX claims). *Unverified.*
- ~~EIP-7702 default vs non-default mode in the UA SDK~~ **Resolved:** 7702 is UA's
  default mode (`smartAccountOptions.useEIP7702: true`); see
  [../sdks/particle-universal-accounts.md](../sdks/particle-universal-accounts.md).

## Citations

- Particle — Chain Abstraction & Universal Accounts overview:
  https://developers.particle.network/universal-accounts/cha/overview
- Particle — Universal Accounts web quickstart (SDK methods, 7702 mode):
  https://developers.particle.network/universal-accounts/cha/web-quickstart
- Particle — dev docs intro / Universal Accounts:
  https://developers.particle.network/intro/universal-accounts
- Particle — whitepaper, abstraction functionalities (three pillars; via search):
  https://whitepaper.particle.network/particle-network/abstraction-functionalities
- ZeroDev docs (AA + its chain-abstraction feature): https://docs.zerodev.app/
- EIP-7702: https://eips.ethereum.org/EIPS/eip-7702 ·
  ERC-4337: https://eips.ethereum.org/EIPS/eip-4337
- Hackathon brief: `instuctions.md` (project root).
- Third-party context (treat as unverified): Messari report; DAIC Capital blog —
  via the search results listed in this page's research.
