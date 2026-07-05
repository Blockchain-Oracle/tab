# x402 wallet fit — can a Universal Account balance (or a raw server key) PAY x402 invoices?

> Reality-research, facts-first. Answers the wiki "Open question": *"Can an agent pay via x402 out of a chain-abstracted UA balance?"*
> Date: 2026-06-30.
> Primary sources: x402 v2 spec + exact-EVM scheme (`github.com/coinbase/x402`, Context7 `/coinbase/x402`), CDP x402 docs (`docs.cdp.coinbase.com/x402/welcome`), Magic x402 recipe (`docs.magic.link/recipes/server-wallets/x402-payments`), Particle UA wiki + docs, EIP-3009 / EIP-1271 / ERC-7598 primary refs. Every load-bearing claim cited inline.

---

## TL;DR (plainAnswer)

**Yes — but not "out of the chain-abstracted balance" the way the UA markets itself.** The thing that signs an x402 invoice is a plain **EOA-style ECDSA signature over an EIP-3009 `transferWithAuthorization`**, and the facilitator settles it **synchronously and atomically** by calling `transferWithAuthorization` on the token contract on the **exact network named in the 402 response**. So:

- A **raw server key (EOA)** that holds USDC on the required network (Base) **can pay x402 directly** — this is exactly Magic's documented recipe. ✅
- A **Particle UA in EIP-7702 mode** *can* be the payer **because in 7702 mode the UA address IS the EOA** (same address, private key intact) — so it can produce the EIP-3009 signature. ✅ **BUT** it can only pay against USDC **already sitting at that address on the exact x402 network**. The UA's cross-chain "unified balance / Universal Liquidity" is **invisible to the x402 facilitator** and too slow for x402's atomic settlement — so the chain-abstracted balance does **not** itself satisfy an x402 invoice. ⚠️
- A **Particle UA in Smart-Account (ERC-4337) mode** — separate contract address, no recoverable key — **cannot** pay standard-USDC x402, because EIP-3009 uses `ecrecover` (not EIP-1271). Smart-account/4337 support in x402 is a **proposed extension, not the default**. ❌ (for standard USDC today)

Net: have the agent hold a **small USDC float on Base at its EOA / 7702 address** and sign x402 directly; use the **UA SDK separately** for the big cross-chain moves and to **top up that Base float**. The UA is the funding/treasury layer; the x402 payment itself is a vanilla EIP-3009 EOA signature.

---

## 1. What x402 requires of the payer's wallet

x402's default money-movement scheme is **`exact` on EVM**, which is built on **EIP-3009 `transferWithAuthorization`** for USDC-family tokens (USDC, EURC). [`/coinbase/x402` exact-EVM spec; CDP docs]

**The payer must produce an EIP-712 typed-data signature over these fields** (Context7 `/coinbase/x402`, `specs/x402-specification-v2.md`):
```js
TransferWithAuthorization: [
  { name: "from",        type: "address" },   // payer address
  { name: "to",          type: "address" },   // payTo (resource server)
  { name: "value",       type: "uint256" },   // exact amount in token units
  { name: "validAfter",  type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce",       type: "bytes32" },
]
```
The signed `PaymentPayload` goes in the `PAYMENT-SIGNATURE` HTTP header; the facilitator verifies and **settles by calling `token.transferWithAuthorization(...)` on-chain**. [`specs/schemes/exact/scheme_exact_evm.md`]

**Does the payer need to already HOLD USDC on that exact network? YES.** The facilitator's verification logic is explicit (Context7 `/coinbase/x402`, exact-EVM spec, "Phase 2: Verification Logic"):
1. Signature recovers to `authorization.from`.
2. **"Verify the `client` has sufficient balance of the `asset`."**
3. Authorization params (amount, validity) match `PaymentRequirements`.
4. **"Verify the Token and Network match the requirement."**
5. **"Simulate `token.transferWithAuthorization(...)` to ensure success."**

The 402 response pins the network and asset (example from the spec):
```json
"accepted": {
  "scheme": "exact",
  "network": "eip155:84532",                         // Base Sepolia (8453 = Base mainnet)
  "asset":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC on that network
  "amount": "10000",
  "payTo":  "0x209693...",
  "extra":  { "assetTransferMethod": "eip3009", "name": "USDC", "version": "2" }
}
```
So the funds **must be the named asset, at the `from` address, on the named chain, at signing/settlement time**. There is **no cross-chain step inside the protocol** — "Clients and facilitators must explicitly support different `(scheme, network)` pairs" and the doc shows no cross-chain capability. [CDP x402 docs] CDP facilitator networks: **Base, Polygon, Arbitrum, World, Solana**. [CDP x402 docs]

