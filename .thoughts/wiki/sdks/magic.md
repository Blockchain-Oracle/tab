# Magic (Magic Labs embedded wallets)

> Sources: https://docs.magic.link/home/welcome ; https://docs.magic.link/server-wallets/introduction ; https://docs.magic.link/uoa/overview ; https://docs.magic.link/recipes/server-wallets/alchemy-smart-wallets ; https://docs.magic.link/home/ai-assisted-docs (llms.txt) ; cloned repo `Reference/magic-docs/` (github.com/magiclabs/magic-mintlify-docs @ `7b38a09`) ; Context7 `/magiclabs/magic-mintlify-docs` ; installed `magic-sdk@33.9.0` types and the Phase 4 adapters/tests in `packages/sdk/src/{magic,magic-signer}.ts`. See ../../raw/sources.md.

## What it is
Magic (Magic Labs) is wallet-infrastructure: it spins up a real blockchain wallet for a user from an ordinary login — email one-time code, SMS, or a social account (Google/Apple/etc.) — so nobody installs MetaMask or writes down a seed phrase. There are two product families. (1) **Embedded Wallets**: a client-side SDK (`magic-sdk`) where the user's private key lives inside a Magic-hosted iframe (or secure enclave on mobile); after login you get a standard EVM/Solana provider you can hand to ethers/viem. (2) **Server Wallets**: backend wallets whose keys live in an **AWS Nitro TEE** (Trusted Execution Environment — tamper-resistant hardware enclave; the key never leaves it). You sign by sending the hash to a REST endpoint. Server Wallets are the headless / programmatic / AI-agent angle. **UOA (Unified Orchestration Accounts)** sits on top of Server Wallets to orchestrate multi-chain balances and perp-DEX deposits/withdrawals.

## Hackathon relevance
- **Magic Labs Bonus Challenge — $500** (single prize, "best and most creative implementation"). Open to any main track; independently judged.
- **EXACT requirement:** "Integrate Magic's **embedded wallet** within your application." Judged on: smooth onboarding/auth, creative use of Magic infra, UX polish/accessibility, consumer-ready product thinking, technical quality. Example ideas they list: walletless onboarding, AI/social apps with embedded accounts, email/Google login, mobile-first onboarding, "apps where users never need to install MetaMask."
- The literal bounty word is **embedded wallet** (the client SDK). Server Wallets + UOA + the Alchemy 7702 recipe are the differentiator for an AI-agent/headless story, but ship the client embedded-wallet login to be safe on the requirement. (See open questions.)

