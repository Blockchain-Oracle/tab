# Openfort
> Sources: https://www.openfort.io/docs/overview ; https://www.openfort.io/docs/products/embedded-wallet/javascript/quickstart ; cloned repo `Reference/openfort-docs` (= github.com/openfort-xyz/openfort-js @ `b3618ac`) ; Context7 `/llmstxt/openfort_io_llms_txt`. See ../../raw/sources.md.

## What it is
Openfort is wallet infrastructure that lets your app give every user a **non-custodial wallet** without seed phrases. Users sign in with email or social login (Google, X/Twitter, Facebook) and instantly get a wallet that lives inside your product instead of a browser extension. Under the hood each wallet is a **smart account** (an on-chain account that can do programmable things like batch transactions, sponsor gas, and grant scoped "session keys"), and the private key is split into shares via Openfort's **Shield**/OpenSigner key-management system so neither Openfort nor you ever hold the full key. It ships SDKs for web, React, React Native, native mobile, Unity/Unreal, and a **server-side Node SDK** for backend-controlled wallets and automation.

## Hackathon relevance
- **Track:** General Track (Particle Network) → **Subtrack 1 — Openfort ($100)**. (`.thoughts/wiki/hackathon/tracks-and-prizes.md` line 21.)
- **Exact requirement to satisfy:** build "Any Web3 app with exceptional UX in any domain (payments, DeFi, AI, gaming, social)" where the experience is "seamless, intuitive, genuinely improved by the infra used" — and **choose the Openfort subtrack**, i.e. use Openfort as the wallet/AA layer that delivers that UX.
- Fits the broader hackathon EIP-7702 / account-abstraction theme: Openfort smart accounts natively support both ERC-4337 and EIP-7702 (see below).

## Core concepts & primitives
- **Embedded wallet** — in-app non-custodial wallet created at sign-up; the alternative to extension wallets. (`openfort.embeddedWallet.*`)
- **Smart account** — every embedded wallet is backed by an ERC-4337 or EIP-7702 smart account → batching, gas sponsorship, session keys, social recovery, upgradeability. `AccountTypeEnum = { EOA, SMART_ACCOUNT, DELEGATED_ACCOUNT }` (`sdk/src/types/types.ts:510`); `DELEGATED_ACCOUNT` is the EIP-7702 case.
- **Shield / OpenSigner** — non-custodial key management: keys generated client-side, split into shares, recovery tied to login + policies (not seed phrases). Self-hostable (no long-term vendor lock-in). Needs a separate `shieldPublishableKey`.
- **Session keys** — time-limited, revocable, permission-scoped keys for gasless/agent flows; created client-side via ERC-7715 `grantPermissions`, or server-side via `openfort.sessions.create` with `validAfter`/`validUntil`.
- **Gas policies / paymasters** — `feeSponsorship: <policyId>` on the EIP-1193 provider makes transactions gasless; policies are configured in the dashboard.
- **Backend wallets** — `@openfort/openfort-node` with a secret key for server-controlled accounts, session issuance, and automation.
- **Multichain** — `ChainTypeEnum = { EVM, SVM }` (`sdk/src/types/types.ts:516`); EVM and Solana supported.

