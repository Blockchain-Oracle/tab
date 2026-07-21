# Story: Owner sets and adjusts the spend cap
> Traces to: R-DASH-2, R-DASH-5, R-LEASH-3, R-LEASH-1, R-LEASH-6, AC-DASH-2. Spec: .thoughts/specs/2026-07-02-tab-leash.md
> (Updated 2026-07-02: added async UA treasury float rebalance as background op, and clarified cap is enforced server-side by the hosted signer, not solely in the agent loop.)

As an agent owner,
I want to set a spend cap (amount and reset frequency) and adjust it at any time from the dashboard,
so that the agent never spends beyond what I authorize, and I can change my limit mid-cycle without interrupting the agent's operation.

---

## Acceptance Criteria

- **AC-1 (from R-DASH-2, AC-DASH-2):** The dashboard spend bar shows current cumulative spend and the owner-set cap as a ratio (e.g. $4.20 / $10.00) and a percentage. The current-spend value equals the sum of all settled (not pending) receipts in the active cycle. The bar updates within the polling interval after each settlement.

- **AC-2 (from R-DASH-2):** Blocked payments and failed payments do NOT increase the cumulative spend total. The spend bar percentage does not change as a result of a blocked or failed attempt.

- **AC-3 (from R-LEASH-3):** The cap is enforced as a hard block: before the agent submits any x402 payment, it checks cumulative settled spend against the cap. If the proposed payment would push cumulative spend over the cap, the payment is not submitted — no x402 call is made.

- **AC-4 (from R-LEASH-3):** When a payment is blocked by the cap, the agent logs the blocked attempt and emits a Tier 3 (interrupt) notification to the owner. The block persists until the owner raises the cap or resets the cycle from the dashboard.

- **AC-5 (from R-DASH-2):** A Tier 2 (banner) notification fires when cumulative spend reaches or passes 75% of the cap. A Tier 3 (interrupt) notification fires when a payment would push cumulative spend past 100% of the cap.

- **AC-6 (from R-DASH-5):** The owner can raise or lower the cap mid-cycle from the dashboard without restarting the agent. The dashboard reflects the new cap immediately on save. The new cap takes effect on the next spend-cap check inside the agent loop.

- **AC-7 (from R-LEASH-3, R-LEASH-1):** The cap is enforced server-side by the Leash hosted signer (Magic Server Wallet TEE) before any x402 signature is produced. The signer checks cumulative settled spend against the cap before signing — regardless of which interception method (MCP proxy or HTTP wrapper) the agent is using. No on-chain transaction, smart contract call, or cryptographic session-key delegation is involved in setting or enforcing the cap.

- **AC-8 (from R-LEASH-6):** The Particle UA treasury monitors USDC float levels across the pre-positioned chains (Base and Arbitrum One — Polygon excluded from v0, see Constraint 14). When a chain's float falls below a threshold, the treasury triggers an async rebalance — routing USDC from the unified treasury balance to the low-float chain — in the background, without interrupting in-flight payments on other chains. The dashboard shows each chain's current float balance and the last-rebalanced timestamp. This background rebalance is the flagship cross-chain move. **BLOCKED (B-04):** the actual UA rebalance transfer requires the funded live spike.

---

## Scenarios

### Scenario 1 — Owner sets a cap for the first time

```
Given the Leash dashboard is open and no spend cap has been configured
When the owner enters a cap amount and a reset frequency and saves
Then the spend bar appears showing current cumulative spend against the new cap
And the displayed percentage equals (settled spend / cap) × 100
And the agent uses the new cap on its next x402 spend-check without requiring a restart
```

### Scenario 2 — Owner raises the cap mid-cycle

```
Given the agent is running mid-cycle with cumulative spend of $X against a cap of $Y
And the agent has not been paused or restarted
When the owner raises the cap to $Z (where $Z > $Y) and saves
Then the dashboard immediately shows $Z as the cap
And the spend bar percentage recalculates against $Z
And the agent's next payment check uses $Z as the ceiling
And no agent restart occurs
```

### Scenario 3 — Owner lowers the cap mid-cycle

```
Given the agent is running mid-cycle with cumulative spend of $X against a cap of $Y
When the owner lowers the cap to $W (where $W > $X, so current spend is still under the new cap) and saves
Then the dashboard immediately shows $W as the cap
And the spend bar percentage recalculates against $W
And the next payment that would push cumulative spend past $W is blocked (hard block, not a notification only)
```

