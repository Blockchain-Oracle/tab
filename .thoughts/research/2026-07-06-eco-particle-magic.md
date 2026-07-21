# Ecosystem Re-Verification: Particle UA SDK + Magic (embedded + Server Wallets) — 2026-07-06

> Purpose: re-verify the two core wallet tools before wiring real integrations for the Tab reintegration.
> Method: npm registry inspection (`npm view`, tarball `.d.ts`/CHANGELOG of the actual published package), refreshed doc clones (`Reference/particle-docs-mintlify/` @ `360327a` = current `origin/main`; `Reference/magic-docs/` pulled `7b38a09` → `45d1eb2`), live WebFetch of docs/pricing pages, WebSearch.
> Prior state being checked: `.thoughts/wiki/sdks/particle-universal-accounts.md` + `.thoughts/wiki/sdks/magic.md`.

---

## TL;DR — the dangerous deltas

1. **Particle UA SDK went V2 GA a week ago** (`2.0.0` 2026-06-29; latest `2.0.3`). Our wiki + demo repo pin `^1.0.24`. The V2 migration flagged in the wiki is **done at the SDK level** — `2.0.3` removed all V1 support.
2. **Polygon is GONE from Universal Accounts V2.** `CHAIN_ID` is trimmed to exactly 6 chains: Solana, Ethereum, BSC, Base, X Layer, Arbitrum. This breaks the Leash "USDC float on Polygon rebalanced by UA treasury" leg. Base + Arbitrum legs are fine.
3. **`universalGas` was removed from `ITradeConfig`** (2.0.2). Our wiki init snippet (`tradeConfig: { slippageBps: 100, universalGas: true }`) no longer compiles on 2.x.
4. **Flat init form is dead**: top-level `ownerAddress` removed from `IUniversalAccountConfig` (2.0.3). Only the nested `smartAccountOptions` form works — the form the wiki already recommends.
5. **Particle live docs lag the SDK** (docs repo last commit 2026-06-16; SDK V2 shipped 2026-06-29). The quickstart still shows the flat init and the V2 migration warning. Trust the published package types over the docs.
6. **Magic Core API v1 retires 2026-07-31** (JWT-bound v2/TKMS replaces `encryption_context`). We use the **Express API**, which is unaffected — but do not build anything on Core v1.
7. **New Magic capability since our wiki: Policy Evaluation** for Express API server wallets — dashboard-enabled, rule-based signing controls (conditions on `to`, `value`, `chain_id`, etc.). Useful defense-in-depth for the Leash cap; does NOT replace our cumulative-spend 403 logic.

Everything else we depend on — `createTransferTransaction(receiver=…)`, `sendTransaction(tx, sig, authorizations)` 3-arg form, `UNIVERSAL_ACCOUNT_VERSION`, `useEIP7702: true`, `loginWithEmailOTP`, `/v1/wallet/sign/eip7702` — **verified intact**.

---

## 1) @particle-network/universal-account-sdk — current state

### VERIFIED (unchanged from wiki)

- **`UNIVERSAL_ACCOUNT_VERSION` still exported and still works** — now equals `"2.0.1"` (the V2 account version). `UNIVERSAL_ACCOUNT_VERSION_V2 = "2.0.1"` also exported.
  Source: `/tmp/ua-sdk-v2/package/dist/index.d.ts:23-24` (extracted from published `2.0.3` tarball).
- **`createTransferTransaction` unchanged**: `createTransferTransaction(payload: ITransferTransaction): Promise<ITransaction>` with `ITransferTransaction { token: {chainId, address}, amount: string, receiver: string }`.
  Source: `dist/index.d.ts:362` + interface at `:72-76`. Tab's `createTransferTransaction(receiver=merchant)` flow is intact.
- **`sendTransaction` 3-arg form unchanged**: `sendTransaction(transaction: ITransaction, signature: string, authorizations?: EIP7702Authorization[]): Promise<any>` where `EIP7702Authorization { userOpHash: string; signature: string }` and pending auths surface as `userOp.eip7702Auth { chainId, nonce, address }` + `eip7702Delegated` flag.
  Source: `dist/index.d.ts:366, 347-350, 237-243`.
