# Story: Agent pays an x402 resource within cap
> Traces to: R-LEASH-2, R-LEASH-1, R-LEASH-3, R-LEASH-4, R-LEASH-5; AC-LEASH-1, AC-LEASH-2. Spec: .thoughts/specs/2026-07-02-tab-leash.md
> (Rewritten 2026-07-02 to reflect corrected Leash architecture: MCP stdio proxy + fetch wrapper interception, Magic Server Wallet TEE hosted signer, multi-chain USDC float routing per CAIP-2 network. Removed references to agent-held EOA key and single-chain Arbitrum float.)

As an agent owner,
I want my agent's x402-gated calls intercepted automatically — paid from the correct chain's pre-positioned USDC float via the Leash hosted signer — within my spend cap,
so that the agent operates across x402 resources on any supported chain without per-payment approval and without me managing private keys or chain routing.

---

## Acceptance Criteria

- **[AC-LEASH-1 / R-LEASH-2]** When the agent makes an MCP tool call that returns an x402 challenge, the Leash MCP stdio proxy intercepts the challenge. No CA certificate is required. (Primary path for Claude Code, Claude Desktop, Cursor, OpenClaude.)

- **[AC-LEASH-1 / R-LEASH-2]** When the agent issues an HTTP fetch that returns a 402 response, the Leash HTTP fetch wrapper (`@x402/leash-fetch`) intercepts the 402. (Covers all HTTP-based agents including Vercel-deployed agents.)

- **[AC-LEASH-1 / R-LEASH-1, R-LEASH-5]** After interception, the Leash server reads the `X-PAYMENT-REQUIRED` header and extracts the CAIP-2 network identifier (e.g., `eip155:8453` for Base, `eip155:42161` for Arbitrum One, `eip155:137` for Polygon). It selects the pre-positioned USDC float on that chain and submits the payment via the Magic Server Wallet TEE hosted signer. The agent host never holds a private key; the signer is entirely server-side (outside the agent process).

- **[AC-LEASH-1 / R-LEASH-5]** Pre-positioned USDC floats exist on Base (primary, ~75% of traffic), Arbitrum One (~8%), and Polygon (~6%). The routing decision is dictated by the CAIP-2 network field in the 402 challenge, not by a user preference. Solana is out of scope for v0.

- **[AC-LEASH-1 / R-LEASH-4]** After every successful x402 settlement, a receipt row is written to the persistent store containing: amount (atomic units + USD display), asset, CAIP-2 network, `payTo` (resource endpoint), `txHash` (from the `X-PAYMENT-RESPONSE` header), timestamp, trigger URL, and status `success`. The receipt appears in the spend dashboard within the dashboard's polling interval.

- **[AC-LEASH-1 / R-LEASH-4]** Failed or bounced payments are also logged with status `failed`. They do not increment the cumulative spend total. The ledger status enum is `success | failed | blocked`.

- **[AC-LEASH-2 / R-LEASH-3, R-LEASH-1]** Before submitting any x402 payment, the Leash hosted signer checks cumulative settled spend against the owner-set cap. If the proposed payment would push cumulative spend over the cap, the signer refuses to sign — no x402 call is submitted. Cap enforcement is server-side (in the hosted signer), not solely in the agent loop.

- **[AC-LEASH-2 / R-LEASH-3]** When a payment is blocked by the cap, the blocked attempt is logged with status `blocked` (distinct from `failed` — a `blocked` attempt never issued an x402 call; a `failed` attempt issued one and was rejected). A Tier 3 (interrupt) notification is emitted to the owner.

- **[AC-LEASH-2 / R-LEASH-3]** The cap block persists — no further payments are signed — until the owner raises the cap or resets the cycle from the spend dashboard.

---

## Scenarios

### Happy path: MCP tool call intercepted, paid from Base float

```
Given the owner has installed the Leash MCP server and configured their Leash API key
  And the Leash hosted signer holds sufficient USDC float on Base (eip155:8453)
  And the cumulative settled spend is below the owner-set cap after this payment
When the agent makes an MCP tool call that returns an x402 challenge with network eip155:8453
Then the Leash MCP stdio proxy intercepts the challenge (no CA cert required)
  And the hosted signer (Magic Server Wallet TEE) reads the CAIP-2 network field
  And routes the payment to the pre-positioned USDC float on Base
  And submits the x402 payment — the agent host never holds or sees a private key
  And the agent receives the 200 response with the protected resource
  And a receipt row is written with status "success", txHash, amount, network eip155:8453, payTo, timestamp
  And the receipt appears in the spend dashboard within the polling interval
```

### Multi-chain routing: resource on Arbitrum One, float selected automatically