## How you actually integrate it (minimal happy path)
Install (`@openfort/openfort-js` v1.5.0; Node ≥20, TS ≥5):
```bash
npm install @openfort/openfort-js
```
Init the client (`examples/apps/auth-sample/src/utils/openfortConfig.ts`):
```ts
import { Openfort } from '@openfort/openfort-js'
const openfort = new Openfort({
  baseConfiguration: { publishableKey: process.env.NEXT_PUBLIC_OPENFORT_PUBLIC_KEY! },
  shieldConfiguration: {
    shieldPublishableKey: process.env.NEXT_PUBLIC_SHIELD_API_KEY!,
    passkeyRpId, passkeyRpName, debug: true,
  },
  debug: true,
})
```
Social login — returns an OAuth URL you redirect to (`examples/apps/auth-sample/src/pages/register.tsx:198`):
```ts
import { OAuthProvider } from '@openfort/openfort-js'
const url = await openfort.auth.initOAuth({
  provider: OAuthProvider.GOOGLE,        // also TWITTER, FACEBOOK, ...
  redirectTo: `${getURL()}/login`,
})
window.location.href = url
// email/password + guest also exist:
// openfort.auth.signUpWithEmailPassword({ email, password, name, callbackURL })
// openfort.auth.logInWithEmailPassword({ email, password })
// openfort.auth.signUpGuest()
```
Create the embedded smart-account wallet (`OpenfortContext.tsx:308`):
```ts
import { AccountTypeEnum, ChainTypeEnum } from '@openfort/openfort-js'
const account = await openfort.embeddedWallet.create({
  accountType: AccountTypeEnum.SMART_ACCOUNT,
  chainType: ChainTypeEnum.EVM,
  recoveryParams,   // RecoveryParams: password or automatic (Shield) recovery
  chainId,
})
```
Get a standard EIP-1193 provider with gas sponsorship (`OpenfortContext.tsx:187`):
```ts
const provider = await openfort.embeddedWallet.getEthereumProvider({
  feeSponsorship: process.env.NEXT_PUBLIC_POLICY_ID,   // gasless via gas policy
  chains: { [appChain.id]: RPC_URL },
})
// drop into viem/wagmi/ethers; also: embeddedWallet.signMessage / signTypedData / exportPrivateKey
```
Session key — client-side via ERC-7715 (`components/SessionKey/EIP1193CreateSessionButton.tsx`):
```ts
import { erc7715Actions } from 'viem/experimental'
const walletClient = createWalletClient({ chain, transport: custom(provider) }).extend(erc7715Actions())
await walletClient.grantPermissions({
  signer: { type: 'account', data: { id: sessionKeyAddress } },
  expiry: 60 * 60 * 24,
  permissions: [{ type: 'contract-call', data: { address: '0x...', calls: [] }, policies: [] }],
})
```
Backend wallet + server-issued session (`examples/apps/auth-sample/src/pages/api/protected-create-session.ts`):
```ts
import Openfort from '@openfort/openfort-node'
const openfort = new Openfort(process.env.OPENFORT_SECRET_KEY!, { publishableKey, basePath })
await openfort.iam.getSession({ accessToken })          // verify the user's access token
const session = await openfort.sessions.create({
  account: account_id, policy: policy_id, chainId,
  address: sessionAddress, validAfter, validUntil,       // unix seconds
})
// openfort.sessions.revoke(...) ; openfort.accounts.list({ user })
```

## EIP-7702 / account-abstraction relationship
- Smart accounts support **both ERC-4337 and EIP-7702** out of the box (Context7 `/llmstxt/openfort_io_llms_txt`, "Embedded Wallet with Smart Accounts").
- The JS SDK implements EIP-7702 first-class: `sdk/src/utils/authorization.ts` ("EIP-7702 Authorization utilities … preparing and signing EIP-7702 authorizations", with `Authorization{address,chainId,nonce}` → `SignedAuthorization{r,s,v,yParity}`), and `sdk/src/wallets/evm/delegation.ts` detects on-chain delegation via the `0xef0100 ‖ address` designator prefix (23-byte code), noting a wrong/missing authorization causes the `AA24 signature error`.
- `AccountTypeEnum.DELEGATED_ACCOUNT` = an EOA delegated under EIP-7702; `SMART_ACCOUNT` = ERC-4337 contract account. Account implementations include `UPGRADEABLE_V5`/`UPGRADEABLE_V6` (`types.ts:89`).
- Dedicated repos: `openfort-xyz/openfort-7702-account` ("EIP-7702 Account Delegator"), `7702-Benchmark`, `sample-7702-WebAuthn`. Gasless is delivered via paymasters/bundlers (`feeSponsorship` policy id).

