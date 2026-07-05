# Leash: x402 Auto-Pay Wallet Architecture
# Custody · Cap · Control · Particle UA Composition

Date: 2026-07-02  
Author: research pass (Claude)  
Status: facts cited; inferences marked ⚠️ inference

---

## Scope

"Leash" = an agent wallet that auto-pays x402 whenever an AI agent hits a 402 paywall.  
Design constraints: installs wherever the agent runs; no LLM; pure payer; spend cap + monitoring + kill switch; must use Particle UA in EIP-7702 mode; settle on Arbitrum One; USDC float (EIP-3009) on Arbitrum One.

This document resolves five architectural questions and proposes the cleanest custody model.

---

## 0. Baseline facts (verify before building)

**USDC on Arbitrum One supports EIP-3009 — CONFIRMED.**  
Circle's native USDC on Arbitrum One (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) implements `transferWithAuthorization` (EIP-3009) and `receiveWithAuthorization`. Circle's stablecoin-evm contracts implement EIP-3009 and ERC-2612 simultaneously across all their deployment chains including Arbitrum, Base, Polygon, Optimism, Avalanche, and Ethereum.  
Source: docs.cdp.coinbase.com/x402/network-support; circle.com blog on USDC authorization methods.

**CDP facilitator supports Arbitrum One — CONFIRMED.**  
The mainnet CDP facilitator at `https://api.cdp.coinbase.com/platform/v2/x402` lists Arbitrum One as a supported EVM network (alongside Base, Polygon, World). EIP-3009 compliant tokens (USDC, EURC) are the primary settlement token; Permit2 covers non-3009 ERC-20s.  
USDC on Arbitrum One is explicitly named in the facilitator docs.  
Source: docs.cdp.coinbase.com/x402/network-support.

> ⚠️ Inference: The research file `x402-tab-leash-mechanics.md` references "Base" as the canonical x402 float chain, consistent with the original x402 documentation which used Base as the primary example. **For Leash targeting Arbitrum One, the float should be on Arbitrum One, not Base.** Both chains are confirmed supported by the CDP facilitator; switching to Arbitrum One is a parameter change, not an architectural one. Recheck at build time whether CDP facilitator testnet coverage includes Arbitrum Sepolia or only Base Sepolia.

---

## 1. Where the signing key lives

### Two pure options

**Option A — Local key (key lives in the agent process)**  
The private key (or a derived sub-key) is stored on the agent's host machine — typically in an env var, `.env` file, or OS keychain. The x402 middleware (`wrapFetchWithPayment`) loads the key at startup, signs EIP-3009 in-process for each 402 response, and pays directly.

*Advantages:*
- Zero latency per signing operation (no network round-trip)
- Works offline/air-gapped
- Simple install: one env var, one npm install
- No external dependency for the critical payment path

*Disadvantages:*
- Key can be exfiltrated if the machine or process is compromised (including prompt injection into the host LLM that spawned the agent)
- Cap enforcement runs in the same process as the agent — a bug or adversarial prompt can bypass it
- Monitoring requires the agent to phone home; if the agent crashes or is offline, spend data gaps
- Kill switch = delete or rotate the local key, which requires either physical machine access or the agent itself cooperating

**Option B — Hosted key (MPC or TEE, API signing)**  
The signing key never lives on the agent's machine. Instead:
- The key is split (MPC: e.g. Coinbase CDP Server Wallets v2, GA July 24 2025, sub-200ms signing, 99.9% availability) or TEE-sealed (Magic Server Wallets/Nitro, Turnkey/Nitro, Privy/TEE + Shamir)
- The local Leash tool makes a signing API call per x402 payment; the hosted service enforces policy and returns the EIP-3009 signature (or rejects if cap exceeded)
- The signing credential exposed to the local machine is a short-lived API token or session key — not the underlying private key

*Advantages:*
- Policy (cap, allowlist, kill switch) enforced at the signing layer, independent of the agent process — a compromised agent cannot bypass it
- Spend data is in the hosted service's log by construction — dashboard sees every payment immediately
- Kill switch = one API call from the dashboard/mobile to disable the wallet or invalidate the session credential; takes effect atomically for all future signing requests
- Key cannot be exfiltrated from the local machine (only the session credential is present, and it can be revoked)

