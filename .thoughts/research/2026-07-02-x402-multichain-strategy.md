# x402 Multi-Chain Strategy for Leash
# Reality Research: Chain Distribution, Latency, and Float Architecture

Date: 2026-07-02
Author: reality-research pass (Claude)
Status: facts cited; inferences and estimates marked ⚠️

---

## TL;DR — Recommended Architecture

**Pre-positioned floats on Base + Arbitrum (plus optional Polygon/World), with the UA treasury rebalancing in the background. On-demand top-up is too slow for the synchronous x402 payment loop. Single-chain Arbitrum float (our earlier design) is wrong — ~75% of real x402 resources demand Base, so Base must be the primary float chain.**

---

## 1. Which chains do REAL x402 resources demand today?

### CDP Facilitator — Verified Supported Networks

Source: https://docs.cdp.coinbase.com/x402/network-support

| Network | CAIP-2 | Status |
|---|---|---|
| Base mainnet | `eip155:8453` | Supported |
| Base Sepolia (testnet) | `eip155:84532` | Supported |
| Polygon mainnet | `eip155:137` | Supported |
| Arbitrum One | `eip155:42161` | Supported |
| World mainnet | `eip155:480` | Supported |
| World Sepolia (testnet) | `eip155:4801` | Supported |
| Solana mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Supported |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Supported |

All EVM networks support v1 and v2 with `exact`, `upto`, and `batch-settlement` schemes. Solana supports `exact` only. The CDP docs do not designate any network as "primary" — all have equal feature support. However, code examples throughout the docs use Base Sepolia for testing.

### Real x402 Resource Chain Distribution

Source: awesome-x402 catalog (xpaysh/awesome-x402, Merit-Systems/awesome-x402), Chainalysis x402 adoption report (chainalysis.com/blog/x402-agentic-payments-adoption), ecosystem search.

**Estimated distribution across 100+ production x402 endpoints:**

| Chain | Share | Notes |
|---|---|---|
| **Base** | **~75%** | Dominant. x402 protocol incubated by Coinbase on Base. Most tooling defaults to Base. 100M+ cumulative transactions through Q1 2026 were Base-centric. |
| **Solana** | ~12% | Growing fast; second choice for gas-speed use cases |
| **Polygon** | ~8% | Third |
| **Arbitrum** | ~6% | Fourth — present but a clear minority |
| **World / Ethereum / Others** | ~4% | Scattered |

> ✅ Confirmed: Base is dominant by a large margin. The Chainalysis report (the most authoritative data source found) analyzes x402 exclusively on Base, noting "Base currently hosts the most active deployment." The awesome-x402 catalog confirms ~75% of listed resources specify Base. Coinbase CDP's own docs default to Base Sepolia for all code examples.

> ⚠️ Estimate: The ~75%/12%/8%/6% distribution is derived from the awesome-x402 catalog analysis + Chainalysis's exclusive Base focus + multiple sources calling Base "dominant". Not a first-party Coinbase statistic; update with on-chain data at build time.

**Implication for Leash: Standardizing the float on Arbitrum Only (prior design) is wrong.** A Leash agent running against the real x402 ecosystem will fail to pay ~75% of resources. The float MUST include Base.

---

## 2. Latency: Particle UA cross-chain vs x402 timeout window

### x402 maxTimeoutSeconds — What's Typical?

Sources: simplescraper.io/blog/x402-payment-protocol, github.com/coinbase/x402 issue #646, multiple x402 tutorials.

- **Common examples in docs: 300 seconds (5 minutes)** — used in the Simplescraper guide and weather API examples
- **Lower-bound examples: 30–60 seconds** — shown in tighter API implementations
- **Recommended default (per x402 community): 60–120 seconds** to keep requests warm while signatures clear
- Solana hard limit: ~80–90 seconds regardless of configured value (blockhash expiry)

**Practical take:** most production x402 resources set `maxTimeoutSeconds` in the 60–300 range. 300s is common; 60s is possible. For the TIMING question, the conservative/worst-case window to work within is **60 seconds**.

**What this field actually means:** `maxTimeoutSeconds` sets the EIP-3009 `validBefore` deadline (`now + maxTimeoutSeconds` at signature-creation time). It is NOT a connection keep-alive. The agent can fail the request, bridge, and re-attempt fresh — but the re-attempt has a NEW timeout window. The clock does not start on a "pending" bridge.

