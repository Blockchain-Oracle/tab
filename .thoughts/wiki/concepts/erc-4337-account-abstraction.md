# ERC-4337 account abstraction

> Sources: [EIP-4337](https://eips.ethereum.org/EIPS/eip-4337) (primary), [Pimlico 4337-vs-7702](https://docs.pimlico.io/guides/eip7702/erc4337-vs-eip7702), [ZeroDev docs](https://docs.zerodev.app/), [Openfort AA](https://www.openfort.io/account-abstraction). See ../../raw/sources.md.

Background page. ERC-4337 is the **prior-generation** way to give users smart-contract
wallets. The hackathon's headline trick (EIP-7702) reuses most of this machinery but
removes its biggest pain (deploying a new account at a new address). Read this to
understand what 7702 inherits and what it replaces.

## What it is (plain English, define jargon inline)

ERC-4337 ("Account Abstraction Using Alt Mempool") lets people use a **smart-contract
account** — a wallet that is itself a programmable contract — as their main account,
*without changing Ethereum's consensus layer* (no hard fork). The goal, in the spec's
words: "allow users to use Smart Contract Accounts containing arbitrary verification
logic instead of EOAs as their primary account."

- **EOA** (Externally Owned Account): a plain key-controlled wallet (MetaMask). It can
  only check one fixed signature and must hold ETH to pay its own gas. "Dumb."
- **Smart account / smart wallet**: a contract that can batch calls, rotate keys, use
  passkeys/multisig, set spending limits, and let someone else pay gas. The features the
  hackathon's "invisible crypto" UX needs.
- Pre-7702, getting these features meant **deploying a brand-new contract account at a
  brand-new address** and migrating funds to it. That onboarding step is the friction
  4337 never solved and 7702 removes.

4337 works by introducing a **parallel system that runs alongside normal transactions**:
users sign intents ("UserOperations") instead of transactions, and off-chain actors
relay them on-chain. No EVM changes were needed — it is "just" contracts + infra.

## How it works (technically correct, concise)

Four moving parts (all defined by the EIP):

1. **UserOperation** — a "pseudo-transaction object" the user signs. Key fields:
   `sender` (the smart account), `nonce` (192-bit key + 64-bit sequence, anti-replay),
   `callData` (what to execute), `signature`, gas fields (`callGasLimit`,
   `verificationGasLimit`, `preVerificationGas`, `maxFeePerGas`,
   `maxPriorityFeePerGas`), account-deploy fields (`factory` + `factoryData`), and
   paymaster fields (`paymaster`, `paymasterData`, two paymaster gas limits). The
   signature MUST depend on `chainid` and the EntryPoint address to stop replay.
2. **Alt mempool + Bundler** — UserOps go into a *separate* mempool, not Ethereum's. A
   **bundler** is "a node (block builder) that can handle UserOperations, create a valid
   `entryPoint.handleOps()` transaction, and add it to the block." It simulates each
   UserOp first and MUST drop it if simulation reverts. The bundler pays the real gas in
   ETH and is reimbursed on-chain — this is how the *user* never needs ETH.
3. **EntryPoint** — one canonical **singleton contract** that all accounts trust. Its
   `handleOps(ops, beneficiary)` runs two loops: a **validation loop** (deploy the
   account from `factory`+`factoryData` if it doesn't exist yet, then call
   `validateUserOp(...)` on each account to check the signature and that fees are
   covered) and an **execution loop** (call the account with `callData`, refund unused
   gas, pay the bundler). Splitting validation from execution is what makes the alt
   mempool safe to relay.
4. **Account contract** — must implement `IAccount.validateUserOp(userOp, userOpHash,
   missingAccountFunds)`: verify the caller is the trusted EntryPoint, verify the
   signature over `userOpHash`, and return validation data (optional `validUntil` /
   `validAfter` time window + aggregator). Custom validation logic here is the whole
   point — passkeys, session keys, multisig, etc.

**Paymaster** = an optional helper contract that "agrees to pay for the transaction,
instead of the sender itself." During validation the EntryPoint calls
`validatePaymasterUserOp(...)`; if it approves, the user pays nothing (sponsored) or
pays in an ERC-20 token, and the paymaster's `postOp(...)` settles afterward. This is
the gas-abstraction / gasless UX every sponsor advertises.

**EntryPoint versions** (from community/infra sources, not the EIP body — *verify exact
version semantics before depending on them*):
- **v0.6** — original `UserOperation` with bundled `initCode` and `paymasterAndData`.
- **v0.7** — `PackedUserOperation`; split `factory`/`factoryData` and explicit paymaster
  fields (the structure described above). ZeroDev's Kernel v3.1 requires v0.7.
- **v0.8** — added **native EIP-7702 support**: the `factory` field can be a `0x7702`
  flag, and the UserOp hash / EntryPoint check incorporate the EOA's 7702 delegation
  address. The EIP-4337 text now references this `0x7702` flag, confirming the standards
  were merged rather than left to compete.

## Why it matters for THIS hackathon

- **It's the substrate 7702 mode runs on.** EIP-7702 "turns an EOA into a contract
  account" but it does **not** include a relayer, mempool, or gas-sponsorship system.
  Those come from 4337. So when a Particle UA / ZeroDev / Openfort flow does "gasless,
  one-click, batched, cross-chain," the 4337 machinery (bundler → EntryPoint →
  paymaster) is almost always doing the on-chain work underneath. Knowing 4337 explains
  *how* the magic happens.
