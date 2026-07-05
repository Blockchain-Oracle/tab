# Particle Universal Accounts (UA) + EIP-7702 mode

> Sources: docs https://developers.particle.network/universal-accounts/cha/overview · https://developers.particle.network/universal-accounts/cha/web-quickstart · https://developers.particle.network/intro/introduction · cloned docs `Reference/particle-docs-mintlify/` (HEAD `360327a`) · cloned demo `Reference/particle-universal-accounts-7702/` (HEAD `69df80e`, Privy + 7702) · Context7 `/websites/developers_particle_network`. See ../../raw/sources.md.

## What it is
Particle's **Universal Accounts (UA)** give a user **one account and one balance that works across every supported chain** (EVM + Solana). Instead of bridging tokens or worrying which chain holds what, the SDK treats the user's holdings as a single pooled balance and, when they transact, **automatically sources liquidity, bridges, and pays gas across chains** under the hood. Technically a UA is an ERC-4337 smart account, but in **EIP-7702 mode** the SDK *upgrades the user's existing EOA in place* — the same wallet address becomes the Universal Account by signing a one-time delegation (a Type-4 "authorization"), so there is **no new address, no asset migration, and no smart-account deployment**. Jargon: *EOA* = a normal private-key wallet; *EIP-7702* = a 2025 Ethereum upgrade letting an EOA temporarily delegate execution to contract code; *chain abstraction* = hiding which chain you're on.

## Hackathon relevance
- Maps to the **flagship Universal Accounts Track (Particle Network): 1st $2,500 / 2nd $2,000 / 3rd $1,500.**
- **Exact requirements to satisfy** (from `instuctions.md`):
  1. **Must use the Universal Accounts SDK in EIP-7702 mode** → set `smartAccountOptions.useEIP7702: true` (see init below) with a **supported embedded-wallet provider**.
  2. **At least one cross-chain operation moving value via UA** → e.g. `createTransferTransaction` / `createBuyTransaction` / `createConvertTransaction` → `sendTransaction`.
  3. **Functional demo** (deployed or runnable locally).
- Judging weights this track: UX 40%, prominent/innovative UA+7702 use 30%, adoption 20%, technical polish 10%. Winners may be considered for Particle incubation.

## Core concepts & primitives
- **Universal / unified balance** — `ua.getPrimaryAssets()` returns Primary Assets across all chains plus `totalAmountInUSD`. Primary Assets are the tokens (USDC/USDT/ETH/SOL/BNB etc.) the UA can spend as source liquidity.
- **Universal Liquidity** — cross-chain routing/bridging chosen automatically; you call the *same API as a single-chain tx*. No quotes/steps to manage.
- **Universal Gas** — gas paid automatically from the unified balance in any token; opt in with `tradeConfig.universalGas: true`.
- **One address across EVM + Solana** — owner EOA, EVM UA, and Solana UA addresses are exposed by the SDK.
- **Transaction builders** — `createTransferTransaction` (send/withdraw a token), `createBuyTransaction` / `createSellTransaction` (swap to/from a token using primary assets), `createConvertTransaction` (token conversion), `createUniversalTransaction` (arbitrary contract call with `expectTokens`). All return a `{ rootHash, userOps }` payload you sign, then `sendTransaction`.
- **Account modes** — **7702 mode** (EOA *is* the UA) vs **Smart Account mode** (separate ERC-4337 account with its own address).

## How you actually integrate it (minimal happy path)

**Install** (web/Node):
```bash
npm install ethers @particle-network/universal-account-sdk dotenv
```
Demo uses `@particle-network/universal-account-sdk@^1.0.24`. Needs Particle Dashboard `projectId`, `clientKey`, `appId`.

