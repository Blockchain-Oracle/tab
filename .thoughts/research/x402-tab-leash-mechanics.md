# x402 + Tab + Leash — Plain-English Mechanics Brief

For: Abu. Rule of this doc: facts only. Anything reasoned-but-not-doc-proven is in the ⚠️ line, never smuggled into the body.

Date: 2026-06-30

---

## 1. How your agent pays x402 (the consumer side)

You are only ever the **payer**. That is the light side of x402 — no facilitator to host, no seller endpoint to run. Concretely:

**The loop (this is the whole thing):**
1. Agent makes a normal HTTP call (e.g. `GET /paid-endpoint`).
2. Server replies **HTTP 402** with payment requirements. Canonical V1 shape is a JSON body: `{ x402Version, accepts: [paymentRequirements], error }`, where each requirement carries `scheme` (usually `"exact"`), `network` (`"base"` / `"base-sepolia"` or CAIP-2 `eip155:8453`), `maxAmountRequired` (atomic units), `asset` (USDC contract), `payTo` (recipient), plus `resource` / `maxTimeoutSeconds` / `extra`.
3. Client signs an **EIP-3009 `transferWithAuthorization`** over USDC. This is an **off-chain signature** — the payer spends **no gas**.
4. Client re-sends the same request with the base64 payment payload in the **`X-PAYMENT`** request header.
5. The seller hands the payload to a **facilitator** (`/verify` then `/settle`); the facilitator broadcasts the USDC transfer on-chain. The CDP hosted facilitator is `https://api.cdp.coinbase.com/platform/v2/x402`. **Your agent never broadcasts.**
6. Seller returns **200 + content** plus a settlement header (V1 `X-PAYMENT-RESPONSE`: base64 JSON with `success`, `txHash`, `network`) — that header is your receipt.

**Canonical integration shape — be decisive: it's SDK middleware, not a CLI, not an MCP server.**

The normal agent wraps its HTTP client **once** and every future 402 is handled transparently inside the loop:
- **V2 packages:** `@x402/fetch` (`wrapFetchWithPayment`) or `@x402/axios` (`wrapAxiosWithPayment`), plus a mechanism package `@x402/evm` (or `@x402/svm` for Solana). You build an `x402Client` and call `registerExactEvmScheme(client, { signer })`.
- **V1 equivalents:** `x402-fetch` (`wrapFetchWithPayment(fetch, walletClient)`) and `x402-axios` (`withPaymentInterceptor`).

When to deviate:
- **MCP-tool agents only:** if your agent calls tools over MCP, use Vercel's **`x402-mcp`** — wrap the MCP *client* with `withPayment({ account })`; the server side defines paid tools via `createPaidMcpHandler`. Use this *only* when the agent is MCP-based; otherwise the fetch/axios wrapper is canonical.
- **CLI:** exists in the ecosystem (e.g. QuickNode x402 RPC tooling) but is for humans/scripts, **not** the standard inner agent loop. Don't reach for it.
- **AgentKit / CDP:** not a separate payment protocol. They just supply the signer/wallet sitting *behind* the same fetch/axios/MCP wrapper.

**The signer:** a private key via viem `privateKeyToAccount`, or a CDP non-custodial/server wallet (`CDP_API_KEY_ID/SECRET`, `CDP_WALLET_SECRET`). It must hold USDC on the chosen network. Token default is USDC; networks are Base (primary) and Base Sepolia (testnet); the CDP facilitator also covers Polygon, Arbitrum, World, Solana.

**"See what it spent on my phone":** there is **no built-in consumer spend dashboard**. Every settled call returns a machine-readable receipt (`success`, `txHash`, `network`, amount), and each on-chain USDC transfer is independently auditable by `txHash`. So the phone view is *your* app logging each `X-PAYMENT` / settlement receipt to your own store — bookkeeping you assemble, not a product Coinbase ships.

> ✅ Verified: the request→402→sign→`X-PAYMENT`→facilitator settle→200 loop; field names (`scheme`/`network`/`maxAmountRequired`/`asset`/`payTo`); `X-PAYMENT` request + `X-PAYMENT-RESPONSE` receipt headers; SDK-wrapper (not CLI) as canonical, with package names `@x402/fetch`/`@x402/axios`/`@x402/evm`/`@x402/svm` (V2) and `x402-fetch`/`x402-axios` (V1); `x402-mcp` for MCP agents; USDC + gasless EIP-3009; signer options. ⚠️ Unverified: whether CDP/AgentKit ships a turnkey hosted *consumer* spend-dashboard UI (receipts + txHash exist, a first-party phone-ready ledger does not); exact V2 header/offer naming (`PAYMENT-REQUIRED` header / signed offers vs V1 body `accepts[]` + `X-PAYMENT-RESPONSE`) — V1 names are the most consistently documented and SDK-supported, and even the CDP welcome page showed `X-PAYMENT` vs `PAYMENT-SIGNATURE` labeling ambiguity.