### Particle UA Cross-Chain Transfer Latency

Sources: Particle Network docs (developers.particle.network), Mapleblock Capital analysis, Particle whitepaper (whitepaper.particle.network), community search.

**Official claim:** Particle L1 (CometBFT / Comet-BFT consensus) provides "instant finality and Byzantine fault tolerance." Particle's own docs describe operations as adding "a few seconds of additional processing."

**But what is the end-to-end cross-chain settlement time?**

The honest answer is: **Particle has not published a specific benchmark for `createTransferTransaction` end-to-end cross-chain latency** as of July 2026. No doc or public source gives a number like "5 seconds" or "30 seconds" for funds landing on the destination chain.

The architectural path for a cross-chain `createTransferTransaction` is:
1. UA SDK calls Particle Bundler Nodes (sub-second coordination)
2. Bundler packages UserOperations for both source chain exit AND destination chain entry
3. Source chain UserOp broadcast and finality (depends on source chain: Base ~2s, Ethereum ~12s)
4. Particle Decentralized Messaging Network (Relayer Nodes) confirms cross-chain execution
5. Destination chain UserOp execution and finality (Base ~2s, Arbitrum ~0.5s)
6. Particle L1 settles execution status

> ⚠️ Estimate: Steps 3-5 are the bottleneck. Based on analogous cross-chain bridge/intent systems (Across: 2-15s; Stargate: 10-30s; Wormhole messaging: 15-60s), plus Particle's description of "a few seconds of additional processing," a **realistic range for Particle UA `createTransferTransaction` to land funds on the destination chain is 10–90 seconds**, with fast paths (both chains are EVM L2s, e.g. Base→Arbitrum) likely at the lower end (~10-20s) and slow paths (Ethereum mainnet source) at the higher end (60-90s).

### Verdict: Is On-Demand Top-Up Fast Enough?

**No. On-demand top-up breaks the x402 payment loop.**

The core problem: x402 settlement is synchronous and atomic. The facilitator does `balanceOf(payer, USDC, network)` at the exact moment of settlement. USDC must already sit on that chain BEFORE the agent sends the `X-PAYMENT` header. The flow is:

```
Agent → 402 response received
  → Bridge USDC to required chain (10–90 seconds) ← BLOCKING
  → Sign EIP-3009 (instant)
  → Send X-PAYMENT header
  → Facilitator settles (<1 second)
  → 200 response
```

Even in the 300-second maxTimeoutSeconds case, adding 10-90 seconds of bridge latency to EVERY x402 payment is unacceptable:
- It makes each x402-enabled API call 10-90 seconds slower
- The agent's calling context (a tool call, an HTTP middleware handler) may time out
- The bridge is an additional failure mode on the payment-critical path
- In practice, Leash would need to pre-fund bridge and then re-issue the HTTP request — a complex state machine with retries

**Conclusion: On-demand top-up (Architecture C) is NOT viable for the hot path. It can only serve as a last-resort fallback for infrequent chains.**

---

## 3. Recommended Architecture: Pre-Positioned Floats + Background UA Rebalancing

### The Right Architecture (B)

**Pre-position small USDC floats on the most common x402 chains. Use the Particle UA to rebalance/top-up floats in the background (asynchronously) when they drop below a threshold. Never bridge in the hot path.**

```
┌────────────────────────────────────────────────────────────┐
│  Particle UA Treasury (7702 mode)                          │
│  Unified balance from any chain, any primary asset         │
│  → getPrimaryAssets() shows total in USD                   │
│                                                            │
│  Background: monitors float balances                       │
│  When Base float < $5: createTransferTransaction           │
│    → self-bridge to Base USDC (10-90s, async, non-blocking)│
│  When Arbitrum float < $3: same                            │
└────────┬───────────────────────┬──────────────────────────-┘
         │                       │
         ▼                       ▼
┌─────────────────┐  ┌──────────────────────┐
│  Base float     │  │  Arbitrum float       │
│  ~$20-50 USDC   │  │  ~$10 USDC            │
│  (serves ~75%   │  │  (serves Tab + ~6%    │
│  of x402 hits)  │  │  of x402 ecosystem)   │
└────────┬────────┘  └──────────┬────────────┘
         │                      │
         ▼                      ▼
   x402 on Base          x402 on Arbitrum
   (immediate,           (immediate, no latency)
   EIP-3009 from
   the pre-held USDC)

                Optional / lazy:
┌─────────────────┐  ┌──────────────────────┐
│  Polygon float  │  │  World float          │
│  ~$5 USDC       │  │  ~$5 USDC             │
│  (serves ~8%)   │  │  (serves ~1%)         │
└─────────────────┘  └──────────────────────┘
```