**Initialize in EIP-7702 mode** — the load-bearing flag is `smartAccountOptions.useEIP7702: true` (from `ua-reference/web/initialization.mdx` and the real demo `app/page.tsx:220`):
```ts
import { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } from "@particle-network/universal-account-sdk";

const ua = new UniversalAccount({
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID!,
  projectClientKey: process.env.NEXT_PUBLIC_CLIENT_KEY!,
  projectAppUuid: process.env.NEXT_PUBLIC_APP_ID!,
  smartAccountOptions: {
    useEIP7702: true,            // <-- 7702 mode: the EOA itself becomes the UA
    name: "UNIVERSAL",
    version: UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: owner,          // the embedded-wallet EOA address
  },
  tradeConfig: { slippageBps: 100, universalGas: true },
});
```
Set `useEIP7702: false` for Smart Account mode. (The 5-min Node quickstart uses a simpler *flat* config — top-level `ownerAddress`, no `smartAccountOptions` — so prefer the nested form above when you must prove 7702 mode.)

**Read the unified balance:**
```ts
const primaryAssets = await ua.getPrimaryAssets();
console.log("Unified balance (USD):", primaryAssets.totalAmountInUSD);
```

**ONE cross-chain value move — full 7702 browser flow** (real demo `app/page.tsx` + `lib/eip7702.ts`, Privy embedded wallet):
```ts
const { signAuthorization } = useSign7702Authorization(); // Privy hook
const { signMessage } = useSignMessage();

// 1. Build the cross-chain tx (here: buy a token on the dest chain from pooled assets)
const transaction = await ua.createBuyTransaction({
  token: { chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: tokenAddress },
  amountInUSD: "5",
});

// 2. Sign any pending EIP-7702 delegations carried inside the userOps
const authorizations = await handleEIP7702Authorizations(
  transaction.userOps, signAuthorization, embeddedWallet.address,
);

// 3. Sign the transaction rootHash (standard personal_sign)
const { signature } = await signMessage({ message: transaction.rootHash },
  { address: embeddedWallet.address });

// 4. Broadcast — pass authorizations as the 3rd arg in 7702 mode
const result = await ua.sendTransaction(transaction, signature, authorizations);
// → https://universalx.app/activity/details?id=${result.transactionId}
```
`handleEIP7702Authorizations` iterates `transaction.userOps`, and for each `userOp.eip7702Auth` that isn't yet `eip7702Delegated`, calls the provider's `signAuthorization({ contractAddress, chainId, nonce })`, serializes `{r,s,v}` via `ethers.Signature`, and de-dupes by nonce (`Reference/particle-universal-accounts-7702/lib/eip7702.ts`).

**Simplest value move (server/CLI, no 7702 wallet UI)** — `createTransferTransaction`, sign `rootHash`, send (`web-quickstart.mdx`):
```ts
const transaction = await ua.createTransferTransaction({
  token: { chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" }, // USDT
  amount: "0.1", receiver: "0xRECEIVER",
});
const signature = await wallet.signMessage(getBytes(transaction.rootHash));
const result = await ua.sendTransaction(transaction, signature);
```
The UA needs **no USDT or gas on Arbitrum** — liquidity is sourced from primary assets on any chain and routed automatically.

## EIP-7702 / account-abstraction relationship
- A UA is an **ERC-4337 smart account**. EIP-7702 is the *delegation mechanism* that lets the **plain EOA act as that smart account** without deploying a separate contract or moving funds.
- Delegation is a **Type-4 transaction** carrying an `authorizationList` signed by the EOA key. The SDK surfaces the work as `userOp.eip7702Auth` entries you sign **inline** during a transaction (no separate setup step), or you can pre-delegate per chain via `getEIP7702Auth([chainId])`. Check status with `getEIP7702Deployments()`.
- **7702 mode vs default (Smart Account) mode** — what changes:
  | | EIP-7702 mode (`useEIP7702: true`) | Smart Account mode (`useEIP7702: false`) |
  |---|---|---|
  | Address | **Same EOA address** is the UA | Separate smart-account address |
  | Onboarding | Sign one authorization, done | Must **transfer assets in** first |
  | Deployment | No new contract to deploy | Smart account created/attached |
  | Wallets | **Embedded/WaaS or server keys only** | Works with JSON-RPC wallets (MetaMask, etc.) |
- Docs state EIP-7702 is now the **default and recommended** mode.