*Disadvantages:*
- ~200ms additional latency per x402 payment (network call to signing service) — acceptable for most API calls, but adds up for high-frequency micro-payments
- Dependency on hosted service availability (though CDP targets 99.9%; local fallback can queue)
- Slightly more complex install (need to provision wallet in hosted service + give agent a session credential)
- If hosted service is Coinbase CDP, you're trusting Coinbase's infrastructure; self-hosted MPC (e.g. Openfort OpenSigner, Turnkey self-managed) reduces vendor lock-in

### Which is right for a trustable capped agent wallet?

**Option B (hosted key) is the only correct choice for a product called "Leash."**

Reasoning: Leash's value proposition is *bounded authority* — the agent CAN'T exceed the cap even if it's compromised, hallucinating, or adversarially prompted. That guarantee is hollow if the cap check lives in the same process as the agent. Cap enforcement must be in an independent trust boundary. The hosted signing layer IS that trust boundary.

The install-anywhere requirement does NOT require the key to be local — it requires the local tool to be easy to install. These are separable. The local component is just an npm package; the key lives elsewhere.

> ⚠️ Inference: This is the same architecture Coinbase Agentic Wallets uses (CDP Server Wallets v2 as the signing backend; the local `npx awal` tool or MCP server is the install-anywhere interface). The pattern is proven at production scale.

---

## 2. Cap enforcement — where and how

**Established fact:** Particle UA 7702 mode has no on-chain session keys for spend caps. Session keys are Biconomy-v2.0.0-only (confirmed `Reference/particle-docs-mintlify/aa/guides/keys.mdx:17`). So cap enforcement for Leash is entirely app-layer or hosted-service-layer.

**The cap enforcement stack (defense in depth):**

| Layer | What it enforces | Bypassable by compromised agent? |
|---|---|---|
| Local middleware | Obvious sanity check (e.g. reject 402 > $X before even calling signing service) | Yes — same process |
| Hosted signing policy engine | Hard cap: refuses to sign if cumulative spend ≥ limit; per-payment max; allowlist | No — independent process |
| On-chain USDC balance | Hard floor: wallet runs dry, transfers fail on-chain | No — but this is the last resort, not a guardrail |

**The critical path for cap enforcement is the hosted signing service policy engine.** Every signing request carries the amount being authorized; the service increments an atomic spend counter and either produces a signature or returns 403 + cap-exceeded error. The local middleware surfaces this to the agent as a payment failure.

**Verified pattern:** Coinbase Agentic Wallets API enforces per-token spending allowances, session caps, and allowlists at the enclave/policy layer "before the enclave produces a signature." Turnkey enforces org-level policy inside the TEE at signing time. Openfort implements session keys with contract allowlist + spend cap + expiry via on-chain session key module (ERC-4337 specific; not usable with Particle UA 7702 mode directly, but the policy engine is available separately via OpenSigner).

**For Leash specifically:** Use the hosted signing service's policy engine as the authoritative cap enforcer. The local middleware reads the 402 response, calls the signing service with `{amount, asset, network, payTo, resource}`, and the signing service enforces: (a) per-payment max, (b) rolling session cap, (c) optional allowlist of payTo addresses. No cap logic needs to live in the local tool beyond a pre-flight sanity check.

---

## 3. Monitoring + revoke

### If key is local (Option A)
- Monitoring: agent must log each `X-PAYMENT-RESPONSE` receipt to an external store; if agent crashes, spend data is lost; dashboard polls the store
- Revoke: must reach the agent's machine to delete/rotate the key; if the agent is running autonomously in a cloud VM you don't control, revoke is operationally hard
- Kill switch from mobile: send a revoke signal to a backend that sets a flag; the local agent must periodically poll that flag and refuse to sign if revoked — but a compromised agent doesn't poll