```
Given the Leash hosted signer has pre-positioned USDC floats on Base, Arbitrum One, and Polygon
When the agent fetches an x402-gated HTTP resource whose 402 challenge specifies network eip155:42161
Then the Leash fetch wrapper intercepts the 402
  And the hosted signer reads the CAIP-2 network identifier (eip155:42161)
  And selects the Arbitrum One pre-positioned float for payment
  And submits the payment on Arbitrum One — not Base, not Polygon
  And the receipt row records network eip155:42161 alongside the txHash and amount
```

### Edge case: payment blocked by cap (server-side)

```
Given the cumulative settled spend plus the next payment amount would exceed the owner-set cap
When the agent's next x402 payment is evaluated by the Leash hosted signer
Then the signer refuses to sign — no x402 call is submitted (cap enforced server-side)
  And the blocked attempt is logged with status "blocked" (no x402 call was ever made)
  And a Tier 3 interrupt notification is emitted to the owner
  And no further payments are signed until the owner raises the cap or resets the cycle
```

### Edge case: payment fails at the facilitator

```
Given the agent submits an x402 payment that the CDP facilitator rejects (e.g., balance check fails on-chain)
When the facilitator returns a non-200 error response
Then the agent logs a receipt row with status "failed"
  And the failed amount does NOT increment the cumulative spend total
  And the agent loop continues (the failed attempt alone does not halt the agent)
```
Note: a "failed" payment is distinct from a "blocked" payment — "failed" means an x402 call was issued and rejected by the facilitator; "blocked" means the Leash hosted signer refused to sign before any x402 call was made. Ledger status enum: `success | failed | blocked`.

---

## Notes

- **No LLM, no model picker.** Leash is purely an x402 auto-payer. The agent is the owner's own external agent; Leash does not embed or route any LLM call.
- **Three interception methods, one primary.** MCP stdio proxy is primary (Claude Code, Claude Desktop, Cursor, OpenClaude — no CA cert). HTTP fetch wrapper (`@x402/leash-fetch`) covers all HTTP-based agents including Vercel. MITM proxy + CA cert is opt-in last resort for edge cases. The interception method is transparent to the agent loop — the agent makes ordinary MCP tool calls or `fetch()` calls and receives the result.
- **Custody outside the agent.** The Magic Server Wallet TEE hosted signer holds the signing key. Cap enforcement also lives in the hosted signer. Even if an agent loop is compromised, it cannot overspend or exfiltrate the key — the signer enforces policy server-side regardless.
- **CAIP-2 network drives float selection.** The resource's 402 challenge specifies the network; Leash does not negotiate or redirect to a cheaper chain. Base handles ~75% of x402 volume (primary float), Arbitrum ~8%, Polygon ~6%. The Particle UA treasury rebalances floats asynchronously in the background (see Story 4).
- **App-layer cap, server-side enforcement.** The spend cap is enforced in the hosted signer before any signature is produced. There is no `SpendCapGuard.sol` or on-chain delegation primitive. (Spec: R-LEASH-3, Non-Goals, Constraint 6.)
- **EIP-3009 / ecrecover on EVM chains.** Standard USDC v2 requires a raw EOA signature for EIP-3009 transferWithAuthorization. The Magic Server Wallet TEE provides a raw EOA key, satisfying this constraint without exposing it to the agent host.
- **Receipt field source.** The `txHash`, `network`, and `success` fields in the receipt come from the `X-PAYMENT-RESPONSE` header returned by the x402 facilitator on successful settlement.
- **Tier 3 notification is interrupt-tier.** A cap-exceeded event is one of the few legitimate uses of the interrupt tier. Routine settled payments are silent (Tier 1 log only). (Spec: R-DASH-3.)

---

## Open Questions

- **OQ-3 (from spec):** Which x402-gated endpoint is the agent demoed against? Options: (a) Tab's own x402 endpoint (Story 9 / R-RAIL-1); (b) a known public x402 test API; (c) a minimal demo x402 server. Decision required before Story 3 can be built or recorded.
- **Polling interval for dashboard receipt appearance.** AC-LEASH-1 requires the receipt to appear "within the dashboard's polling interval" but the spec does not define the target value in seconds.
- **Behavior when a specific chain's float is exhausted (not the cap).** If the CAIP-2 network in the 402 challenge is e.g. Polygon but the Polygon float is empty (not yet rebalanced), should this return status `failed` or a distinct `float-empty` state with a Tier 3 notification? Not specified.
- **Async rebalance timing vs float-dry gap.** Between treasury rebalance cycles, a low-float chain could fail payments. The acceptable gap and minimum float threshold per chain are not specified.