- **7702 mode init unchanged**: `ISmartAccountOptions { name, version, ownerAddress, useEIP7702?, … }`; nested form with `useEIP7702: true` is the documented default ("EIP-7702 is the default mode for Universal Accounts"). JSON-RPC wallets still unsupported in 7702 mode; server-side + embedded wallets only.
  Source: `dist/index.d.ts:117-125`; `Reference/particle-docs-mintlify/universal-accounts/ua-reference/web/initialization.mdx` (Note + Warning blocks).
- **7702 helper methods intact**: `getEIP7702Deployments()`, `getEIP7702Auth(chainIds)`, plus `getPrimaryAssets()`, `getSmartAccountOptions()`, `getTransaction(s)`.
  Source: `dist/index.d.ts:359-373`.
- **Arbitrum One 42161 first-class** (`CHAIN_ID.ARBITRUM_MAINNET_ONE = 42161`) and **USDC is a supported primary token on both Arbitrum and Base** — Tab settling USDC on Arbitrum is safe.
  Source: `dist/index.d.ts:4-18`; `universal-accounts/chains.mdx` (availability table: Base = USDC/ETH, Arbitrum = USDC/USDT/ETH).
- **Server-side 7702 authorization pattern unchanged**: `wallet.authorizeSync(userOp.eip7702Auth)` → serialize signature → push `{userOpHash, signature}`; de-dupe by nonce.
  Source: `initialization.mdx` "About 7702 Mode" code block; `Particle-Network/universal-account-example/examples/7702-convert-evm.ts` (linked from docs).

### CHANGED (differs from wiki/research — the dangerous ones)

- **Current version is `2.0.3` (npm `latest`), released 2026-06-29.** V1 line ended at `1.1.1` (2026-04-23). Wiki + `Reference/particle-universal-accounts-7702/package.json:13` pin `^1.0.24` (2026-01-08) — six months and a major version stale.
  Source: `npm view @particle-network/universal-account-sdk version time dist-tags`.
- **UA V2 migration is DONE at the SDK level.** `2.0.0` made account version `2.0.1` the default; `2.0.3` **removed `UNIVERSAL_ACCOUNT_VERSION_V1` and all version-branching logic — "every account is now treated as v2."** New accounts (all Tab/Leash accounts) are V2-native; the docs' "withdraw all funds from old accounts" warning only concerns pre-existing V1 balances, which we have none of.
  Source: published `CHANGELOG.md` in the 2.0.3 tarball ([2.0.0], [2.0.3] entries); live warning still on https://developers.particle.network/universal-accounts/cha/web-quickstart (WebFetch 2026-07-06: "Universal Accounts are upgrading to V2… you need your users to withdraw all funds from their old (existing) account(s)").
- **BREAKING — chain list trimmed to 6 chains.** `CHAIN_ID` in 2.0.3: `SOLANA_MAINNET=101, ETHEREUM_MAINNET=1, BSC_MAINNET=56, BASE_MAINNET=8453, XLAYER_MAINNET=196, ARBITRUM_MAINNET_ONE=42161`. **Polygon, Optimism, Avalanche, Linea, Berachain, Sonic, Mantle are all gone** (wiki line 119 listed 11 chains — now wrong). Docs `chains.mdx` agrees with the SDK.
  Source: `dist/index.d.ts:4-11`; CHANGELOG [2.0.3] "trimmed CHAIN_ID … to the 6 supported chains"; `universal-accounts/chains.mdx`.
  **Impact: the Leash Polygon USDC float cannot be rebalanced by the Particle UA treasury.** DECISIONS.md routes floats to Base(primary)/Arbitrum/Polygon per CAIP-2 — the Polygon leg needs either (a) dropping, or (b) a non-UA top-up path (e.g., Circle CCTP, manual). Decision needed; not made here.
- **BREAKING — `universalGas` removed from `ITradeConfig`** (2.0.2), along with the PARTI-as-gas logic. Current `ITradeConfig`: `slippageBps?, solanaMEVTipAmount?, usePrimaryTokens?, addressLookupTableAccountAddresses?, priorityFeeRatio?, tokenPair?, mevProtection?, preferTokenType?`. Gas abstraction itself still works (paid automatically from primary assets, per `chains.mdx`) — only the PARTI-preference flag is gone. **Drop `universalGas: true` from all init code.** Note: stale doc pages (`reference-implementation.mdx`, `ua-course/lesson-1.mdx`, `ua-reference/web/backend.mdx`) still show it.
  Source: CHANGELOG [2.0.2]; `dist/index.d.ts:105-114`.