### If key is hosted (Option B)
- Monitoring: every signing API call is logged server-side; dashboard has real-time spend data with no agent cooperation required; mobile reads the signing service's audit log
- Revoke: mobile or dashboard calls the hosted service's "disable wallet" or "invalidate session" endpoint; all subsequent signing requests for that agent's credential return 403 immediately; atomic, no machine access needed
- Kill switch from mobile: single API call to hosted service (e.g. `DELETE /v1/wallets/{id}/sessions/{sessionId}`) → propagates to all Leash instances using that credential within milliseconds

**Conclusion:** Monitoring and revoke are trivially solved by the hosted-key model and extremely hard to make reliable in the local-key model. The mobile dashboard for Leash MUST be built against the signing service's audit log, not the agent's local log.

> ✅ Supported by prior research: `x402-tab-leash-mechanics.md §5 Mobile` confirms "phone → backend → disable/rotate server key" is the correct revoke design, not an on-device 7702 signing path.

---

## 4. Particle UA composition — treasury vs float

**The float/treasury split (confirmed from prior research):**

```
┌───────────────────────────────────────────┐
│  Particle Universal Account (7702 mode)   │
│  = Owner EOA == UA address (same key)     │
│  = Unified balance across all chains      │
│  = Treasury / funding layer               │
│  → getPrimaryAssets() in USD              │
└───────────────┬───────────────────────────┘
                │  Top-up: createTransferTransaction
                │  { token: {chainId: ARB, address: USDC},
                │    amount, receiver: agent_address }
                │  (self-bridge from any chain)
                ▼
┌───────────────────────────────────────────┐
│  USDC float on Arbitrum One               │
│  Held at: agent EOA / 7702 UA address     │
│  (same address — 7702 mode unifies them)  │
│  = Direct x402 payer                      │
│  → Signs EIP-3009 transferWithAuthorization
│    per 402 invoice, gasless               │
└───────────────────────────────────────────┘
```

**Key facts:**
- In 7702 mode the UA address IS the owner EOA. So the float address == the UA address == the address that signs EIP-3009. One address, one key, two roles: treasury (UA) and x402 payer (float). **No second wallet needed.**
- The UA treasury can be funded from any chain in any primary asset (ETH on Ethereum, USDC on Polygon, etc.). The SDK routes and settles to Arbitrum USDC at the agent's own address via `createTransferTransaction` with `receiver = agent_address`.
- x402 EIP-3009 signing uses the same private key as the UA signing (`rootHash` personal_sign + `authorizationList`). In the hosted-key model, the signing service signs BOTH: the UA top-up transaction AND the per-payment EIP-3009 authorizations.
- The chain-abstracted unified balance is **invisible to the x402 facilitator**; the facilitator only checks `balanceOf(agent_address, USDC, Arbitrum)`. Pre-positioning the float is mandatory.
- **Top-up trigger:** when Arbitrum USDC float falls below a threshold (e.g. < $5), the Leash service triggers a UA `createTransferTransaction` to self-bridge more USDC. This top-up is the "at least one cross-chain value move via UA" required by the hackathon UA Track.

> ✅ Confirmed: USDC at `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` on Arbitrum One supports EIP-3009 (docs.cdp.coinbase.com/x402/network-support). CDP facilitator covers Arbitrum One at mainnet endpoint `https://api.cdp.coinbase.com/platform/v2/x402`.

> ⚠️ Inference: The UA top-up signing (7702 `authorizationList` + `rootHash`) and the x402 EIP-3009 signing require the SAME private key. In the hosted-key model, the signing service must support BOTH signing operations. CDP Server Wallets v2 support EIP-3009 signing via AgentKit's x402 native support — but they may not support Particle UA's specific `rootHash` + `authorizationList` signing format. This is a composition risk: you may need to use either (a) a generic signing service (Turnkey, Magic Server Wallets) that signs arbitrary messages, with the Particle UA SDK sitting above it for top-ups, OR (b) a raw private key in a managed secret (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) that Leash's backend fetches at startup — not a per-request API call, but a startup-time secret fetch with key material in memory. Option (b) is the path the Particle UA docs themselves recommend: "quickstart ships a runnable Node script loading `PRIVATE_KEY` from env ('dev/test only, use KMS in prod')."

