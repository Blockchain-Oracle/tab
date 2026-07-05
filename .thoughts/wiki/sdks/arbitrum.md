# Arbitrum
> Sources: https://docs.arbitrum.io/ ; https://arbitrum.io/ ; cloned repo `Reference/arbitrum-docs/` (OffchainLabs/arbitrum-docs @ `1437c8e`); Context7 `/offchainlabs/arbitrum-docs`. See ../../raw/sources.md.

## What it is
Arbitrum is a family of Ethereum **Layer 2 (L2)** chains — "child chains" that batch transactions, execute them off Ethereum mainnet, and post the results back to Ethereum for security. It uses the **Nitro** tech stack ("Geth-at-the-core"), so it is **EVM-equivalent**: the same Solidity contracts, the same `ethers`/`viem`/Hardhat/Foundry tooling, the same wallets you already use on Ethereum, just ~10x cheaper and faster (quickstart: "reduces these costs about 10X"). For a hackathon, "deploy on Arbitrum" means: take your normal EVM dApp and point its RPC/chainId at an Arbitrum chain — there is no Arbitrum-specific SDK you are forced to learn. Three flavors matter: **One** (general-purpose Rollup, full Ethereum trust), **Nova** (AnyTrust — a Data Availability Committee keeps data offchain for cheaper, higher-throughput gaming/social), and **Orbit / Arbitrum chains** (deploy your *own* configurable L2/L3 with custom gas token, governance, and DA).

## Hackathon relevance
- **Maps to:** Arbitrum "Road to Open House London" Bounty — single **$2,000** prize (independent of which main track you submit to; stackable with Particle/Magic/ZeroDev/Openfort).
- **EXACT requirement:** "the application and its components are deployed on the Arbitrum network" and "Projects must run **primarily on Arbitrum**" and "should use chain-abstracted UX patterns like embedded wallets, social login, gas abstraction, invisible bridging, or account abstraction." The user must never think about wallets, gas, bridges, or chains.
- **Judging:** UX excellence 30%, Creativity 30%, Adoption potential 20%, Execution 20%. "The best projects will feel less like 'crypto apps' and more like normal consumer products."

