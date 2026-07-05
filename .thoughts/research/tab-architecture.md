# Tab — a Stripe-style embeddable crypto PayButton, architecture + doc-verification

> Reality-research for the "Tab" concept: an embeddable `<PayButton>` ("Tab") that lets any
> dApp/website accept a crypto payment with a Stripe-like drop-in, settling to a **third-party
> merchant** on Arbitrum out of a chain-abstracted buyer balance.
>
> Method: grounded in our domain wiki + the **cloned** Particle docs (`Reference/particle-docs-mintlify`,
> HEAD `360327a`) and the **cloned** 7702 demo (`Reference/particle-universal-accounts-7702`, HEAD
> `69df80e`), cross-checked against live Stripe docs, the x402 spec/Context7, and Particle's own
> UniversalX/Universal-Deposit prior art. Every load-bearing claim is cited. Anything not confirmed
> from a primary source is marked **(unverified)**.

---

## 0. TL;DR

A Stripe checkout has four parts: (1) a **client component** the merchant drops in, (2) a **hosted
payment surface** (login + pay) the provider runs, (3) a **merchant server** that creates a payment
intent and listens for a webhook, and (4) **settlement** on the provider's rails. Tab maps 1:1 onto
crypto: the drop-in is a `<PayButton>` React/script component; the hosted surface is a modal that does
**Magic email login → Particle Universal Account in EIP-7702 mode → `createTransferTransaction(receiver = merchant)`**;
the merchant runs a tiny server to mint a payment intent + receive a confirmation webhook; settlement
is an on-chain transfer that **lands the merchant's chosen token on Arbitrum (chain 42161)** sourced
cross-chain from whatever the buyer holds, **with the buyer holding no gas or token on Arbitrum**.

The "pay to an arbitrary third-party receiver, cross-chain-sourced, no gas pre-held" claim is **VERIFIED**
against Particle's `createTransferTransaction()` reference doc and the cloned demo. See §2.

---

## 1. The standard shape of an embeddable checkout SDK (Stripe), mapped to our stack

### 1a. What Stripe actually splits into