---

## 5. Proposed architecture: local tool, hosted wallet backend

**The tension resolved:** "install-anywhere local tool" vs "hosted wallet with cap/monitor/revoke" are NOT mutually exclusive. The solution is a three-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Local Leash middleware (installs with the agent)  │
│  • npm install @leash/x402  (or pip install leash-x402)     │
│  • wrapFetchWithPayment(fetch, leashClient)                 │
│  • leashClient = { apiKey: LEASH_API_KEY }                  │
│  • On 402: parse requirements, call Leash signing service   │
│  • On cap exceeded: surface error to agent gracefully       │
│  Install config: one env var (LEASH_API_KEY)                │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTPS signing request
                           │  POST /sign/x402
                           │  { amount, asset, network,
                           │    payTo, nonce, deadline }
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: Leash signing service (hosted backend)            │
│  • Holds agent's private key (or MPC shares / TEE seal)     │
│  • Policy engine: enforce spend cap, per-payment max,       │
│    allowlist, kill switch flag                              │
│  • On approve: sign EIP-3009 transferWithAuthorization,     │
│    return signature to middleware                           │
│  • Audit log: every payment logged (amount, payTo,          │
│    txHash from receipt, timestamp)                          │
│  • UA top-up trigger: monitor float balance, auto-top-up   │
│    via Particle UA SDK when below threshold                 │
└──────────────────────────┬──────────────────────────────────┘
                           │  Read-only + control API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Dashboard / mobile (Leash control plane)          │