## Core concepts & primitives
- **Arbitrum One** — Optimistic Rollup, Chain ID **42161**, native currency **ETH**. The default "deploy here" target for a consumer dApp.
- **Arbitrum Nova** — AnyTrust (DAC trust assumption), Chain ID **42170**, ETH. Cheaper/higher-throughput; good for high-frequency gaming/social where full rollup trust isn't required.
- **Arbitrum Sepolia** — testnet, Chain ID **421614**. Where you build/demo for free.
- **Nitro vs AnyTrust** — One = pure Rollup (posts all data to Ethereum). Nova = AnyTrust (DAC of `N` members, assumes ≥2 honest, keeps data offchain → lower fees).
- **Orbit / Arbitrum chains** — "deployable, configurable instances of the Arbitrum Nitro tech stack." Choose custom gas token, native ETH, Rollup/AnyTrust/Alt-DA, governance. Built via `OffchainLabs/arbitrum-chain-sdk`. Overkill for a hackathon unless your wedge *is* a custom chain.
- **Two-component gas model** — every fee = an **L1 component** (compensates the Sequencer for posting your tx's calldata to Ethereum) + an **L2 component** (normal Geth execution, EIP-1559-style, but with a gas-price *floor*). This is why "gas abstraction" is cheap to sponsor on Arbitrum.
- **Stylus** — write contracts in Rust/C/C++ (WASM) alongside Solidity; live on One + Sepolia. Optional flex.
- **NodeInterface** — a virtual precompile for accurate gas estimation that splits the L1/L2 components (`gasEstimateComponents()`).

## How you actually integrate it (minimal happy path)
There is no install step unique to Arbitrum — it's an EVM chain. You (1) add the network, (2) deploy your contract with any EVM tool, (3) connect your frontend.

**1. Connect to the RPC** (`ethers`, from the docs):
```javascript
import { providers } from 'ethers';
// Arbitrum One mainnet
const provider = new providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
// Arbitrum Sepolia testnet (build/demo here)
const testProvider = new providers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
const network = await testProvider.getNetwork();
console.log('Chain ID:', network.chainId); // 421614
```

**2. Public RPC / chain reference** (from `_reference-arbitrum-rpc-endpoints-partial.mdx`):

| Name | RPC URL | Chain ID | Explorer | Tech |
| --- | --- | --- | --- | --- |
| Arbitrum One | `https://arb1.arbitrum.io/rpc` | `42161` | arbiscan.io | Nitro (Rollup) |
| Arbitrum Nova | `https://nova.arbitrum.io/rpc` | `42170` | arbitrum-nova.blockscout.com | Nitro (AnyTrust) |
| Arbitrum Sepolia | `https://sepolia-rollup.arbitrum.io/rpc` | `421614` | sepolia.arbiscan.io | Nitro (Rollup) |

Caveats from the docs: public RPCs have **no WebSocket**, **no IPv6**; the separate `*-sequencer` endpoints only accept `eth_sendRawTransaction(Conditional)`.

**3. Add the chain to a wallet** (MetaMask manual-add, from the Solidity quickstart):
```
Network Name:   Arbitrum Sepolia
New RPC URL:    https://sepolia-rollup.arbitrum.io/rpc
Chain ID:       421614
Currency Symbol: ETH
```
Get testnet ETH via a Sepolia faucet → bridge it at https://bridge.arbitrum.io/. Deploy is "exactly the same as Ethereum" — Remix/Foundry/Hardhat all work because contracts compile to EVM bytecode.

**4. (Optional) Accurate gas estimate via NodeInterface** (`@arbitrum/sdk`, from `how-to-estimate-gas.mdx`):
```ts
const { NodeInterface__factory } = require("@arbitrum/sdk/dist/lib/abi/factories/NodeInterface__factory");
const { NODE_INTERFACE_ADDRESS } = require("@arbitrum/sdk/dist/lib/dataEntities/constants");
const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, baseL2Provider);
const c = await nodeInterface.callStatic.gasEstimateComponents(destinationAddress, false, txData, { blockTag: 'latest' });
const childChainGasUsed = c.gasEstimate.sub(c.gasEstimateForL1); // L2 exec
const parentChainGasEstimated = c.gasEstimateForL1;             // L1 data
```
For most consumer dApps you never touch this — your embedded-wallet/paymaster SDK (Particle, ZeroDev, Magic) handles estimation and sponsorship for you. Arbitrum is just the destination chain.

## EIP-7702 / account-abstraction relationship
- **EIP-7702 is LIVE on Arbitrum One & Nova** via the **ArbOS 40 "Callisto"** upgrade (shipped with Nitro v3.6.5, tracking Ethereum's Pectra upgrade, May 2025). Docs: "EIP-7702 introduces a new transaction type that allows EOAs to set executable code, adding account-abstraction functionality such as delegation, batching, sponsorship, and privilege de-escalation."
- **ERC-4337 also works** — standard EntryPoint/bundler/paymaster flow runs on Arbitrum like any EVM chain. The Orbit config notes: "Arbitrum chains support account abstraction primarily through ERC-4337 ... and more recently via EIP-7702 integrated in the ArbOS 40 upgrade."
- **Why this matters for this hackathon:** the headline Particle Universal Accounts 7702 mode, plus ZeroDev/Openfort/Magic smart accounts, all settle their 7702/4337 transactions fine on Arbitrum. So you can satisfy *both* the Particle track AND the Arbitrum $2,000 bonus on one deployment — chain-abstracted UX on top, Arbitrum One settling underneath.
- 7702-aware edge case: a 7702-enabled EOA with temporary contract code is treated like a contract for L1→L2 ETH aliasing (deposits go to the aliased address). Only relevant if you do raw cross-chain messaging.

## Surface support
- **web** — **yes.** Pure EVM L2; works with `ethers`/`viem`/`wagmi` + any wallet by setting RPC/chainId 42161. Primary surface for a consumer dApp. Sponsor embedded-wallet SDKs all list Arbitrum support.
- **browser extension** — **yes.** MetaMask, OKX, and any injected EVM wallet connect via the documented manual network add (RPC + chainId + ETH). No Arbitrum-specific extension needed.
- **mobile (React Native / native)** — **yes (via standard EVM tooling).** No first-party Arbitrum mobile SDK, but it's an EVM chain, so WalletConnect, RN wallet SDKs, and the partner embedded wallets work unchanged. The bounty explicitly invites "mobile-first apps with seamless UX."
- **CLI / server / headless** — **yes.** Public JSON-RPC endpoints + `@arbitrum/sdk` (Node), `ethers`/`viem` server-side, `NodeInterface`/precompiles, Foundry/Hardhat deploy scripts. Full backend/settlement support.
- **AI-agent wallet** — **partial.** No Arbitrum-native agent-wallet product, but because EIP-7702 + ERC-4337 are live (ArbOS 40), agent wallets built on ZeroDev/Particle/Openfort with sponsored gas execute natively on Arbitrum. Arbitrum is the settlement layer; the AA standards do the agent UX. Bounty example: "AI apps with invisible onchain payments."

## Gotchas / limits / open questions
- **"Primarily on Arbitrum"** is the load-bearing rule — if your demo's core value moves on another chain and just *touches* Arbitrum, you likely don't qualify. Settle the main app logic on Arbitrum One (or your own Orbit chain).
- **One vs Nova:** default to **One** (full trust, broadest tooling/liquidity, chain 42161). Pick **Nova** only for high-frequency, low-value gaming/social where the DAC trust assumption is acceptable. **Orbit** only if a custom chain is the actual product — it adds deploy/ops overhead a hackathon rarely needs.
- **Public RPC limits:** no WebSocket, no IPv6, rate-limited. For production/demo reliability use a provider (Alchemy/Infura/QuickNode) — docs point to Alchemy Chain Connect.
- **Gas is cheap but not zero** — to make it *invisible* you still need a paymaster/sponsorship layer (Particle/ZeroDev/Openfort/Magic); Arbitrum alone doesn't sponsor user gas.
- **Faucet friction:** Arbitrum Sepolia ETH is typically obtained by bridging Sepolia L1 ETH via bridge.arbitrum.io — plan demo funding ahead of time.
- **(unverified)** exact current L2 gas-price floor / per-tx USD cost — the docs say "see the chain info page for current values"; not pinned here.
- **(unverified)** whether judges accept an Orbit/L3 (settling to Arbitrum One) as "deployed on Arbitrum" vs. requiring Arbitrum One/Nova directly — brief says "the Arbitrum network," not specifically One.

## Citations
- https://docs.arbitrum.io/ (Arbitrum Developer Docs — root)
- https://docs.arbitrum.io/build-decentralized-apps/public-chains — One vs Nova vs testnets
- https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix — deploy workflow + MetaMask network params
- https://docs.arbitrum.io/arbitrum-essentials/how-to-estimate-gas — two-component gas + NodeInterface snippet
- https://docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos40 — EIP-7702 live (ArbOS 40 Callisto)
- https://docs.arbitrum.io/launch-arbitrum-chain/overview/introduction — Orbit / Arbitrum chains
- https://arbitrum.io/
- Cloned repo: `Reference/arbitrum-docs/` (OffchainLabs/arbitrum-docs @ `1437c8e`) — partials `_reference-arbitrum-rpc-endpoints-partial.mdx`, `_troubleshooting-building-partial.mdx`, `config-account-abstraction.mdx`
- Context7 library id: `/offchainlabs/arbitrum-docs`