- **BREAKING — flat init removed.** `IUniversalAccountConfig` is now `{ projectId, projectClientKey, projectAppUuid, smartAccountOptions?, tradeConfig?, rpcUrl? }` — no top-level `ownerAddress` (removed in 2.0.3 as deprecated). The Node quickstart (`web-quickstart.mdx:77-84`) and the Magic how-to (`how-to/ua-magic.mdx`) still show the flat form — **it will not compile against 2.0.3.** Use the nested `smartAccountOptions` form (which the wiki already recommends for proving 7702 mode).
  Source: CHANGELOG [2.0.3]; `dist/index.d.ts:129-136`.
- **Primary token types trimmed to `SOL, ETH, BNB, USDT, USDC`**; `BTC` token type removed (2.0.2); unsupported token types now **throw before sending** instead of silently resolving. USDC unaffected.
  Source: CHANGELOG [2.0.0], [2.0.2]; `dist/index.d.ts:12-18`.
- **Default RPC endpoint corrected** to `https://universal-rpc-proxy.particle.network` (2.0.1); staging `https://universal-rpc-staging.particle.network`; `UNIVERSALX_RPC_URL` env var / `rpcUrl` config still override.
  Source: CHANGELOG [2.0.1]; `dist/index.d.ts:21-22`.
- **Bundle shrank ~530KB → ~46KB**; `UniversalError` now exposes `code`/`data` (structured JSON-RPC error fields) and no longer console-logs — build our error handling on `UniversalError.code/data`.
  Source: CHANGELOG [2.0.0], [2.0.0-beta.1/2].

### Docs-vs-SDK lag (meta-finding)

`Reference/particle-docs-mintlify` local HEAD `360327a` (2026-06-16) **equals `origin/main` after fetch on 2026-07-06** — i.e., the live docs themselves have not been updated since before V2 GA. The V2 migration warning, flat-init quickstart, and `universalGas` snippets on developers.particle.network are all stale relative to the published 2.0.3 package. **The published tarball types are the ground truth for integration.**

---

## 2) magic-sdk (embedded wallet) — current state

### VERIFIED (unchanged)

- **Current version `33.9.0`** (npm `latest`, released 2026-07-02). Active release cadence (33.8.0 same day).
  Source: `npm view magic-sdk version time dist-tags`.
- **`loginWithEmailOTP` is still the path**: `const did = await magic.auth.loginWithEmailOTP({ email, showUI })` — the email-otp doc page is byte-identical since our clone (`git diff 7b38a09..45d1eb2 -- embedded-wallets/authentication/login/email-otp.mdx` is empty).
  Source: `Reference/magic-docs/embedded-wallets/authentication/login/email-otp.mdx:18-25`.
- Embedded-wallet changes since our clone are additive only: passkey-as-a-factor / passkey MFA docs, iOS headless email OTP — nothing touching our flow.
  Source: `git log 7b38a09..45d1eb2` + `git diff --stat -- embedded-wallets`.
- **Pricing**: free **Developer** plan = $0, up to **1,000 Monthly Active Wallets**, unlimited signatures, email/SMS/social logins. Startup $99/mo (2,500 MAW). Plenty for the build.
  Source: WebFetch https://magic.link/pricing (2026-07-06).

---

## 3) Magic Server Wallets (Express API) — current state

### VERIFIED (unchanged)

- **Base URL `https://tee.express.magiclabs.com`** (AWS Nitro TEE; keys never leave the enclave).
  Source: `Reference/magic-docs/server-wallets/express-api/getting-started.mdx:11`.
- **Provisioning**: `POST /v1/wallet` with headers `Authorization: Bearer <user JWT>`, `X-Magic-API-Key` (or `X-Magic-Secret-Key`), `X-OIDC-Provider-ID`, `X-Magic-Chain: ETH|SOL|BTC` → `{ "public_address": "0x…" }`. **Idempotent**: one wallet per user+chain; repeated calls return the same address.
  Source: `server-wallets/express-api/wallet-operations.mdx:13-45`.
- **`/v1/wallet/sign/eip7702` EXISTS exactly as our research said**: `POST` body `{ chain_id, address, nonce }` → `{ r, s, y_parity }` with **r/s as decimal strings** (hex-convert for viem; doc ships a `decToHex` + `SignedAuthorization` example). Compatibility note lists Arbitrum + Base among supported networks.
  Source: `server-wallets/express-api/eip-7702.mdx:23-124`.