## Surface support
- **Web — yes.** Primary target. Node 5-min quickstart + three Next.js 7702 demos (Privy, Dynamic, Magic). JS/TS SDK `@particle-network/universal-account-sdk`.
- **Browser extension (MetaMask/Rabby) — no for 7702 / partial overall.** Standard JSON-RPC wallets **cannot** produce the `signAuthorization` / Type-4 `authorizationList`, so they are unsupported in 7702 mode. They only work in *Smart Account mode*, which this track does not reward. A `<Warning>` in `eip7702-wallets.mdx` is explicit.
- **Mobile (React Native / native) — unknown/partial.** Particle ships iOS/Android/RN/Flutter SDKs, but those are Auth/Connect; the `universal-account-sdk` is JS/TS and no official native UA-7702 path is documented. Feasible via RN JS runtime + an embedded wallet exposing 7702 signing, but **(unverified)** for native.
- **CLI / server / headless — yes.** Docs: "7702 mode is only available in server-side environments and embedded wallets that support the authorization methods." Server signs with `wallet.authorizeSync(userOp.eip7702Auth)`; see `Particle-Network/universal-account-example/examples/7702-convert-evm.ts`.
- **AI-agent wallet — partial.** No dedicated "agent wallet" product, but the server-side pattern (a key signing `rootHash` + `authorizeSync` authorizations programmatically) maps cleanly onto an autonomous agent holding a key. Treat as a build-it-yourself fit, not a turnkey feature. **(unverified as an official use case.)**

## Gotchas / limits / open questions
- **V2 migration in progress (live warning on docs/quickstart):** UAs are upgrading to V2; users may need to **withdraw all funds from old accounts** (withdrawals only via `createTransferTransaction`). Confirm current account version before the hackathon demo. **(time-sensitive — verify at build time.)**
- **Supported 7702 providers are a short, verified list:** **Dynamic (WaaS)**, **Magic**, **Privy** — plus raw server keys. Pick one of these; do **not** plan a MetaMask-only 7702 demo.
- **Two different init shapes exist in the docs** — flat (`ownerAddress` top-level, Node quickstart) vs nested `smartAccountOptions.useEIP7702` (SDK reference + real demo). To *prove* 7702 mode to judges, use the nested form with `useEIP7702: true`.
- **`sendTransaction` takes a 3rd `authorizations` arg in 7702 mode** — omitting it on a chain that isn't yet delegated will fail; always build the array from `transaction.userOps`.
- **Signing is two signatures conceptually:** the 7702 *authorization(s)* (per pending nonce) AND the transaction *rootHash* (`personal_sign`). De-dupe authorizations by `nonce`.
- **Open question:** exact CHAIN_ID coverage and which chains support inline delegation vs pre-delegation — see `universal-accounts/chains.mdx` (demo scans Ethereum, BNB, Polygon, Arbitrum, Optimism, Avalanche, Base, Linea, Berachain, Sonic, Mantle).
- For **Arbitrum bonus stacking**: `CHAIN_ID.ARBITRUM_MAINNET_ONE` is first-class in the quickstart/demo, so a UA-7702 app settling on Arbitrum can target both the flagship track and the $2,000 Arbitrum bounty; pairing with Magic's embedded wallet (a verified 7702 provider) also lines up the $500 Magic bonus.

## Citations
- https://developers.particle.network/universal-accounts/cha/overview
- https://developers.particle.network/universal-accounts/cha/web-quickstart
- https://developers.particle.network/intro/introduction
- Docs repo `Reference/particle-docs-mintlify/` (HEAD `360327a`): `universal-accounts/ua-reference/web/initialization.mdx`, `.../eip7702-wallets.mdx`, `overview.mdx`, `web-quickstart.mdx`, `comparison.mdx`
- Demo repo `Reference/particle-universal-accounts-7702/` (HEAD `69df80e`): `app/page.tsx`, `lib/eip7702.ts`, `lib/buy-transaction.ts`, `lib/sell-transaction.ts`, `lib/particle-balances.ts`, `README.md`
- Other Particle 7702 demos: `Particle-Network/ua-dynamic-7702`, `Particle-Network/ua-7702-magic-demo`, `Particle-Network/universal-account-example` (server-side `examples/7702-convert-evm.ts`)
- Context7 library id: `/websites/developers_particle_network`