## Surface support
- **Web (JS/React):** **yes** — `@openfort/openfort-js` v1.5.0 (headless) and `@openfort/openfort-react` (UI + headless components, auth/connector/payments). Works with viem/wagmi/ethers via the EIP-1193 provider.
- **Browser extension:** **no** — Openfort is the *in-app* alternative to extension wallets (the docs explicitly contrast it with MetaMask). It can however *link/connect* external EOAs incl. extension wallets via wagmi connectors / `openfort-adapters`; it is not itself a browser-extension wallet.
- **Mobile (React Native / native):** **yes** — `@openfort/react-native` v1.1.4 (Expo peer deps: expo-secure-store, expo-web-browser, etc.; EVM + SVM per `react-native-auth-sample`); native iOS `swift-sdk`; also Unity (`openfort-csharp-unity`) and Unreal (`openfort-unreal-engine`).
- **CLI/server/headless:** **yes** — `@openfort/openfort-node` (secret-key server SDK: `iam`, `sessions`, `accounts`), `openfort-backend-quickstart`, plus self-hostable Shield/OpenSigner and a public `cli` repo. REST API documented in `swagger-api-doc`.
- **AI-agent wallet:** **partial/yes** — no single "agent SDK", but the documented pattern is **session keys on smart accounts** to "grant agents time-limited, revocable spending power without transferring custody" (Openfort blog) plus backend wallets for automation; Context7 lists "programmable accounts for … AI agents." Agent-oriented repos exist (`centaur`, `agent-skills`, `CrabTrap`).

## Gotchas / limits / open questions
- **Two key sets required:** Openfort publishable/secret keys *and* a separate **Shield** publishable/secret + encryption share. Non-custodial recovery needs a server route to mint a Shield **encryption session** (`/project/encryption-session`); if project 2FA is on, an OTP step (HTTP 428 → request OTP) gates it (`api/protected-create-encryption-session.ts`).
- **Session-key policy limits:** the client ERC-7715 path rejects `token-allowance`, `gas-limit`, `rate-limit`, and `native-token-transfer` policies/permissions for this account implementation (`sdk/src/wallets/evm/registerSession.ts` throws `INVALID_PARAMS`) — use `contract-call` permissions, or issue sessions server-side via `openfort.sessions.create`.
- **State is event-driven:** wallet readiness flows through `EmbeddedState` (`watchEmbeddedState({ onChange, pollingInterval })`); gate UI on `EmbeddedState.READY`.
- **Recovery is irreversible if shares are lost** — Shield encryption share must be stored securely at creation (dashboard warns once).
- No dedicated public "docs" git repo in `openfort-xyz`; canonical docs live at openfort.io/docs (the cloned `openfort-js` repo is the SDK + working Next.js sample). (unverified) exact list of supported OAuth providers beyond Google/Twitter/Facebook — confirm in dashboard "Auth providers".

## Citations
- https://www.openfort.io/docs/overview
- https://www.openfort.io/docs/products/embedded-wallet/javascript/quickstart
- Cloned repo: `Reference/openfort-docs` = https://github.com/openfort-xyz/openfort-js @ `b3618ac` (key files: `sdk/src/types/types.ts`, `sdk/src/utils/authorization.ts`, `sdk/src/wallets/evm/delegation.ts`, `sdk/src/wallets/evm/registerSession.ts`, `examples/apps/auth-sample/src/utils/openfortConfig.ts`, `.../contexts/OpenfortContext.tsx`, `.../pages/register.tsx`, `.../components/SessionKey/EIP1193CreateSessionButton.tsx`, `.../pages/api/protected-create-session.ts`)
- React Native pkg: https://github.com/openfort-xyz/react-native (`@openfort/react-native` v1.1.4)
- Context7 library id: `/llmstxt/openfort_io_llms_txt`