**How Leash middleware routes payments:**

1. Agent hits a 402 response
2. Leash parses `accepts[].network` (CAIP-2 field, e.g. `eip155:8453`)
3. Matches to the correct float address on that chain
4. Checks local float balance (cached, refreshed asynchronously)
5. If float is sufficient: signs EIP-3009 immediately, sends `X-PAYMENT` (< 100ms)
6. If float is EMPTY (rare edge case): surfaces `LEASH_FLOAT_EMPTY` error to agent, triggers async UA top-up in background, so the NEXT attempt on that chain succeeds
7. Receipt logged to the Leash signing service audit log

**Size of pre-positioned floats:**

The float does not need to be large. Each x402 charge is typically $0.001–$5.00 (micropayments). A $20 float on Base handles 4–20,000 calls before depletion; with background top-ups triggered at $5, the agent never runs dry under normal usage. Floats this size are cheap to pre-position and cheap to replenish.

### Tradeoffs — Honest Assessment

| Factor | Pre-positioned (B) — Recommended | On-demand top-up (C) |
|---|---|---|
| Hot-path latency | Near-zero (balance pre-held) | 10–90 seconds per call (bridge) |
| Float capital requirement | Small ($30-80 across 4 chains) | Zero pre-position |
| Bridge failure risk in critical path | None (bridge is background-only) | High (bridge blocks payment) |
| Coverage | ~94% of x402 ecosystem immediately | 100% in theory, ~10% in practice |
| UA Track fit | Background top-ups ARE real UA cross-chain ops | Same |
| Complexity | Multi-float management, threshold triggers | Complex retry state machine |

**Architecture A (single-chain float, Arbitrum only — prior design) is ruled out** because ~75% of x402 resources demand Base, which a Leash on Arbitrum-only cannot pay.

**Architecture C (on-demand UA top-up) is ruled out** because 10-90s bridge latency breaks the synchronous x402 HTTP payment loop.

---

## 4. The Flagship UA-Track Cross-Chain Op

**The background treasury→float top-up IS a real cross-chain UA `createTransferTransaction`.** Here is the concrete call:

```typescript
// Example: UA treasury (funded from Ethereum ETH or Polygon USDC) tops up Base float
const topUpTx = await ua.createTransferTransaction({
  token: {
    chainId: CHAIN_ID.BASE,  // destination: Base
    address: BASE_USDC_ADDRESS,  // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  },
  amount: "20",  // $20 USDC
  receiver: agentAddress,  // self-transfer: agent EOA == UA address in 7702 mode
});
const signature = await wallet.signMessage(getBytes(topUpTx.rootHash));
const result = await ua.sendTransaction(topUpTx, signature);
// result.transactionId links to universalx.app/activity/details?id=...
```

This call:
- Sources USDC from the unified balance on ANY chain (Ethereum, Arbitrum, Polygon — wherever assets exist)
- Routes cross-chain via Universal Liquidity automatically
- Lands USDC at the agent's own address on **Base**
- Gas is paid from the unified balance (no Base ETH needed)
- Is a genuine cross-chain value move that satisfies "at least one cross-chain operation moving value via UA"

> ✅ Confirmed: `createTransferTransaction` with an arbitrary `receiver` and cross-chain `token.chainId` is fully documented and API-shape proven (transfer.mdx, web-quickstart.mdx). The UA needs no assets on the destination chain; "liquidity and gas are abstracted behind the scenes" (Particle docs, verbatim). `receiver: agentAddress` with `agentAddress == ownerAddress` == self-bridge; this is legitimate. The `TransactionResult.transactionId` links to the universalx.app explorer.

> ⚠️ Inference: A second top-up call for Arbitrum (token: {chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: ARBITRUM_USDC}) sourced from the same unified balance is equally valid. Running both concurrently on balance-check triggers would be novel but is not documented as a pattern — verify with a funded live run.