- **It defines what 7702 supersedes — and what it does not.** 7702 removes the part of
  4337 that hurt UX: the new-address deploy/migrate step (`factory`/`initCode`/CREATE2).
  A user keeps their existing EOA address. But the *value-delivery* pieces of 4337
  (UserOperations, paymasters, bundlers, the EntryPoint) are **kept and reused**. Pimlico:
  ERC-4337 "is the de-facto standard for smart account relaying and gas sponsoring today
  and is expected to be the main way that most smart accounts with EIP-7702 will also be
  used."
- **Judging hook.** The rubric rewards prominent, innovative use of UA + 7702 and
  seamless UX. Demonstrating that you understand the 4337 plumbing (and chose 7702 to
  skip the deploy step) is exactly the "genuinely improved by the infra" story judges
  want. Treat 4337 as the *why-this-is-better-now* framing, not the build target.

## Relationship to the sponsor SDKs (Particle UA / ZeroDev / Openfort / Magic)

- **ZeroDev** — purpose-built ERC-4337 / ERC-7579 stack around its **Kernel** smart
  account, shipping bundler + paymaster + a viem-compatible SDK with pluggable
  validators (passkeys, ECDSA, session keys, multisig). Kernel v3.1 → EntryPoint v0.7;
  it also supports 7702 mode. *Note (verify):* ZeroDev was acquired by Offchain Labs
  (Arbitrum) in Aug 2025 — relevant given Arbitrum is a bonus sponsor here.
- **Openfort** — markets a full 4337 stack: "native smart accounts (ERC-4337 and
  EIP-7702), built-in paymasters for gasless transactions, session keys" plus a 4337
  bundler and relayer. General-Track Subtrack 1.
- **Particle Universal Accounts** — the flagship. UA layers **chain abstraction** (one
  balance across chains) on top of a smart-account model; in **7702 mode** it upgrades
  the user's EOA in place rather than deploying a separate account. *Unverified:* the
  exact internals (whether UA's execution rides EntryPoint/bundler infra or Particle's
  own relayer) need confirmation from Particle docs — do not assert a specific 4337
  EntryPoint dependency for UA without checking.
- **Magic** — embedded-wallet onboarding (email/social login). Its UOA / smart-account
  recipes pair the Magic key with AA smart wallets (e.g. Alchemy), i.e. Magic supplies
  the signer and a 4337/AA provider supplies the smart account + gas sponsorship.

## Open questions

- Which EntryPoint version (v0.7 vs v0.8) does **Particle UA 7702 mode** actually target,
  and does it route UserOps through a public bundler or Particle's own infra? (Not yet
  verified — Particle docs not read in this page.)
- For our build: do we ever need to touch raw 4337 objects (UserOperation, paymaster
  data), or do the SDKs fully hide them? Likely fully hidden in 7702 mode — confirm.
- Cross-chain value movement (a UA Track hard requirement): is settlement a 4337
  UserOp per chain, or an intent/solver layer above 4337? Document in the chain-abstraction page.

## Citations

- ERC-4337 spec — https://eips.ethereum.org/EIPS/eip-4337 (UserOperation, EntryPoint,
  bundler, paymaster, IAccount, alt-mempool, factory/`0x7702` flag, motivation)
- EIP-7702 — https://eips.ethereum.org/EIPS/eip-7702 (EOA-as-contract; the standard 4337
  is being merged with)
- Pimlico, "ERC-4337 vs EIP-7702" — https://docs.pimlico.io/guides/eip7702/erc4337-vs-eip7702
  ("not competing proposals"; de-facto standard quote)
- ZeroDev docs — https://docs.zerodev.app/ (Kernel, bundler/paymaster RPCs, EntryPoint
  versions) + Context7 `/websites/zerodev_app` (local `Reference/zerodev-docs` mirror was GitHub-throttled)
- Openfort, "Account Abstraction Infrastructure" — https://www.openfort.io/account-abstraction
- eth-infinitism/account-abstraction releases (EntryPoint version history) —
  https://github.com/eth-infinitism/account-abstraction/releases — *unverified secondary*