---

## 2. Can it pay from the chain-abstracted balance?

**Short answer: No — not directly. Yes via a float. Caveat below.**

x402 settles **atomically**: the facilitator calls `transferWithAuthorization` on the **exact network named in the 402** and does an on-chain `balanceOf(from)` before it settles. So the USDC must **already sit at the payer's address on that chain** (e.g. Base). A Particle Universal Account's **chain-abstracted unified balance is invisible to the facilitator and too slow** for x402's one synchronous atomic transfer. You therefore **cannot "pay x402 straight out of the chain-abstracted balance."**

Two more hard facts that shape the wallet choice:
- EIP-3009 verifies the signature with **`ecrecover`** — it only accepts a **key-holding (externally-owned) address**. Standard USDC v2 does **not** accept EIP-1271 smart-contract signatures (ERC-7598 is the proposed, unshipped fix).
- Therefore a UA in **Smart-Account (ERC-4337) mode CANNOT pay** standard-USDC x402 at all (separate contract address, no recoverable key; tracked as coinbase/x402 issue #639, not the default).
- A UA in **EIP-7702 mode CAN pay** — but only because in 7702 mode the **UA address IS the owner EOA** (same address, key intact, no new contract deployed), so it produces an `ecrecover`-valid EIP-3009 signature. The 7702 UA pays via a **plain EOA 3009 signature on pre-positioned Base USDC**, not "through" the chain-abstraction layer.

**The realistic option (= Magic's documented recipe, Option A):** the agent holds a **small USDC float on Base** at its EOA / 7702 address and signs EIP-3009 **directly** per x402 call (no UA SDK in the payment path). Use the **Particle UA SDK separately** for big cross-chain moves and to **top up / replenish that Base float**. Works today, sub-second, lowest risk. Because 7702 makes UA address == owner EOA, **one address** can hold the Base float, sign x402 directly, AND be the Universal Account for cross-chain moves — no second wallet.

**Option B (UA-funded float, better "UA-Track" narrative):** before paying, use the UA SDK to route USDC from the unified balance onto Base **at the agent's own address** (self-bridge), wait for settlement, *then* sign EIP-3009. This lets you truthfully say the x402 spend was funded from the chain-abstracted balance — but it adds bridge latency (seconds–minutes), so you **pre-fund/batch**, not top-up per invoice. The x402 signature is still a plain EOA 3009 sig.

**The treasury framing:** chain-abstracted balance = the **funding/treasury layer**; the 7702/EOA Base float = the **direct x402 payer**.

> ✅ Verified: x402 `exact` EVM = EIP-3009 `transferWithAuthorization`, facilitator checks `from` has sufficient balance + token/network match + simulates the transfer, so USDC must be pre-held on the exact network; no cross-chain payment inside x402; EIP-3009 uses `ecrecover` not EIP-1271, standard USDC v2 rejects contract sigs (ERC-7598 unshipped); 4337 x402 support is an open feature request (#639); Magic recipe = TEE-backed Server Wallet EOA, USDC pre-held on Base, gasless EIP-3009 via `POST /v1/wallet/sign/data`; Particle 7702 mode reuses owner EOA address with no new contract. ⚠️ Unverified: no first-party "Particle UA × x402" doc exists — that a 7702 UA can sign x402 is *reasoned* from documented facts (7702 address == EOA + EIP-3009 needs ecrecover), not demonstrated; Option B's exact self-bridge builder call (fits `createTransferTransaction`/`createConvertTransaction` but the precise call unverified); whether x402's Permit2 path or any shipped USDC on Base could accept EIP-1271/ERC-7598 today (assumed no); that the unified balance is invisible to the facilitator is *inferred* from the on-chain `balanceOf(from)`.

---

## 3. How Tab works as a Stripe-style dev tool

Tab is **"Stripe Checkout for crypto,"** packaged as a developer tool. Tab itself is *our concept*, not a shipped Particle product — but the architecture is a synthesis of **verified Particle + Stripe + x402 primitives**.

**Merchant integrates X (Stripe-sized — three small things, 1:1 with Stripe):**
1. A drop-in **`<PayButton>`** component in the page (the analog of Stripe's Payment Element / Payment Request Button).
2. A **server endpoint that creates a payment intent** — decides the amount server-side and **pins `receiver` = the merchant's own address, the token, and `chainId` 42161 (Arbitrum)** (the analog of Stripe's `PaymentIntent` with server-side amount).
3. A **webhook** that consumes `transactionId` + `tokenChanges` to fulfil the order (the analog of `payment_intent.succeeded`).

The only crypto-specific thing the merchant supplies that Stripe hides is **their own receiving address + chosen token/chain**.

**Buyer does Y (all hosted by Tab, in a modal):**
- Logs in with **Magic email OTP** → a plain **embedded EOA** (no MetaMask, no seed phrase).
- That EOA is passed as `ownerAddress` into a **Particle Universal Account initialized with `smartAccountOptions.useEIP7702:true`** — the email wallet *itself* becomes the account: no new address, no deploy, no asset migration.
- Tab reads the buyer's **unified cross-chain balance** (`getPrimaryAssets`).

**Settlement Z:**
- `ua.createTransferTransaction({ token: { chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: TOKEN }, amount, receiver: MERCHANT })` returns `{ rootHash, userOps }`.
- Sign the `rootHash` (plus a 7702 authorization built from `userOps` in 7702 mode), then `ua.sendTransaction(tx, signature[, authorizations])`.
- **Particle Universal Liquidity** sources the payment from the buyer's primary assets on **any chain** (or a different token) and **pays gas from the unified balance**, so the buyer needs **no gas and no token pre-held on Arbitrum** — the merchant's chosen token still lands on Arbitrum.
- `sendTransaction` returns a **`TransactionResult`** (`transactionId`, sender/receiver, `tokenChanges` decr/incr/swaps, fees) — the verifiable confirmation payload the merchant webhook consumes.

**Agent path (optional, same `receiver`):** the same settlement runs **headless server-side**, so you can also expose the Tab as an **x402 resource**: server returns 402 + requirements (`network eip155:42161`, `asset` USDC, `payTo` merchant); a buyer-side agent answers with a signed payment header; facilitator `/verify` + `/settle` confirms on Arbitrum — no human popup.

**Prior art boundary:** Particle already ships **UniversalX** (a chain-abstracted *end-user trading app*) and a **Universal Deposit** code *recipe* — both move value into the user's **own** account. Tab's distinctness is the **merchant-checkout SDK framing** (drop-in button + hosted modal + intent + webhook, settling to a **third-party** address) plus the agent-payable x402 endpoint.

> ✅ Verified: `createTransferTransaction` accepts an arbitrary `receiver` ("Target address" / "any address"), `token={chainId,address}`, `amount=string` (transfer.mdx); transfers need NO assets/gas on the destination chain — "liquidity and gas are abstracted behind the scenes" (verbatim); `CHAIN_ID.ARBITRUM_MAINNET_ONE == 42161` (demo `lib/buy-transaction.ts:15`); `useEIP7702:true` with embedded EOA `ownerAddress` is real and used (demo `app/page.tsx:220-229`); arbitrary-receiver settlement exercised in the demo's withdraw flow (`components/TransferCard.tsx:85-135`); `sendTransaction` returns `TransactionResult` with `tokenChanges`+fees+`transactionId` usable as webhook proof; headless/server signing supported (`backend.mdx`); Stripe's embeddable shape; x402 facilitator settles on Base/Polygon/Arbitrum/World/Solana, USDC gasless via EIP-3009. ⚠️ Unverified: Tab is *our* concept, not a documented Particle product; the cloned official demo wires **Privy**, so the **Magic-as-7702-signer** modal path is asserted from the wiki, **not exercised in-repo**; `createTransferTransaction`'s optional token-selection 2nd arg is confirmed only for `createBuyTransaction`; "x402 resource settled out of a chain-abstracted UA balance" (the agent glue) is documented by **neither** Particle nor x402 — novel, unverified end-to-end; exact CDP-facilitator Arbitrum asset support and v2-vs-older header naming are time-sensitive (recheck at build time).

---

## 4. The two things we still must prove

**(a) Third-party settlement — needs a live spike (keys + funds).**
Sending `createTransferTransaction` to an arbitrary **external** receiver on Arbitrum, sourced cross-chain, is **fully documented** (transfer.mdx, web-quickstart.mdx, Context7 API doc). BUT the official cloned demo only exercises `createBuyTransaction` / `createSellTransaction` into the **user's own** UA — it never sets a third-party receiver. So external-receiver settlement is **doc-proven only** and still needs **one live run** with a funded UA actually landing USDT on Arbitrum at an external address sourced from another chain. No live transactions have been run. **Action: a funded live spike.**

**(b) Agent-key-as-user — ask the organizers (judging interpretation, not a tech blocker).**
A server-side **raw private key driving a UA in 7702 mode is a first-class documented path**: `initialization.mdx` says 7702 is only available in server-side environments and embedded wallets; the live server example builds `new Wallet(process.env.PRIVATE_KEY)` and signs the `eip7702Auth` + `rootHash` with **no human**. Mechanically, an agent-held key is a legit signer — **the docs never name who holds the key.** The open question is purely a judging call: **does an agent count as "the user's EOA"** that the UA Track requires? **Action: ask organizers before committing the narrative.**

Bonus blocker on framing: a clean **"human owns the UA, agent gets a scoped session-key leash"** story is **not available on a UA**. Particle **session keys are Biconomy-v2.0.0-only**; UA 7702 mode delegates the EOA to Particle's own Universal Account contract, so the Biconomy session-key module **cannot attach to a UA**. The leash is therefore either "agent owns the key" (carries the agent-as-user judging risk) **or** an **app-layer policy** (spend caps in the agent loop around a server-held key) — and whether judges accept app-layer policy as equivalent to a cryptographic delegation is itself unverified.

> ✅ Verified: external-receiver transfer is doc/API-shape proven (transfer.mdx, web-quickstart.mdx:107-131, Context7); the cloned Privy demo does only createBuy/createSell, never a third-party receiver; server-side 7702 with a raw key is documented first-class (initialization.mdx:124-162) and the live example `7702-convert-evm.ts` uses `new Wallet(process.env.PRIVATE_KEY)` + `wallet.signingKey.sign(hashAuthorization(...))` with no human; quickstart ships a runnable Node script loading `PRIVATE_KEY` from env ("dev/test only, use KMS in prod"); session keys are Biconomy-v2.0.0-only (`aa/guides/keys.mdx:17`). ⚠️ Unverified: end-to-end external-receiver settlement has NOT been run (needs a live, funded run); doc/code drift on the leash method name (docs `wallet.authorizeSync(...)` vs example `wallet.signingKey.sign(hashAuthorization(...))` — same outcome); whether judges accept an agent-held key as "the user's EOA" (docs silent — pre-empt in demo narrative); whether judges accept app-layer spend caps as equivalent to cryptographic session-key delegation.

---

## 5. Mobile

The phone is a **read + control client only — no on-device signing.** All signing happens **server-side** (the Leash path). The phone does three things:

- **Monitor:** read the unified balance via `ua.getPrimaryAssets()` and read activity via the explorer URL (`universalx.app/activity/details?id=transactionId`) returned by every `sendTransaction`. For x402 spend specifically, the phone reads the per-payment receipts (`amount`, `txHash`, `network`) your app logged.
- **Notify:** push alerts driven off those same balance/activity reads.
- **Revoke:** an **HTTP call to your own backend** that disables/rotates the server-held agent key or pauses the agent loop.

There is **no documented native / React-Native UA-7702 path** (the UA reference tree is web-only; the RN/iOS/Android/Flutter Particle SDKs are Auth/Connect/AA, not the universal-account SDK). That's fine, because the phone needs **no UA signing** — no EIP-7702 authorization and no `rootHash` signature ever happen on-device.

One sharp edge: a **true on-chain revoke driven from the phone** (re-delegating the EOA or rotating the key on-chain) **would** need a 7702-capable signer on-device, which is **undocumented** for UA. In Tab+Leash the agent key is server-side, so revoke is a **backend action** — but a phone-*signed* on-chain revoke is not a supported/documented path. Design the revoke as "phone → backend → disable/rotate server key," not "phone signs a revoke tx."

> ✅ Verified: a monitor+notify+revoke phone app needs no UA signing on-device — signing is server-side, the phone only reads (`ua.getPrimaryAssets`, the universalx.app activity URL) and calls a backend revoke action; no native/RN UA-7702 path is documented (UA reference is web-only; native Particle SDKs are Auth/Connect/AA). ⚠️ Unverified: native iOS/Android UA-7702 is undocumented and React-Native-via-JS-runtime is feasible-but-unconfirmed (no primary source); a true on-chain revoke signed *on the phone* would need an on-device 7702 signer, which is not a documented/supported path (so keep revoke as a backend action).