### Scenario 4 — Cap is reached; payment is blocked (hard block)

```
Given the agent's cumulative settled spend for the current cycle equals or would be exceeded by the next proposed payment
When the agent loop reaches the spend-cap check for that payment
Then the x402 payment call is NOT made
And the agent logs the blocked attempt with the proposed amount and resource URL
And a Tier 3 interrupt notification is emitted to the owner
And all subsequent payment attempts remain blocked until the owner raises the cap or resets the cycle from the dashboard
```

### Scenario 5 — Blocked payment does not inflate the spend total

```
Given cumulative spend is $9.50 against a cap of $10.00
And the agent attempts a $1.00 payment (which would push spend to $10.50, over the cap)
When the payment is blocked
Then the spend bar still shows $9.50 / $10.00 (95%)
And the $1.00 blocked amount is logged but not added to the cumulative total
```

### Scenario 6 — UA treasury rebalances a low-float chain in background

```
Given the Base chain float has fallen below the configured minimum threshold
  (e.g., after a period of high x402 activity on Base)
When the Particle UA treasury detects the low-float condition (async background check)
Then the treasury initiates a USDC transfer from the unified treasury balance to the Base float address
  And this rebalance runs in the background without pausing or interrupting the agent
  And x402 payments on Arbitrum One and Polygon continue unaffected during the rebalance
  And once the rebalance settles, the dashboard shows the updated Base float balance
    and the last-rebalanced timestamp
```

---

## Notes

- **Cap is app-layer, enforced server-side in the hosted signer.** The spend cap is checked in the Leash hosted signer (Magic Server Wallet TEE) before any x402 signature is produced. This means cap enforcement holds regardless of which interception method is in use (MCP stdio proxy or HTTP wrapper). There is no `SpendCapGuard.sol`, no Particle session key, and no on-chain delegation involved. (R-LEASH-3, R-LEASH-1, Constraints 6 and 8)

- **Hard block, not a soft notification.** When the cap is hit, payments stop. The hosted signer refuses to sign; the agent does not proceed and receive the resource. (R-DASH-2, AC-LEASH-2)

- **Settle-only accounting.** The spend bar and cap-check both use settled receipts only — pending, in-flight, blocked, and failed payments are excluded from the cumulative total. (AC-DASH-2)

- **Mid-cycle change takes effect at the next signer check, not retroactively.** If the hosted signer is mid-check when the owner saves a new cap, the in-progress check completes under the old cap; the new value applies on the next check. (R-DASH-5)

- **Notification lag caveat.** The spec notes that Tier 2 / Tier 3 notifications can be delayed by "several minutes" per Vercel and Cloudflare delivery behavior. The cap itself is enforced synchronously in the hosted signer; only the push notification delivery is subject to lag. Owners should set the cap below their true maximum tolerated spend to account for this lag. (R-DASH-2)

- **Async float rebalance is a background op, not owner-triggered.** The Particle UA treasury monitors float levels across Base and Arbitrum One (Polygon excluded from v0) and rebalances automatically. The owner does not need to manually top up individual chain floats. The dashboard shows current float levels and rebalance history. This background multi-chain rebalancing is the flagship Particle UA cross-chain capability powering Leash. **BLOCKED (B-04)** for the actual transfer until the live spike completes. (R-LEASH-6)

- **No on-device signing on mobile.** If the owner adjusts the cap from the mobile PWA, the cap update is an HTTP POST to the `apps/web` backend. No private key or EIP-7702 authorization is on the mobile device. (Constraint 7)

---

## Open Questions

1. **What reset-frequency options are offered?** R-DASH-2 says the cap has an "amount + reset frequency" but does not enumerate the valid frequencies (e.g., daily, weekly, monthly, per-session, manual-reset-only). The cap-setting UI and the cycle-reset logic depend on this.

2. **What happens if the owner lowers the cap below the current cumulative spend?** For example: current spend is $8.00, owner lowers cap to $6.00. The spec says the new cap takes effect on the next spend-check, but does not specify whether cumulative spend already over the new cap triggers an immediate Tier 3 notification and immediate block, or whether it simply blocks the next payment attempt. This edge case needs resolution before the dashboard cap-input can be fully specified.

3. **Is there a minimum or maximum cap amount?** The spec does not state a floor or ceiling for the cap value. A $0 cap, for instance, would block all payments immediately; a very large cap would be effectively unlimited. Whether the dashboard enforces any guardrails is unspecified.