| Piece | Who runs it | What it is |
|---|---|---|
| **Client component** | Merchant embeds it | The **Payment Element** — "a secure, embeddable UI component" placed in the merchant's page, styled to their brand, that collects payment details. ([Stripe Payment Element](https://docs.stripe.com/payments/payment-element)) The **Payment Request Button** is the one-tap drop-in variant. ([Stripe PRB](https://docs.stripe.com/stripe-js/elements/payment-request-button)) |
| **Payment intent (server)** | Merchant server | "Your server creates a **PaymentIntent** and returns its client secret… Always decide how much to charge on the **server side**, a trusted environment, as opposed to the client." ([Payment Intents API](https://docs.stripe.com/payments/payment-intents)) |
| **Webhook / confirmation** | Merchant server (Stripe pushes) | "After the client confirms the payment… your server **monitors webhooks** to detect when the payment completes… Stripe sends a `payment_intent.succeeded` event." ([Payment Intents API](https://docs.stripe.com/payments/payment-intents)) |
| **Hosted modal option** | Stripe-hosted | **Embedded Checkout** / Checkout Session is a fully hosted form embedded via an iframe. ([Embedded Checkout](https://docs.stripe.com/checkout/embedded/quickstart)) |
| **Settlement** | Stripe rails | Card networks / bank settlement, abstracted entirely from the merchant. |

The load-bearing idea: **the merchant integrates a button + a server that creates the intent and
catches a webhook; everything sensitive (card entry, auth, settlement) is hosted by the provider.**

### 1b. Tab mapped onto Magic + Particle UA (7702) + Arbitrum

```
                          MERCHANT INTEGRATES                         TAB HOSTS / ORCHESTRATES
  ┌───────────────────────────────────────────┐   ┌────────────────────────────────────────────────┐
  │ <PayButton                                 │   │  Tab modal (iframe/portal):                      │
  │   intentId / amount / token / chain=42161  │──▶│   1. Magic email-OTP login  → embedded EOA       │
  │   merchantAddress />   (npm drop-in)        │   │   2. new UniversalAccount({useEIP7702:true,      │
  │                                            │   │        ownerAddress: magicEOA })                 │
  │ POST /tab/intent  → {amount, token,        │   │   3. ua.getPrimaryAssets() → unified balance     │
  │   receiver=MERCHANT_ADDR, chainId:42161}   │   │   4. ua.createTransferTransaction({              │
  │   returns intentId (server-decided price)  │   │        token:{chainId:42161, address:TOKEN},     │
  │                                            │   │        amount, receiver: MERCHANT_ADDR })        │
  │ POST /tab/webhook ← {intentId, txId,       │◀──│   5. sign rootHash (+ 7702 auth) → sendTransaction│
  │   status:"settled", receiver, amount}      │   │   6. Particle Universal Liquidity bridges/pays   │
  │   → fulfill order                          │   │        gas under the hood → settles on Arbitrum  │
  └───────────────────────────────────────────┘   └────────────────────────────────────────────────┘
```

**What the MERCHANT integrates (small surface, Stripe-parity):**
- The **drop-in `<PayButton>`** (a published npm/React component or `<script>` tag) — analog of the
  Payment Element / Payment Request Button.
- A **server endpoint to create the payment intent** — decides amount server-side (trust boundary,
  exactly Stripe's rule), and crucially **sets `receiver = the merchant's own address` and the desired
  settlement token + `chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE`**. This is the Tab equivalent of
  `stripe.paymentIntents.create({ amount, currency })`.
- A **webhook/confirmation receiver** — the merchant gets a callback (with `transactionId` and the
  `TransactionResult` token-movement proof, see §2c) to fulfil the order. Analog of `payment_intent.succeeded`.

**What TAB hosts (the heavy, sensitive parts — like Stripe's hosted form + settlement):**
- The **payment modal**: Magic **embedded-wallet email/OTP login** (no MetaMask, no seed phrase)
  ([Magic email-OTP](https://docs.magic.link/embedded-wallets/authentication/login/email-otp); wiki `../wiki/sdks/magic.md` p.23-43).
- The **Universal Account init in 7702 mode** (`smartAccountOptions.useEIP7702: true`) over the Magic EOA
  — Magic is a verified Particle 7702 provider (Particle ships a `ua-7702-magic-demo`; wiki `../wiki/sdks/particle-universal-accounts.md` p.115).
- **Balance read + transfer build + signing + broadcast**, and **cross-chain liquidity + gas
  abstraction** (Particle "Universal Liquidity" / "Universal Gas") — the buyer never bridges and never
  holds Arbitrum gas (wiki p.18-19; verified in §2).

**Net:** the merchant's job is ~Stripe-sized (button + create-intent + webhook). The wallet, login,
cross-chain routing, gas, and settlement are hosted/orchestrated. The one crypto-specific extra a
merchant supplies that Stripe hides is **their receiving address + chosen token/chain** — which is the
whole point of "settle to a third-party merchant."

---

## 2. VERIFY: a Universal Account can settle to an ARBITRARY third-party receiver, cross-chain-sourced, on Arbitrum, with no gas/token pre-held

**Verdict: VERIFIED from primary sources.** All five sub-claims hold.

### 2a. Exact function signature + params — `createTransferTransaction()`

From the cloned Particle docs, `universal-accounts/ua-reference/web/transactions/transfer.mdx` (page
title literally `createTransferTransaction()`, description: *"Send tokens to **any address** across
supported chains from a Universal Account"*):

```ts
import { CHAIN_ID, UniversalAccount } from "@particle-network/universal-account-sdk";

const transaction = await ua.createTransferTransaction({
  token: {
    chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE,                       // settle on Arbitrum
    address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",        // USDT on Arbitrum (merchant's chosen token)
  },
  amount: "0.1",            // human-readable string
  receiver: receiverAddress, // <-- ARBITRARY target address = the MERCHANT
});

const signature = await provider.signMessage(transaction.rootHash);
const result = await ua.sendTransaction(transaction, signature);
// → https://universalx.app/activity/details?id=${result.transactionId}
```

Param shape (from the same doc):
- `token: { chainId: CHAIN_ID, address: string }` — destination chain + token contract. Native asset
  uses `address: 0x0000000000000000000000000000000000000000`.
- `amount: string` — human-readable amount.
- `receiver: string` — **the target address; nothing constrains it to be `self`.** This is the
  third-party-merchant proof.

Returns `{ rootHash, userOps, ... }`; you sign `rootHash`, then `sendTransaction(transaction, signature)`.
(Source: `Reference/particle-docs-mintlify/.../transactions/transfer.mdx` lines 11-30.)

### 2b. "No gas / no token pre-held on the destination chain; sourced cross-chain"

Quoted verbatim from the same `transfer.mdx`:

> "Like other transactions, transfers **don't require the user to hold assets or gas tokens on the
> destination chain**—**liquidity and gas are abstracted** behind the scenes."

And our wiki's quickstart note (`../wiki/sdks/particle-universal-accounts.md` p.92): *"The UA needs **no
USDT or gas on Arbitrum** — liquidity is sourced from primary assets on any chain and routed
automatically."* The "Custom Payable" doc reinforces the cross-token/cross-chain sourcing: *"the SDK
ensures the account has the necessary ETH on Base—even if the user's assets are on other chains or in
different tokens (e.g., USDC, USDT)… cross-chain routing and token conversion under the hood"*
(`transactions/custom.mdx`).

So: **buyer funded on another chain (or in another token) → merchant's chosen token lands on Arbitrum,
buyer pre-holds nothing on Arbitrum.** Verified.

### 2c. Confirmed in the CLONED DEMO (not just docs)

The demo's "Withdraw USDC to an external address" path proves the **arbitrary-receiver** settlement
end-to-end, using the sibling builder `createUniversalTransaction()` with an explicit ERC-20
`transfer(to, amount)` to a user-typed `receiverAddress`
(`Reference/particle-universal-accounts-7702/components/TransferCard.tsx` lines 85-135):

```ts
const erc20Interface = new Interface([
  "function transfer(address to, uint256 amount) external returns (bool)",
]);
const transaction = await universalAccount.createUniversalTransaction({
  chainId: chainIdMap[selectedChain],
  expectTokens: [{ type: SUPPORTED_TOKEN_TYPE.USDC, amount: cleanAmount }],
  transactions: [{
    to: withdrawChainUSDCAddresses[selectedChain],
    data: erc20Interface.encodeFunctionData("transfer", [receiverAddress, amount6]), // ARBITRARY receiver
  }],
});
const authorizations = await handleEIP7702Authorizations(transaction.userOps, signAuthorization, walletAddress);
const { signature } = await signMessage({ message: transaction.rootHash }, { /* uiOptions */, address: walletAddress });
const sendResult = await universalAccount.sendTransaction(transaction, signature, authorizations); // 3rd arg in 7702 mode
```

This is the exact Tab settlement shape: **arbitrary `receiverAddress`, USDC `expectTokens`, signed with
a 7702 authorization, broadcast with the 3-arg `sendTransaction`.** `createTransferTransaction()` (§2a)
is the simpler equivalent for a pure token send; `createUniversalTransaction()` is what you reach for if
the merchant wants a contract-level call (e.g. an invoice/escrow contract, or to attach an order id).

Arbitrum chain-id mapping is confirmed in the demo: `42161: CHAIN_ID.ARBITRUM_MAINNET_ONE`
(`lib/buy-transaction.ts` line 15).

### 2d. 7702 mode init (the headline trick) is real in the demo

`Reference/particle-universal-accounts-7702/app/page.tsx` line 220-229:

```ts
const ua = new UniversalAccount({
  // projectId / clientKey / appId …
  smartAccountOptions: {
    useEIP7702: true,                                  // EOA itself becomes the UA
    version: process.env.UNIVERSAL_ACCOUNT_VERSION || UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: owner,                                // the embedded-wallet EOA (Magic, in Tab's case)
  },
});
```

### 2e. The confirmation payload the webhook can carry

`sendTransaction()` returns a `TransactionResult` with `transactionId`, `sender`/`receiver`, and a
`tokenChanges` block (`decr[]` deducted, `incr[]` received, `swaps[]` routes) plus `fees`
(`transactions/send-response.mdx`). That gives the merchant webhook a verifiable "what moved, to whom,
final balances" proof — the crypto analog of `payment_intent.succeeded`.

### 2f. Server-side variant (matters for the "merchant server" + agent angle)

The UA SDK runs headless in Node: build a transaction, sign `rootHash` with a raw key, send
(`ua-reference/web/backend.mdx`):

```ts
const result = await ua.sendTransaction(tx, wallet.signMessageSync(getBytes(tx.rootHash)));
```

This is what lets a **buyer-side agent** (or a server) pay a Tab without a browser popup — see §3's
agent-payable differentiator. Caveat from our wiki: pure-server 7702 needs a key/embedded wallet that
can produce the Type-4 `authorizationList`; standard JSON-RPC extension wallets **cannot** sign 7702
authorizations (wiki p.108, `eip7702-wallets.mdx`).

---

## 3. Prior art (be honest) + what makes Tab distinct

### 3a. Particle's own embeddable / chain-abstracted flows

- **UniversalX** — Particle's *own* fully chain-abstracted, non-custodial trading terminal, **public
  since 3 Dec 2024**. Users deposit/withdraw/trade *any token across 12+ EVM chains + Solana* on a
  unified balance, gas paid in any token, even Apple Pay/card on-ramp.
  ([UniversalX blog](https://blog.particle.network/universalx/);
  [whitepaper](https://whitepaper.particle.network/particle-network/abstraction-functionalities/universalx)).
  The cloned 7702 demo is effectively a mini-UniversalX (unified balance + buy/sell/withdraw). So
  "pay/trade any token any chain from one balance" is **already shipped by the sponsor** as an
  *end-user app* — not as a merchant-checkout dev tool.
- **Universal Deposit flow** — Particle documents a "deposit any token from any chain into your dApp's
  UA without manual bridging" pattern. Critically, per the primary doc it is **a code recipe, not an
  embeddable widget** — implemented with `UniversalAccount` + `createUniversalTransaction()` +
  `sendTransaction()`, reference repo `soos3d/universal-accounts-flow-demo` (`components/DepositSection.tsx`).
  ([deposit-flow doc](https://developers.particle.network/universal-accounts/how-to/deposit-flow), fetched).
  There is a `Particle-Network/universal-deposit` repo (surfaced in search; **exact contents unverified**).
- **"Pay any token any chain" checkout widgets generally** — the closest non-Particle analogs are
  cross-chain pay widgets (e.g. crypto on-ramp/checkout SDKs, x402 paywalls). x402 is the agent-payment
  standard, not a merchant *embeddable button* (see §3c).

**Honest read:** the *capability* (pay an arbitrary address, any-token/any-chain, gas-abstracted) is
not novel — it's Particle's core SDK surface and the beating heart of UniversalX. Tab is **not**
inventing chain abstraction.

### 3b. What makes Tab distinct — the framing, not the primitive

1. **Dev-tool / SDK framing (Stripe-for-crypto), not an end-user app.** UniversalX is a destination
   users go to; Universal Deposit is a recipe a dev hand-assembles. **Tab packages the merchant-checkout
   shape** — drop-in `<PayButton>` + hosted login/pay modal + create-intent endpoint + webhook — so a
   merchant integrates in Stripe-sized effort and **settles to their own address**. Particle ships the
   primitive and an app; nobody ships the *opinionated third-party-merchant checkout component*. The
   distinctive surface is the **integration shape**, not the on-chain mechanics.
2. **Third-party-merchant settlement as a first-class contract.** UniversalX/Universal-Deposit move
   value into the *user's own* UA. Tab's intent object pins `receiver = merchant`, token, and
   `chainId: 42161` server-side — turning "withdraw to an address" into "pay a payee," with a webhook
   the merchant can trust to fulfil orders.
3. **Agent-payable.** Because the same UA settlement runs **headless server-side** (§2f) and the
   x402 standard lets a payer answer an HTTP `402` with a signed payment, a Tab can be priced as an
   x402 resource: a buyer-side **AI agent** pays the Tab with no human at a popup. x402's facilitator
   **settles on Base, Polygon, Arbitrum, World, Solana** (Arbitrum included), USDC gasless via EIP-3009
   `transferWithAuthorization`. ([CDP x402](https://docs.cdp.coinbase.com/x402/welcome); Context7
   `/coinbase/x402`; wiki `../wiki/concepts/agent-wallets.md` §4.) This pairs the human-checkout button
   with an agent-checkout endpoint behind one "Tab" brand — a combination neither UniversalX nor a plain
   x402 paywall offers. **(The specific combo "x402 resource settled out of a chain-abstracted UA
   balance" is not documented by either vendor — treat the integration as our novel glue, unverified end-to-end.)**

### 3c. x402 architecture (for the agent-payable side), for reference

x402 reuses HTTP `402 Payment Required`: client hits a resource → server returns `402` + a
`PAYMENT-REQUIRED` header listing `accepts[]` (`scheme:"exact"`, `network:"eip155:42161"`, `amount`,
`asset`, `payTo`) → client retries with a signed payment payload header → the **resource server**
verifies via the **facilitator's `/verify`** and settles via **`/settle`** on-chain → resource is
returned. Drop-in middleware exists (`@x402/express` `paymentMiddleware`, `x402ResourceServer`,
`HTTPFacilitatorClient`). (Context7 `/coinbase/x402`: `specs/transports-v2/http.md`,
`docs/core-concepts/facilitator.md`; [CDP x402](https://docs.cdp.coinbase.com/x402/welcome).)
Note the header naming: x402 **v2** uses `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE`; older material shows
`X-PAYMENT` — **version-dependent, verify against the version you target (unverified which the judges' tooling expects).**

The mental model: **Tab's `<PayButton>` is the human path; an x402 endpoint is the agent path; both
resolve to the same `receiver = merchant` settlement on Arbitrum.**

---

## 4. Open questions / unverified

- **Tab is our concept**, not a shipped product — the architecture above is a design synthesis of
  verified primitives, not a documented Particle product.
- **`createTransferTransaction` full param surface** (e.g. optional `usePrimaryTokens` / `tradeConfig`
  overrides per-call) is only partially shown in docs; the `{ usePrimaryTokens }` 2nd-arg pattern is
  confirmed for `createBuyTransaction` (demo `lib/buy-transaction.ts` line 81), **not explicitly for
  `createTransferTransaction`** — verify before relying on token-selection for transfers. **(unverified)**
- **7702 + Magic embedded wallet** as the signer for a *hosted modal*: Magic is a listed 7702 provider
  and Particle ships `ua-7702-magic-demo`, but our cloned demo uses **Privy**; the Magic wiring is
  asserted from the wiki, **not exercised in the cloned code**. **(unverified in-repo)**
- **x402 out of a chain-abstracted UA balance** (agent pays an x402 Tab, settled cross-chain via UA):
  not documented by either vendor; our glue. **(unverified end-to-end)**
- **`Particle-Network/universal-deposit` repo contents** — surfaced in search, not inspected. **(unverified)**
- **x402 header/version specifics** and exact CDP-facilitator Arbitrum asset support at build time —
  recheck live (x402 is 2024-2026 and moving). **(time-sensitive)**

---

## Citations

**Stripe (checkout shape):**
- Payment Element (embeddable client component) — https://docs.stripe.com/payments/payment-element
- Payment Request Button (one-tap drop-in) — https://docs.stripe.com/stripe-js/elements/payment-request-button
- Payment Intents API (server-creates-intent; webhook `payment_intent.succeeded`) — https://docs.stripe.com/payments/payment-intents
- Embedded Checkout (hosted modal option) — https://docs.stripe.com/checkout/embedded/quickstart

**Particle Universal Accounts (verification):**
- `createTransferTransaction()` — cloned `Reference/particle-docs-mintlify/universal-accounts/ua-reference/web/transactions/transfer.mdx` (HEAD `360327a`); live https://developers.particle.network/universal-accounts/ua-reference/web/transactions/transfer
- `createUniversalTransaction()` (custom payable, cross-token/chain sourcing) — `.../transactions/custom.mdx`
- `sendTransaction()` response (`TransactionResult`, `tokenChanges`) — `.../transactions/send-response.mdx`
- Backend/headless signing — `.../web/backend.mdx`
- 7702 init `useEIP7702: true` — cloned demo `Reference/particle-universal-accounts-7702/app/page.tsx:220` (HEAD `69df80e`)
- Arbitrary-receiver settlement in demo — `Reference/particle-universal-accounts-7702/components/TransferCard.tsx:85-135`
- `42161 → CHAIN_ID.ARBITRUM_MAINNET_ONE` — `Reference/particle-universal-accounts-7702/lib/buy-transaction.ts:15`
- Context7 library id: `/websites/developers_particle_network`

**Particle prior art:**
- UniversalX (chain-abstracted trading terminal, public 2024-12-03) — https://blog.particle.network/universalx/ ; https://whitepaper.particle.network/particle-network/abstraction-functionalities/universalx
- Universal Deposit flow (code recipe, not a widget) — https://developers.particle.network/universal-accounts/how-to/deposit-flow

**Magic (login surface):**
- Embedded wallet email OTP — https://docs.magic.link/embedded-wallets/authentication/login/email-otp
- (Particle 7702 provider note) wiki `../wiki/sdks/magic.md`, `../wiki/sdks/particle-universal-accounts.md`

**x402 (agent-payable side):**
- CDP x402 overview (facilitator settles Base/Polygon/Arbitrum/World/Solana) — https://docs.cdp.coinbase.com/x402/welcome
- Spec + Express middleware + facilitator verify/settle — Context7 `/coinbase/x402` (`specs/transports-v2/http.md`, `docs/core-concepts/facilitator.md`)
- x402.org — https://www.x402.org/

**Our domain wiki:**
- `../wiki/sdks/particle-universal-accounts.md`, `../wiki/sdks/magic.md`, `../wiki/concepts/agent-wallets.md`, `../wiki/strategy/surface-feasibility.md`
