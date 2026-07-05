# ZeroDev

> Sources (authoritative): live **https://docs.zerodev.app/** + Context7 `/websites/zerodev_app` — where the content below was pulled from. Local mirror `Reference/zerodev-docs` (github.com/zerodevapp/docs, branch `main` @ `0047253`) is **best-effort**: GitHub bulk fetch was throttled in this environment, so treat the repo file paths below as live-doc page references and verify against docs.zerodev.app. See ../../raw/sources.md.

## What it is
ZeroDev is a smart-account toolkit for Ethereum/EVM chains. A "smart account" is a wallet that is itself a smart contract instead of a plain key-pair (EOA), so it can do things a normal wallet can't: let someone else pay your gas (sponsorship), batch several actions into one transaction, log in with a passkey or social account, and hand out scoped "session keys" that can act on your behalf within limits. ZeroDev's account contract is called **Kernel** (a modular, ERC-7579-style account you extend with plugins). It supports both **ERC-4337** (the account-abstraction standard that routes "UserOperations" through bundlers + paymasters) and **EIP-7702** (a 2025 Ethereum upgrade that lets an existing EOA temporarily "become" a smart account). The docs claim it powers 6M+ smart accounts on 50+ networks for 200+ teams (unverified marketing figure).

## Hackathon relevance
- Maps to **General Track — Subtrack 2 ($500)** (per `../../raw/sources.md`). The exact prize wording lives in `instructions.md` (not re-read here) — treat the specific requirement text as **(unverified)** and confirm before submission.
- Practical bar to clear: ship something that actually creates a **Kernel smart account** with `@zerodev/sdk` and demonstrates at least one AA superpower — **gas sponsorship**, **EIP-7702 EOA upgrade**, **session keys**, or **batched UserOps**. The 7702 + gasless angle is the strongest fit given the hackathon's EIP-7702/AA theme (Particle, 7702 Collective are co-sponsors).

## Core concepts & primitives
- **Kernel** — ZeroDev's smart-account contract. Versions are referenced via constants `KERNEL_V3_1` (ERC-4337) and `KERNEL_V3_3` (used for EIP-7702). Source: `@zerodev/sdk/constants`.
- **EntryPoint** — the ERC-4337 singleton; selected with `getEntryPoint("0.7")` (or `"0.6"` for legacy Kernel v2). Kernel v3 ⇄ EntryPoint 0.7.
- **Validator / plugin** — a module that decides who can sign. `plugins.sudo` = the root owner validator (e.g. `signerToEcdsaValidator`); `plugins.regular` = a restricted validator (e.g. a session-key/permission validator).
- **Kernel account client** (`createKernelAccountClient`) — a viem-style client that sends UserOperations through a bundler (`bundlerTransport`) and optionally a `paymaster`.
- **Paymaster** (`createZeroDevPaymasterClient`) — sponsors gas (`sponsorUserOperation`) or lets users pay gas in ERC-20s via `paymasterContext`.
- **Permissions = 1 signer + N policies + 1 action** (Kernel v3). Signers (ECDSA / WebAuthn-passkey / Multisig), Policies (sudo, call, gas, signature, rate-limit, timestamp), Actions (the execution function). This is the modern session-key system.
- **Packages**: `@zerodev/sdk` (core), `@zerodev/ecdsa-validator`, `@zerodev/permissions` (session keys for Kernel v3 / EntryPoint 0.7), `@zerodev/session-key` (legacy session keys for Kernel v2 / EntryPoint 0.6), `@zerodev/wallet-react` (embedded wallet React UI).

## How you actually integrate it (minimal happy path)
Install (core + a validator):
```bash
npm i @zerodev/sdk @zerodev/ecdsa-validator
```
Create a Kernel account, wire a paymaster, send a gasless UserOp (verbatim from `get-started/quickstart.mdx`):
```ts
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk"
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { http, createPublicClient, zeroAddress } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"

const ZERODEV_RPC = 'https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/84532'
const chain = baseSepolia
const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1

const signer = privateKeyToAccount(generatePrivateKey())
const publicClient = createPublicClient({ transport: http(ZERODEV_RPC), chain })

const ecdsaValidator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion })

const account = await createKernelAccount(publicClient, {
  plugins: { sudo: ecdsaValidator },
  entryPoint,
  kernelVersion,
})

const zerodevPaymaster = createZeroDevPaymasterClient({ chain, transport: http(ZERODEV_RPC) })

const kernelClient = createKernelAccountClient({
  account,
  chain,
  bundlerTransport: http(ZERODEV_RPC),
  client: publicClient,
  paymaster: {
    getPaymasterData(userOperation) {
      return zerodevPaymaster.sponsorUserOperation({ userOperation })
    },
  },
})

const userOpHash = await kernelClient.sendUserOperation({
  callData: await kernelClient.account.encodeCalls([
    { to: zeroAddress, value: BigInt(0), data: "0x" },
  ]),
})
await kernelClient.waitForUserOperationReceipt({ hash: userOpHash, timeout: 15_000 })
```
Note: gas sponsorship only works after you create a project and set **Gas Policies** in the ZeroDev dashboard — "Without setting up a gas policy, there won't be any gas sponsored" (`sponsor-gas/evm.mdx`). For ERC-20 gas, pass `paymaster: paymasterClient` + `paymasterContext: { token: gasTokenAddresses[chain.id]['USDC'] }`.