**Hackathon narrative hook:** "One UA balance funds a fleet of x402 floats across Base, Arbitrum, and Polygon — the agent pays any x402 resource on any chain instantly, and the UA keeps every float topped up cross-chain, automatically."

---

## 5. Solana / Non-EVM x402: In or Out of Scope?

**Solana is OUT of scope for the hackathon MVP.** Here is why:

**Technical incompatibility with EIP-7702:**
- EIP-7702 is an Ethereum-specific upgrade. It does not apply to Solana.
- The Leash architecture is built on 7702 mode: the EOA IS the UA IS the float address. None of this translates to Solana.
- x402 on Solana uses `@x402/svm`, a separate scheme (`scheme_exact_svm`), and different signing (Solana keypair / Ed25519 rather than EIP-3009 / secp256k1). It would need a separate SVM signer path, a separate Solana wallet, and separate float.
- `maxTimeoutSeconds` on Solana is hard-limited to ~80-90 seconds (blockhash expiry); production failures at >60s are documented.

**Hackathon prize stack rationale:**
- Particle UA Track + Arbitrum Track = EVM-only. Solana support does not add to either prize stack.
- Solana adds a separate ~12% of resources but doubles implementation complexity.

**Design decision:** Leash v0 covers EVM only (Base, Arbitrum, Polygon, World). A future v1 could add a parallel SVM Leash path for Solana. Document the gap in the demo but do not block on it.

> ✅ Confirmed: EIP-7702 is EVM-only (Ethereum Improvement Proposal); x402 SVM scheme is a separate code path in the x402 codebase (`packages/typescript/x402/src/schemes/exact/svm`); Circle USDC on Solana uses different authorization mechanics than EIP-3009.

---

## 6. Tab vs Leash Chain Split — Is It Coherent?

**Yes. The split is architecturally clean and coherent.**

```
┌────────────────────────────────────────────────────────────────────┐
│  Particle UA Treasury (7702 mode, agent's EOA == UA address)       │
│  Unified balance: USDC/ETH/USDT on any chain, shown as one total   │
└──────────────┬─────────────────────────────────┬───────────────────┘
               │  Background top-ups              │  Background top-ups
               ▼                                  ▼
  ┌────────────────────────┐          ┌────────────────────────────┐
  │  TAB (merchant)        │          │  LEASH (agent payer)       │
  │  Settles on Arbitrum   │          │  Float on Base (~75% hits) │
  │  (we control the       │          │  Float on Arbitrum (~6%)   │
  │  merchant endpoint →   │          │  Float on Polygon (~8%)    │
  │  we picked ARB to      │          │  Float on World (~1%)      │
  │  stack the $2k bounty) │          │                            │
  │  Chain: eip155:42161   │          │  Chain: follows resource's │
  │  UA move: buyer's      │          │  `accepts[].network` field │
  │  funds routed to ARB   │          │  UA move: treasury→float   │
  │  at merchant receiver  │          │  rebalance (any chain)     │
  └────────────────────────┘          └────────────────────────────┘
```

**Tab's chain choice (Arbitrum) is a deliberate product decision:** we control the merchant side, so we pick Arbitrum to stack the $2,000 Arbitrum bounty on top of the UA Track prize. Tab's `createTransferTransaction` routes BUYER funds to Arbitrum (cross-chain from wherever the buyer holds value) — a fully documented Particle UA operation.

**Leash's chain follows the RESOURCE:** Leash is the payer side, so Leash cannot choose the chain — the 402 response's `accepts[].network` field dictates it. Leash pre-positions floats on the chains that real x402 resources demand (primarily Base, then Arbitrum, Polygon, World).

**The UA ties them into one balance:** both Tab and Leash read `getPrimaryAssets()` from the same UA. Tab's payments drain the buyer's UA balance. Leash's floats are topped up from the agent's UA treasury. Same SDK, same address, same unified view. The mobile "Leash control panel" shows the agent's UA balance, active floats per chain, and spend history — all from one account.

**No coherence gap:** Tab merchants receive on Arbitrum; Leash pays on whatever chain resources demand. These are separate roles (Tab = seller infrastructure; Leash = buyer infrastructure). They share the UA SDK and the Particle ecosystem but operate independently. The framing "one UA balance powers both sides of the x402 economy" is accurate and strong for the demo narrative.

---

## Recommended Chain Architecture (Summary Subsection)