**The critical signer constraint:** EIP-3009 `transferWithAuthorization` verifies the signature with **`ecrecover`** — i.e. it only accepts a signature that recovers to an **externally-owned (key-holding) address**. Circle's USDC v2 implements EIP-3009 this way and **does not** accept **EIP-1271** smart-contract-wallet signatures. The proposed fix is **ERC-7598** ("use contract signature for signed transfer"), an extension to ERC-3009 — **not yet in deployed USDC**. [ethereum.org EIP-1271 tutorial; eips.ethereum.org/EIPS/eip-7598; Alchemy "make your dapp compatible with smart contract wallets"]

> Consequence: the x402 payer must be a key-holding address (a plain EOA, or a 7702-upgraded EOA — both recover via `ecrecover` to the same address). A pure ERC-4337 contract account cannot sign standard-USDC x402.

x402 also lists **Permit2** for "any ERC-20 … for the smoothest experience use EIP-3009 tokens like USDC." [CDP x402 docs] Permit2 can support EIP-1271, but the default USDC happy-path is EIP-3009. (Permit2-for-smart-accounts is out of scope here; **unverified** for x402's facilitator.)

---

## 2. The tension, and the real options

**The tension is real and structural.** x402 wants *pre-positioned* USDC on *one specific chain*, settled in one atomic on-chain call within `maxTimeoutSeconds` (~60s). A Universal Account's entire value prop is the **opposite**: *not* pre-holding on any specific chain, and sourcing/bridging liquidity *just-in-time* across chains via Universal Liquidity (an async route that takes seconds-to-minutes and produces its own transaction). The x402 facilitator does a literal `balanceOf(from)` + `transferWithAuthorization` simulation on the target chain — it **cannot see** the UA's pooled balance and **cannot wait** for a bridge. So "sign once and let the UA source the USDC under the hood" is **not** how x402 settles.

### Option A — Float on Base + raw EOA EIP-3009 (recommended; this is Magic's recipe)
Agent keeps a **small USDC float on Base** at its EOA address. For each x402 call it signs a **plain EIP-3009 `transferWithAuthorization`** (no UA SDK in the path). Use the **UA SDK separately** for big cross-chain moves and to replenish the Base float when it runs low.
- Pros: works **today**, sub-second, matches the documented Magic + x402 recipe (§3). Lowest risk.
- Cons: you maintain a Base float (treasury management); the x402 payment doesn't showcase chain abstraction.

### Option B — UA tops up the float just-in-time, then sign
Before paying, call the UA SDK to **route USDC from the unified balance onto Base at the agent's address** (e.g. `createTransferTransaction` / `createBuyTransaction` / a self-bridge), **wait for settlement**, then sign the EIP-3009 authorization.
- Pros: you can truthfully say "the x402 spend was **funded from the chain-abstracted balance**." Good UA-Track narrative (cross-chain value move) + agentic x402 payment in one demo.
- Cons: **two operations + bridge latency** (seconds-to-minutes) per top-up, so you batch/pre-fund rather than top-up per-invoice. The x402 signature itself is **still a plain EOA 3009 sig**, not a UA userOp. Exact UA builder for "deliver USDC to my own Base address from pooled assets" should be confirmed against `createConvertTransaction`/`createTransferTransaction` semantics in 7702 mode (the unified balance is the *same EOA's* holdings, so this is a self-bridge). **(builder choice = inferred; verify.)**

### Option C — UA / smart account as the x402 payer *directly*
Not viable with standard USDC today. In **7702 mode** the "UA address" is the EOA, so a "direct UA payment" collapses into Option A/B (a 3009 EOA sig on pre-positioned USDC). In **Smart-Account mode** the separate 4337 contract can't produce an `ecrecover`-valid 3009 signature, and **x402 smart-account/4337 support is an open feature request** (`coinbase/x402` issue #639, "Enable EIP-4337 Smart Wallet / UserOperation Support") — **proposed, not shipped**. Third parties (Nevermined, thirdweb x402) are building programmable-x402 layers, but that's beyond the default facilitator. **(future / unverified for our stack.)**

### The elegant middle (why 7702 helps)
Because **EIP-7702 mode makes the UA address == the owner EOA**, *one address* can do both jobs: hold the **Base USDC float** and sign **x402 directly** (Option A/B), **and** be the **Universal Account** for cross-chain moves via the SDK. You don't need two wallets. But be precise in the writeup: the x402 invoice is paid by a **direct EIP-3009 EOA signature on pre-positioned Base USDC**, *not* "through" the UA chain-abstraction/Universal-Liquidity layer.

---

## 3. Magic's x402 recipe — what it actually shows

`docs.magic.link/recipes/server-wallets/x402-payments` (confirmed via WebFetch + Magic wiki page):

- **Wallet:** a Magic **Express Server Wallet** — a **TEE-backed server-side EOA** (key never leaves the AWS Nitro enclave). **Not** the client embedded wallet. So the recipe answers the "raw server key" half of our question directly: **yes, a server key pays x402.**
- **Scheme:** **gasless EIP-3009** — "x402 payments are gasless for the payer. The protocol uses EIP-3009 `transferWithAuthorization`," requiring only a typed-data signature, no ETH for gas.
- **Network:** **Base** — Base Sepolia (`eip155:84532`) for testing, Base mainnet (`eip155:8453`) for prod.
- **Payer holds USDC directly:** **Yes.** Prerequisite is literally "**USDC on Base Sepolia in the user's wallet**." (Confirms §1: pre-positioned USDC on the exact network.)
- **How it's wired:** authenticate → `POST /v1/wallet` to get the EOA address → build a viem account with `toAccount()` whose `signTypedData` proxies to the TEE → register the account with x402's `ExactEvmScheme` → `wrapFetchWithPayment(fetch, client)` for automatic 402 handling. On a 402, the client signs the gasless USDC authorization and retries.
- **Key signing endpoint:** `POST /v1/wallet/sign/data` ("sign a raw data hash / EIP-712 typed-data hash"); returns `r`, `s`, `v` → `serializeSignature()`. (Magic's TEE returns `r`/`s` as **decimal strings** → hex-convert before building the viem signature — per Magic wiki gotcha.)

**Takeaway:** Magic's recipe is the clean reference implementation of **Option A** — a headless server EOA holding USDC on Base, signing EIP-3009 for x402. It does **not** use chain abstraction or a UA to source the USDC; the float is assumed to already be on Base. (Magic also ships a separate **Particle UA recipe**, but that is the cross-chain UA flow, *not* wired into the x402 payment path — **unverified that any Magic doc combines UA-sourced liquidity into the x402 signature**.)

---

## 4. Documented vs inferred

**Documented (primary sources):**
- x402 `exact` EVM = EIP-3009 `transferWithAuthorization`; payer signs EIP-712; facilitator settles on-chain. [`/coinbase/x402` exact-EVM spec]
- Facilitator verifies `from` balance + token + network match + simulates the transfer → **USDC must be pre-held at `from` on the named network.** [same]
- No cross-chain payment inside x402; `(scheme, network)` pairs are explicit; networks = Base/Polygon/Arbitrum/World/Solana. [CDP x402 docs]
- EIP-3009 uses `ecrecover`, not EIP-1271; ERC-7598 is the (unshipped) extension for contract signatures. [ethereum.org; eips.ethereum.org/EIPS/eip-7598; Alchemy]
- Magic's x402 recipe = **server wallet (TEE EOA)** holding **USDC on Base**, gasless EIP-3009, sign via `/v1/wallet/sign/data`. [docs.magic.link]
- x402 4337/smart-wallet support is a **feature request**, not default. [`coinbase/x402` issue #639]
- Particle UA in 7702 mode: the UA address **is** the owner EOA (same address, no new contract). [Particle UA wiki / docs]

**Inferred / reasoned (not directly stated by a doc):**
- That a **7702 UA address can sign x402** follows from "7702 address == EOA with a recoverable key" + "EIP-3009 needs an `ecrecover`-valid signer" — both documented, but **no doc explicitly demonstrates Particle UA paying an x402 invoice.** (No "Particle UA × x402" integration doc was found; search returned only thematic blog overviews.)
- Option B's exact UA builder for "deliver USDC to my own Base address from pooled assets" (self-bridge) — pattern is consistent with `createTransferTransaction`/`createConvertTransaction`, but the **precise call in 7702 mode is unverified.**
- That the UA's unified balance is invisible to the x402 facilitator — follows directly from the facilitator doing on-chain `balanceOf(from)`/simulation; not stated as a "UA limitation" anywhere (no doc discusses the two together).

**Unverified / open:**
- Whether any shipped USDC deployment x402 uses accepts EIP-1271 (ERC-7598) — assume **no** on Base mainnet today.
- Whether x402's Permit2 path could let a smart account pay (Permit2 supports EIP-1271) — **unverified** against the CDP facilitator.
- Whether Particle exposes any first-party "x402" helper — **none found.**