│  • Real-time spend feed from signing service audit log      │
│  • Set/update spend caps                                    │
│  • Kill switch: POST /wallets/{id}/disable → all future     │
│    signing requests for that apiKey return 403             │
│  • UA balance view: getPrimaryAssets() via Leash backend    │
└─────────────────────────────────────────────────────────────┘
```

**Key architecture decisions:**

1. **The LEASH_API_KEY (install config) is NOT the private key.** It's a session credential for the signing service. If it leaks, the attacker can spend up to the cap, but the private key and UA treasury remain safe. Revoke via dashboard.

2. **Private key management options (in order of security):**
   - **Production:** Key generated in TEE (Magic Server Wallets, Turnkey Nitro) or MPC (CDP Server Wallets v2); signing service makes API call to TEE/MPC signer; key never leaves secure hardware
   - **Hackathon/MVP:** Key loaded from AWS Secrets Manager / GCP Secret Manager at signing service startup; lives in memory only; never in agent process
   - **Dev/test only (per Particle docs):** `PRIVATE_KEY` env var on the signing service host (not the agent host)

3. **The signing service does double duty:** signs EIP-3009 for x402 payments AND signs Particle UA transactions for top-ups. It holds the key and speaks both signing formats. This is why a generic signing service (Turnkey, Magic Server Wallets with arbitrary message signing) is preferable to a purpose-built x402 signer.

4. **Particle UA SDK lives in the signing service, not in the local middleware.** The local tool never imports `@particle-network/universal-account-sdk`. The signing service imports it for top-up operations. This keeps the local middleware lightweight.

5. **For the hackathon demo:** the "signing service" can be a single Node.js server with the private key loaded from env. The architecture is still correct — the key is in the backend, not in the local tool. This satisfies the UA Track requirement (at least one cross-chain move via UA = the top-up) and demonstrates cap/monitor/revoke through the control plane.

---

## 6. Open questions (unresolved at research time)

| Question | Status | Action |
|---|---|---|
| Does the CDP facilitator support Arbitrum Sepolia (testnet) or only Arbitrum One (mainnet)? | Docs confirm Arbitrum One mainnet; testnet coverage unclear | Check docs.cdp.coinbase.com/x402/network-support at build time; may need to use Base Sepolia for testnet |
| "Universal Agent Accounts" (Particle roadmap, announced May 2026) — is the API available now or still roadmap? | Roadmap announced but availability unconfirmed | Check Particle docs + Discord before relying on it; do not assume it's buildable |
| Does Magic Server Wallets support signing the Particle UA `rootHash` (arbitrary message) AND the EIP-7702 `authorizationList` format? | Unverified — Magic docs confirm arbitrary EVM message signing but not the specific 7702 auth format | Test with a Magic Server Wallet before committing; fallback is raw key in memory |
| Can the local Leash middleware handle the async gap between "sign" and "receipt" without blocking the agent for bridge latency on top-ups? | ⚠️ Inference: top-ups are pre-triggered, not per-payment; the local middleware never waits for a bridge — it just fails if the float is empty | Design top-up trigger as asynchronous background job; local middleware surfaces "float empty" as an error |
| EIP-3009 `validAfter` / `validBefore` — what deadline does Leash set per payment? | x402 spec says `maxTimeoutSeconds`; EIP-3009 `validBefore` should be `now + maxTimeoutSeconds` | Set dynamically from the 402 response; do not hardcode |

---

## 7. Summary recommendation

**Custody model:** Hosted key (TEE or MPC) accessed via a Leash signing service backend. The local middleware installs with one env var (`LEASH_API_KEY`, a revocable session credential). Private key never touches the agent's machine.

**Cap enforcement:** Policy engine in the signing service, enforced before signing. Per-payment max + rolling session cap + optional payTo allowlist. Local middleware adds a sanity check but is not the enforcement boundary.

**Monitoring + revoke:** Audit log in the signing service; dashboard/mobile reads it directly. Kill switch = disable session credential via dashboard API; atomic, no machine access needed.

**Particle UA:** UA is the treasury (unified balance, funded from any chain). Float is pre-positioned USDC on Arbitrum One at the same address (7702 mode: EOA == UA == float address). x402 pays from float; signing service auto-tops-up when float < threshold via UA SDK. Both signing operations (EIP-3009 + UA rootHash + 7702 authList) use the same key, so the signing service signs both.

**The "install-anywhere" requirement is satisfied by the local middleware being a thin wrapper** (one env var, one npm install). The key, caps, monitoring, and kill switch all live in the hosted backend. This is the architecture that makes "Leash" a trustable capped agent wallet rather than a plain x402 fetch wrapper.

---

## Citations

- x402 network support (CDP facilitator, Arbitrum One, USDC EIP-3009): https://docs.cdp.coinbase.com/x402/network-support
- Circle USDC EIP-3009 / ERC-2612 multi-chain: https://www.circle.com/blog/four-ways-to-authorize-usdc-smart-contract-interactions-with-circle-sdk
- Coinbase CDP Server Wallets v2 GA (July 24 2025, sub-200ms, 99.9% SLA, Arbitrum support): https://www.coinbase.com/developer-platform/discover/launches/cdp-wallets-launch
- Coinbase Agentic Wallets (session caps, allowlists, enclave policy engine before signing): https://eco.com/support/en/articles/14845485-coinbase-agentic-wallets-explained
- Agent wallet custody models comparison (MPC, TEE, on-chain session keys): https://metamask.io/news/best-agentic-wallets-2026 ; https://www.openfort.io/blog/best-agent-wallets-for-developers
- 6 guardrails for AI agent spending (app-layer vs policy engine vs on-chain): https://fystack.io/blog/6-guardrails-to-limit-ai-agent-spending-on-payment-rails
- Particle UA + x402 + 7702 base facts: prior wiki `particle-universal-accounts.md`, `x402-tab-leash-mechanics.md`, `agent-wallets.md`
- x402 protocol on Arbitrum: https://phemex.com/news/article/x402-protocol-launches-on-arbitrum-for-aipowered-microtransactions-81450
- Particle Universal Agent Accounts (roadmap, announced May 2026): https://www.bitget.com/news/detail/12560605395506
- Turnkey (TEE/Nitro policy engine at signing): https://www.openfort.io/blog/best-agent-wallets-for-developers
- Openfort on-chain session keys + spend caps: https://www.openfort.io/blog/best-agent-wallets-for-developers