**Session keys (Kernel v3, `@zerodev/permissions`)** — owner approves an agent's key, scoped by policies:
```ts
const ecdsaValidator = await signerToEcdsaValidator(publicClient, { entryPoint, kernelVersion, signer })
const emptyAccount = addressToEmptyAccount(sessionKeyAddress)        // only the address
const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount })
const permissionPlugin = await toPermissionValidator(publicClient, {
  entryPoint, kernelVersion, signer: emptySessionKeySigner,
  policies: [ /* call / gas / rate-limit / timestamp policies */ ],
})
const sessionKeyAccount = await createKernelAccount(publicClient, {
  entryPoint, kernelVersion,
  plugins: { sudo: ecdsaValidator, regular: permissionPlugin },
})
const approval = await serializePermissionAccount(sessionKeyAccount) // share with agent
// agent side:
const account = await deserializePermissionAccount(publicClient, entryPoint, kernelVersion, approval, sessionKeySigner)
```
(Source: `permissions/transaction-automation.mdx` + Context7 `/websites/zerodev_app`.)

## EIP-7702 / account-abstraction relationship
EIP-7702 lets an existing EOA "attach" the Kernel contract's code so the same address works as both an EOA and a smart account — unlocking sponsorship, batching, and session keys without a new wallet address. ZeroDev exposes this through a single extra parameter on `createKernelAccount`: pass `eip7702Account` instead of a `sudo` validator, and use `KERNEL_V3_3` (verbatim from `get-started/eip-7702/quickstart.mdx`):
```ts
import { KERNEL_V3_3 } from "@zerodev/sdk/constants"
const kernelVersion = KERNEL_V3_3
const eip7702Account = privateKeyToAccount(generatePrivateKey()) // the EOA you upgrade
const account = await createKernelAccount(publicClient, { eip7702Account, entryPoint, kernelVersion })
```
ZeroDev signs the EIP-7702 authorization automatically, or you can sign it yourself with viem's `signAuthorization({ account: signer, contractAddress: KERNEL_V3_3 })` and pass it as `eip7702Auth`. Under the hood it still flows through ERC-4337 UserOperations + bundler/paymaster — 7702 just changes how the account is "deployed"/delegated. Use a 7702-compatible chain (Sepolia, Base, Arbitrum, etc.). Live 7702 examples: https://7702.zerodev.app/ .

## Surface support
- **Web (browser dApp)** — **yes**. Core `@zerodev/sdk` (TS/JS) is the primary, best-documented path; viem-native, works in any browser app. Embedded-wallet React UI via `@zerodev/wallet-react`.
- **Browser extension** — **unknown**. No extension-specific docs found; as a viem-based JS lib it would technically run in an extension's JS context, but this is unverified.
- **Mobile (React Native / native)** — **partial→yes**. React Native works via community Expo starters (docs link `zerodev-expo-starter`, `zerodev-privy-expo`); native bindings exist via the **Omni SDK** — iOS (Swift, SPM) and Android (Kotlin, Maven Central). RN support is community-template-driven rather than a first-party RN package (note this in judging).
- **CLI / server / headless** — **yes**. `@zerodev/sdk` runs server-side (Node.js); Omni SDK adds Go (crates/modules), Python (PyPI), Rust (crates.io), and C FFI bindings for backends/agents. Session keys + remote signers (`toRemoteSigner`) are designed for server automation.
- **AI-agent wallet** — **yes**. First-class story: session keys/permissions let an agent transact within scoped policies, and there's an official **Coinbase AgentKit** integration (`ZeroDevWalletProvider.configureWithWallet({ signer, projectId, entryPointVersion: "0.7", networkId })`) plus a LangChain chatbot quickstart (`permissions/agentkit.mdx`).

## Gotchas / limits / open questions
- **Gas policy required**: sponsorship silently does nothing until you configure Gas Policies in the dashboard; UserOps fail when you hit a sponsorship limit (you can fall back to user-paid by returning `{}` from `getPaymasterData`).
- **Session-key paymaster footgun**: for automated session keys, set the `paymaster` flag (e.g. `oneAddress`) — otherwise a malicious agent can set sky-high gas and drain the user's ETH (`session-keys.mdx`).
- **Two session-key systems**: `@zerodev/permissions` (Kernel v3 / EntryPoint 0.7) vs legacy `@zerodev/session-key` (Kernel v2 / EntryPoint 0.6). Use permissions for new builds; don't mix entry-point versions.
- **EIP-7702 needs KERNEL_V3_3** and a 7702-enabled chain; UltraRelay (combined bundler+paymaster, `?provider=ULTRA_RELAY`) is only on a subset of networks (Base, Arbitrum, Optimism, etc.).
- **Quickstart RPC is a shared public key** — create your own ZeroDev project/RPC before demoing or going to prod.
- **Open question**: exact $500 Subtrack 2 requirement wording — confirm against `instructions.md` (unverified here).
- **Omni SDK maturity** for non-TS languages (Go/Python/Rust/C) is newer than the TS SDK; depth/stability unverified.

## Citations
- https://docs.zerodev.app/ (intro, quickstart, sponsor-gas, permissions, session-keys, EIP-7702 quickstart, SDKs overview, AgentKit)
- https://zerodev.app/ ; https://7702.zerodev.app/
- Doc-repo page paths (live at docs.zerodev.app; mirror to `Reference/zerodev-docs` was GitHub-throttled — verify against live docs):
  - `docs/pages/get-started/quickstart.mdx`, `docs/pages/get-started/eip-7702/quickstart.mdx`
  - `docs/pages/smart-accounts/sponsor-gas/evm.mdx`, `docs/pages/smart-accounts/permissions/{intro,session-keys,transaction-automation,agentkit}.mdx`
  - `docs/pages/get-started/sdks/overview.mdx`, `docs/pages/api-and-toolings/faqs/use-with-react-native.mdx`
- Context7 library id: `/websites/zerodev_app`
- Example code repo (referenced, not cloned): https://github.com/zerodevapp/zerodev-examples