## Core concepts & primitives
- **Publishable key vs Secret key** — `pk_live_…`/`PUBLISHABLE_API_KEY` for frontend SDK init; `sk_live_…` Secret Key for backend / Server Wallets. ([express getting-started](https://docs.magic.link/server-wallets/express-api/getting-started))
- **DID token (Decentralized ID token)** — JWT returned by `loginWithEmailOTP`/OAuth; verify it server-side with the Admin SDK (Node/Python) to trust the user + wallet address.
- **`magic.rpcProvider`** — EIP-1193 provider exposed after login; wrap with viem `custom()` or ethers to send txs. The embedded wallet is a plain **EOA**.
- **Extensions** — `@magic-ext/oauth2` (social login), `@magic-ext/wallet-kit` (prebuilt React `<MagicWidget>` UI).
- **Server Wallet TEE EOA** — key generated/stored in AWS Nitro; you call REST (`https://tee.express.magiclabs.com`) with JWT + `X-OIDC-Provider-ID`. Two tiers: **Express API** (streamlined) and **Core API** (advanced: key sharding, custodial-or-non-custodial via `encryption_context`). Multi-chain: EVM, Solana, Bitcoin.
- **OIDC Provider ID** — you bring your own auth (Auth0/Firebase/NextAuth) and register it; Magic associates wallets to the JWT's user.
- **UOA** — `https://uoa-server.magic.xyz`; provisions wallets across Ethereum/Arbitrum/Polygon/Solana/Ink and unifies perp-DEX venues (Hyperliquid, Paradex, Extended, Nado, Polymarket) with transfer route-planning.

## How you actually integrate it (minimal happy path)
**Embedded wallet — email OTP + viem (this is what wins the $500):**
```bash
npm install magic-sdk viem
```
```javascript
import { Magic } from "magic-sdk";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";

const magic = new Magic("PUBLISHABLE_API_KEY", {
  network: { rpcUrl: "https://base-mainnet.g.alchemy.com/v2/KEY", chainId: 8453 },
});

// Passwordless login — no MetaMask. `did` is a JWT you can verify server-side.
const did = await magic.auth.loginWithEmailOTP({ email: "hello@example.com", showUI: true });
const info = await magic.user.getInfo();
const email = info.email;
const publicAddress = info.wallets.ethereum?.publicAddress;

// Hand the provider to viem to send transactions
const walletClient = createWalletClient({ chain: base, transport: custom(magic.rpcProvider) });
const [address] = await walletClient.getAddresses();
```
**Social login (Google) via OAuth extension** ([Context7 / oauth/implementation.mdx](https://docs.magic.link/embedded-wallets/authentication/login/oauth)):
```javascript
import { Magic } from "magic-sdk";
import { OAuthExtension } from "@magic-ext/oauth2";
const magic = new Magic("PUBLISHABLE_API_KEY", { extensions: [new OAuthExtension()] });
await magic.oauth2.loginWithRedirect({
  provider: "google",
  redirectURI: "https://your-app.com/oauth/callback",
});
```
**Fastest UI path — Wallet Kit prebuilt React widget** (`Reference/magic-docs/embedded-wallets/authentication/login/wallet-kit.mdx`):
```jsx
import { Magic } from "magic-sdk";
import { MagicWidget, WalletKitExtension } from "@magic-ext/wallet-kit";
const magic = new Magic("YOUR_API_KEY", { extensions: [new WalletKitExtension()] });
// render <MagicWidget /> — email OTP + OAuth + Farcaster + external wallet, no custom UI
```
**Server Wallet (headless) — get the EOA, then sign** (`Reference/magic-docs/recipes/server-wallets/alchemy-smart-wallets.mdx`):
```ts
// POST to Magic's TEE with the user's JWT; private key stays in the enclave.
const res = await fetch("https://tee.express.magiclabs.com/v1/wallet", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "X-Magic-Secret-Key": process.env.SERVER_WALLET_SECRET_KEY!,
    "X-OIDC-Provider-ID": process.env.NEXT_PUBLIC_OIDC_PROVIDER_ID!,
    "X-Magic-Chain": "ETH",
  },
  body: JSON.stringify({ chain: "ETH" }),
});
const { public_address: eoaAddress } = await res.json();
// Sign endpoints: /v1/wallet/sign/data (EIP-191/712 raw hash) · /v1/wallet/sign/eip7702
```

## EIP-7702 / account-abstraction relationship
Magic's embedded wallet is a **plain EOA** — Magic itself is not a bundler/paymaster/smart-account stack. You compose Magic (the signer) with an AA provider for 7702/4337 features. The official **Alchemy Smart Wallets recipe** wraps a Magic **Express Server Wallet** EOA in an **Alchemy EIP-7702 smart wallet**: because the key is in the TEE you implement a custom `SmartAccountSigner` whose `signMessage`/`signTypedData` proxy to `/v1/wallet/sign/data` and whose `signAuthorization` calls the dedicated `/v1/wallet/sign/eip7702` endpoint. Then:
```ts
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { alchemy, baseSepolia } from "@account-kit/infra";
const client = createSmartWalletClient({
  transport: alchemy({ apiKey: process.env.ALCHEMY_API_KEY! }),
  chain: baseSepolia, signer: signer as SmartAccountSigner,
  ...(process.env.ALCHEMY_GAS_POLICY_ID ? { policyId: process.env.ALCHEMY_GAS_POLICY_ID } : {}),
});
const result = await client.sendCalls({
  from: eoaAddress, calls,
  capabilities: { eip7702Auth: true }, // 7702 delegation: same address, batched, gas-sponsored
});
await client.waitForCallsStatus({ id: result.id });
```
Per the recipe: EIP-7702 = Type-4 tx that lets an EOA temporarily delegate to smart-contract code for one bundle — "same address, no counterfactual deployment," batched calls, optional paymaster gas sponsorship. The TEE returns `r`/`s` as **decimal strings**; convert to 0x-hex (`BigInt(dec).toString(16)`) before building the viem signature. Magic also has a Particle Network Universal Accounts recipe and legacy ZeroDev/Safe AA example repos.

## Tab Phase 4 integration status (2026-07-16)
- **Installed client shape:** Tab is pinned to `magic-sdk@33.9.0`. The EVM address is read from `getInfo().wallets.ethereum?.publicAddress`, not a top-level `publicAddress`; the email and address are validated before either becomes checkout identity.
- **Persistent login is deliberate:** checkout first calls `isLoggedIn()`. When true, it restores the buyer with `getIdToken()` + `getInfo()` and skips OTP. Headless email OTP (`showUI: false`, `deviceCheckUI: false`) runs only when there is no valid Magic session.
- **Retry throttling is Tab-owned:** Magic's documented headless events do not expose a retry-after value. A real `login-throttled` or `max-attempts-reached` event therefore arms Tab's existing 30-second minimum client cooldown; Start over and close/reopen resubmission remain disabled until it expires. Magic remains the authority if its server lockout lasts longer.
- **Tab sign-out is not Magic logout:** ordinary sign-out clears only Tab's `tab_session`. It must never call `magic.user.logout()`. Magic logout is reserved for a separate, explicit future “forget this device” action.
- **Signer boundary verified locally:** the Phase 4 adapter uses Magic's installed `wallet.sign7702Authorization(...)` surface for delegation and `personal_sign` for the Particle root hash. Local cryptographic tests recover both signatures to the authenticated Magic owner and reject mismatched response metadata or signer identity.
- **Money-movement boundary:** this verifies the installed API shape and local signer correctness, not a funded send. Buyer `sendTransaction` remains **BLOCKED (B-04)** until the funded live spike proves the complete execution and settlement path.

## Surface support
- **web** — **yes**. Primary surface. `magic-sdk` browser SDK, OAuth extension, Wallet Kit React widget, 30+ chains. ([welcome](https://docs.magic.link/home/welcome))
- **browser extension** — **unknown/likely no** (unverified). Magic's client model relies on a hosted iframe + OAuth redirects; not documented for extension/service-worker contexts. No official extension guide found.
- **mobile** — **yes**. React Native (`@magic-sdk/react-native-bare`, `@magic-sdk/react-native-expo`), native iOS (`magic-ios`), Android (`magic-android`), Flutter — all in the magiclabs org and docs.
- **CLI/server/headless** — **yes**. Server Wallets (Express + Core REST API) are purpose-built headless; keys in TEE, "no client-side dependencies (iframes, local sessions)." Admin SDK (Node/Python) for token verification. The *embedded* client SDK is browser/native only — for headless use Server Wallets.
- **AI-agent wallet** — **partial**. Strong building blocks: server-side programmatic signing (keys in TEE, no user in the loop after auth), an **x402 agentic-payments recipe** (gasless USDC via EIP-3009), UOA multi-chain + perp-DEX orchestration. But there is **no dedicated "AI agent wallet" product or branding**; the server-wallet overview lists no AI-specific features (unverified beyond the recipes).

## Gotchas / limits / open questions
- **UOA name mismatch:** the brief calls it "Universal/Onchain Accounts," but Magic's own docs (overview + llms.txt) say **Unified Orchestration Accounts**. Treat the brief's expansion as wrong.
- **Bounty scope:** the $500 requirement is literally the *embedded* wallet. A submission using **only** Server Wallets/UOA may not satisfy "embedded wallet" — ship the client login too, or confirm with organizers. (open question)
- **AA is external:** Magic gives you an EOA + signer; bundler/paymaster/7702-smart-account comes from Alchemy/Particle/ZeroDev. Budget for a second SDK if you want gasless/batched.
- **TEE signature format:** `r`/`s` returned as decimal strings → must hex-convert; EIP-7702 endpoint also returns `y_parity`.
- **Custodial vs non-custodial (Core API):** depends on how you manage `encryption_context`/key shards; docs explicitly say "consult legal professionals." (unverified for your jurisdiction)
- **Embedded wallet types:** historically Magic distinguished "Dedicated" (per-app key) vs legacy "Universal" embedded wallets; current welcome page only surfaces Server vs Embedded. (unverified — confirm if address-portability matters)
- **Repo caveat:** full `magic-js` clone was network-throttled and not completed; the `magic-mintlify-docs` repo was sparse-cloned (`server-wallets`, `recipes`, `uoa`, `embedded-wallets`) at `7b38a09`. SDK API surface above is corroborated by Context7 + live docs.
- **Installed types win for Tab:** older snippets that destructure a top-level `publicAddress` from `getInfo()` are stale for the pinned client. Use the nested Ethereum wallet entry documented in the dated Phase 4 status above.

## Citations
- https://docs.magic.link/home/welcome
- https://docs.magic.link/server-wallets/introduction · /server-wallets/express-api/getting-started · /server-wallets/express-api/eip-7702 · /server-wallets/core-api/overview
- https://docs.magic.link/uoa/overview · /uoa/getting-started
- https://docs.magic.link/recipes/server-wallets/alchemy-smart-wallets · /recipes/server-wallets/x402-payments
- https://docs.magic.link/embedded-wallets/authentication/login/email-otp · /login/oauth · /login/wallet-kit · /sdk/client-side/javascript
- llms.txt index: https://docs.magic.link/llms.txt (advertised at /home/ai-assisted-docs)
- Cloned repo: `Reference/magic-docs/` — github.com/magiclabs/magic-mintlify-docs @ `7b38a0901054b1980b7bd078ae6568bc7b3f8aef` (`7b38a09`)
- Context7 library id: `/magiclabs/magic-mintlify-docs` (2390 snippets)