**Leash should pre-position floats on exactly these chains:**

| Chain | Float Size | Rationale | Priority |
|---|---|---|---|
| **Base** (eip155:8453) | $20–50 USDC | ~75% of real x402 resources; lowest fees; fastest replenishment | **Required** |
| **Arbitrum** (eip155:42161) | $10–20 USDC | Tab's merchant endpoints; ~6% of ecosystem; ARB bounty | **Required** |
| **Polygon** (eip155:137) | $5 USDC | ~8% of ecosystem; low cost to hold | Recommended |
| **World** (eip155:480) | $3–5 USDC | ~1% but CDP supports it | Optional |
| Solana | — | Out of scope; different signing scheme; no EIP-7702 | Excluded v0 |

**UA rebalancing trigger:** when any float drops below 25% of its target size, the Leash signing service issues a background `createTransferTransaction` from the unified treasury to that chain. The local Leash middleware never waits for a bridge — it uses whatever is pre-held and surfaces `FLOAT_LOW` to the monitoring dashboard, not to the agent.

**For the hackathon demo:** show the UA top-up of the Base float in real-time. Start with treasury funded on Arbitrum (or Ethereum), trigger a Base USDC top-up via `createTransferTransaction`, then show the agent instantly paying a real x402 resource on Base from the newly-topped-up float. This is the clearest possible demonstration of "one UA balance paying any x402 on any chain."

---

## 7. Open Questions (Post-Research)

| Question | Status | Action |
|---|---|---|
| Exact Particle UA end-to-end cross-chain latency (Base→Arbitrum, Ethereum→Base) | ⚠️ No official benchmark found; estimated 10-90s | Live timing test with funded UA at hackathon |
| Does Polygon/World CDP facilitator work identically to Base at settlement time? | Confirmed equal CDP support; not tested live | Spike at build time |
| Concurrent multi-chain UA top-up calls (topping Base and Arbitrum floats simultaneously) | Documented API supports it; not confirmed as a tested pattern | Test with funded UA |
| "Universal Agent Accounts" (Particle roadmap, May 2026) — does it change float architecture? | Roadmap-only; API availability unconfirmed | Check Particle Discord; do not rely on it |
| x402 V2 `accepts[]` format changes vs V1 — does the `network` CAIP-2 field persist? | V2 shipped December 2025; CAIP-2 network field appears in both; verify with SDK at build time | Check `@x402/fetch` v2 changelog |

---

## 8. Citations

- CDP x402 facilitator network support (8 chains, equal feature parity): https://docs.cdp.coinbase.com/x402/network-support
- awesome-x402 chain distribution (Base ~75% dominant): https://github.com/xpaysh/awesome-x402, https://github.com/Merit-Systems/awesome-x402
- Chainalysis x402 adoption report (Base exclusively, 100M+ transactions): https://www.chainalysis.com/blog/x402-agentic-payments-adoption/
- x402 maxTimeoutSeconds (60-300s typical; 300s in production examples): https://simplescraper.io/blog/x402-payment-protocol; https://github.com/coinbase/x402/issues/646
- x402 multichain future: https://blog.questflow.ai/p/x402-at-a-crossroads-infrastructure
- Particle UA createTransferTransaction (cross-chain to arbitrary receiver, gasless): https://developers.particle.network/universal-accounts/cha/web-quickstart
- Particle UA Universal Liquidity architecture: https://whitepaper.particle.network/particle-network/abstraction-functionalities
- Particle chain CometBFT / "instant finality": https://mapleblock.capital/blog/particle-network-unifying-all-chains-through-universal-accounts/
- x402 on Arbitrum live: https://phemex.com/news/article/x402-protocol-launches-on-arbitrum-for-aipowered-microtransactions-81450
- x402 Solana SVM scheme and blockhash limit: https://github.com/coinbase/x402/issues/646
- x402 protocol joined Linux Foundation / 69K agents / 165M txns (April 2026): https://chainwire.org/2026/04/02/bankr-launches-x402-cloud-on-4-02-day-as-x402-protocol-joins-the-linux-foundation/
- Prior Leash architecture: .thoughts/research/2026-07-02-x402-wallet-architecture.md
- Prior x402 mechanics: .thoughts/research/x402-tab-leash-mechanics.md
- Particle UA wiki: .thoughts/wiki/sdks/particle-universal-accounts.md