- Other signing endpoints intact: `/v1/wallet/sign/data` (`raw_data_hash`), `/v1/wallet/sign/message`.
  Source: `wallet-operations.mdx:52, 172`.
- **Setup prerequisites** (self-serve, no gating steps documented): Magic Dashboard signup → create app → get Publishable + Secret keys → configure an OIDC identity provider (Auth0/Firebase/NextAuth) to get the Provider ID → configure **Settings → Allowed Origins & Redirects** domain allowlisting.
  Source: `getting-started.mdx:14-34`.
- **x402 agentic-payments recipe still present** (`recipes/server-wallets/x402-payments.mdx`), alongside the Particle UA recipe (`recipes/server-wallets/particle-network-universal-accounts.mdx`) and Alchemy 7702 recipe.

### GA / pricing status — (partially verified)

- No "beta", "early access", or "waitlist" labels anywhere in the server-wallets docs (grep across the refreshed clone came back empty). Docs describe it as "production-ready infrastructure".
- The live pricing page lists **"Server Wallets (Core and Express)"** in the plan comparison table **without an explicit plan restriction**, implying availability on the free Developer tier — but the page does not spell out gating. **(unverified — confirm empirically the moment we provision the first Express wallet during the keys spike; that is Task #2 anyway.)**
  Source: WebFetch https://magic.link/pricing; `server-wallets/express-api/overview.mdx`.

### CHANGED (differs from wiki)

- **Auth header naming**: current docs lead with `X-Magic-API-Key`, with `X-Magic-Secret-Key` as the documented alternative ("You must provide either `X-Magic-API-Key` or `X-Magic-Secret-Key`"). Our wiki snippet showed only `X-Magic-Secret-Key` — still valid, but code should follow the current doc convention. Low risk.
  Source: `getting-started.mdx:44-58`.
- **NEW: Policy Evaluation for Express API** (docs section `server-wallets/express-api/policy/` — not in our wiki). Dashboard toggle ("Policy Evaluation" card in app Settings) + policy CRUD API. Policies = rules per signing method (`eth_signTransaction`, `personal_sign`, `eth_signTypedData_v4`) with conditions on fields from `ethereum_transaction` / `typed_data` / `system` (e.g., `value`, `to`, `chain_id`) and operators `eq/neq/lt/lte/gt/gte/in`. Two scopes: **Global** (hard block at signing time) and **Step-Up** (MFA, requires Embedded Wallet integration — NOT usable for pure Express API users).
  Source: `server-wallets/express-api/policy/evaluation.mdx`.
  **Leash relevance**: Global policies give TEE-side, per-transaction guardrails (e.g., cap per-tx `value`, allowlist `to`) as defense-in-depth under our hosted signer. They evaluate single transactions — **our cumulative spend cap (403 on overspend) remains our own server-side logic**, as decided.
- **Core API v1 → v2 (TKMS) migration**: **"Core API v1 will be retired on July 31, 2026"** — `encryption_context`/`recovery_key` flows die; v2 binds wallets to IdP JWTs (`auth_jwt` create, `op_jwt` + `access_key` sign) at `tee.magiclabs.com/v2/api/wallet`. The wiki's Core API description (key sharding, `encryption_context` custody nuance) is now describing a product with 25 days to live. **We use Express API — unaffected — but never touch Core v1.** The server-wallets introduction page now leads with Express API only.
  Source: `server-wallets/core-api/v1-to-v2-migration.mdx`; `git log 7b38a09..45d1eb2` (TKMS PR #122); `server-wallets/introduction.mdx`.

---

## 4) Particle Dashboard — signup + chain config

### VERIFIED

- **What you get at signup**: dashboard.particle.network → log in → create a project → create a **web application** inside it → copy **`projectId`, `clientKey`, `appId`** — exactly the three credentials `IUniversalAccountConfig` wants (`projectId`, `projectClientKey`, `projectAppUuid`).
  Source: `universal-accounts/ua-reference/web/initialization.mdx:18+` (step-by-step with screenshots); `universal-accounts/web-quickstart.mdx:24`.
- **No chain allowlist configuration is documented for Universal Accounts.** UA chain coverage is fixed by the SDK/account version (the 6 V2 chains), not by dashboard settings — nothing in the UA docs mentions enabling chains per project. Arbitrum and Base work out of the box; **Polygon cannot be enabled because UA V2 does not support it at all.**
  Source: grep across `universal-accounts/` for allowlist/whitelist/domain — only hit is the credentials accordion; `chains.mdx`.
- (unverified) Whether the dashboard enforces per-domain/origin restrictions on the `clientKey` for UA calls — not documented in the UA section. Check the dashboard UI when creating the project; harmless either way since we control the domains.

### Bonus finding for Tab

- `universal-accounts/how-to/ua-magic.mdx` is an **official Particle guide + demo repo for exactly our stack**: Magic Express API TEE wallet as the UA `ownerAddress` (`github.com/Particle-Network/universal-accounts-magic-wallet-api`). Caveat: its code is **stale vs SDK 2.x** (flat `ownerAddress` init; references `CHAIN_ID.AVALANCHE_MAINNET`, which no longer exists) — use it for architecture shape only, and write init/transfer code against the 2.0.3 types.

---

## 5) Action items for the reintegration (facts → consequences)

1. **Pin `@particle-network/universal-account-sdk@2.0.3`** (not `^1.0.24`). Re-derive any code copied from `Reference/particle-universal-accounts-7702/` against the 2.0.3 `.d.ts`.
2. **Init**: nested `smartAccountOptions { useEIP7702: true, name: "UNIVERSAL", version: UNIVERSAL_ACCOUNT_VERSION, ownerAddress }`; `tradeConfig: { slippageBps: 100 }` — **no `universalGas`**, **no top-level `ownerAddress`**.
3. **Leash floats**: keep Base (8453) + Arbitrum (42161) UA-rebalanced; **decide the Polygon leg** (drop vs non-UA top-up path). x402 402-response routing per CAIP-2 must not advertise a Polygon float unless we solve its top-up.
4. **Magic**: `magic-sdk@33.9.0`, `loginWithEmailOTP` unchanged. Server wallets: Express API only, `X-Magic-API-Key` header, `/v1/wallet` + `/v1/wallet/sign/eip7702` (dec→hex conversion). Evaluate enabling **Policy Evaluation** (Global scope) as defense-in-depth under the Leash cap.
5. **Verify empirically at the keys spike** (Task #2): Express wallet provisioning on the free tier (the one partially-verified gate left).

---

## Citations

- npm: `npm view @particle-network/universal-account-sdk` (latest `2.0.3`, 2.0.0 GA 2026-06-29; dist-tags `{beta: 2.0.0-beta.3, latest: 2.0.3}`) · `npm view magic-sdk` (latest `33.9.0`, 2026-07-02)
- Published package internals (2.0.3 tarball, extracted to `/tmp/ua-sdk-v2/package/`): `dist/index.d.ts`, `CHANGELOG.md`
- `Reference/particle-docs-mintlify/` @ `360327a` (== `origin/main` on 2026-07-06): `universal-accounts/chains.mdx`, `ua-reference/web/initialization.mdx`, `web-quickstart.mdx`, `how-to/ua-magic.mdx`, `reference-implementation.mdx`
- `Reference/magic-docs/` @ `45d1eb2` (pulled 2026-07-06 from `7b38a09`): `server-wallets/express-api/{getting-started,wallet-operations,eip-7702,overview}.mdx`, `server-wallets/express-api/policy/evaluation.mdx`, `server-wallets/core-api/v1-to-v2-migration.mdx`, `server-wallets/introduction.mdx`, `embedded-wallets/authentication/login/email-otp.mdx`, `recipes/server-wallets/x402-payments.mdx`
- Live: https://developers.particle.network/universal-accounts/cha/web-quickstart (V2 migration warning, WebFetch 2026-07-06) · https://magic.link/pricing (WebFetch 2026-07-06)
- WebSearch: [Particle blog — Monthly Update: All-In On 7702](https://blog.particle.network/monthly-update-all-in-on-7702/) · [Introducing EIP-7702](https://blog.particle.network/eip-7702/) · [npm package page](https://www.npmjs.com/package/@particle-network/universal-account-sdk)
- Demo repo pin evidence: `Reference/particle-universal-accounts-7702/package.json:13` (`^1.0.24`)
