# Story: Owner watches spend and is notified
> Traces to: R-DASH-1, R-DASH-3, R-LEASH-4; AC-DASH-1, AC-DASH-3. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As an agent owner,
I want to see every x402 payment my agent makes appear in a live reverse-chronological feed and receive tiered alerts only when spend crosses a meaningful threshold or something unusual happens,
so that I stay in control of autonomous agent spending without drowning in noise from routine events.

---

## Acceptance Criteria

- **AC-1 (traces to R-DASH-1, R-LEASH-4, AC-DASH-1):** Every settled x402 payment appears in the dashboard feed in reverse-chronological order within the dashboard's polling interval. No settled payment is ever silently dropped.

- **AC-2 (traces to R-DASH-1, R-LEASH-4, AC-DASH-1):** Each receipt row in the feed shows all five fields: amount (USD-denominated display value), resource URL (`payTo` endpoint), timestamp, `txHash` linked to the settlement network's block explorer, and settlement status (`success` / `failed`).

- **AC-3 (traces to R-LEASH-4):** Failed or bounced x402 payments are logged and rendered with status `failed`. They do not appear as successes and do not increase the cumulative spend total.

- **AC-4 (traces to R-DASH-3, AC-DASH-3-a):** A routine settled payment (cumulative spend well below 75% of cap, recognized resource URL) triggers only a Tier 1 response: the badge count updates and the row is appended to the feed. No banner or interrupt notification is sent to the owner.

- **AC-5 (traces to R-DASH-3, AC-DASH-3-b):** A payment that pushes cumulative spend to or past 75% of cap triggers a Tier 2 banner notification. The banner is non-interrupting; no owner action is required to dismiss the agent's operation.

- **AC-6 (traces to R-DASH-3):** A payment to an unrecognized or unusual resource URL triggers a Tier 2 banner notification, regardless of current cumulative spend level.

- **AC-7 (traces to R-DASH-3, AC-DASH-3-c, R-LEASH-4):** A payment attempt that would push cumulative spend past 100% of cap is blocked before the x402 call is made. A Tier 3 interrupt notification fires and requires owner action. The attempt is logged in the feed with status `blocked` — distinct from `failed` (a `blocked` attempt never issued an x402 call; a `failed` attempt did and was rejected by the facilitator). Canonical ledger status enum: `pending | settled | failed | blocked` (`settled` replaces `success`). The agent does not resume payments until the owner raises the cap or resets the cycle.

- **AC-8 (traces to R-DASH-3, AC-DASH-3-a):** Tier 3 never fires on a routine settled payment below any threshold. A Tier 3 notification is conclusive evidence that something requires the owner's attention.

---

## Scenarios

### Scenario 1: Routine payment below threshold — silent log only

```
Given the agent is running
  And cumulative spend is well below 75% of the owner-set cap
  And the resource URL is recognized
When the agent successfully settles an x402 payment
Then a receipt row appears in the dashboard feed within the polling interval
  And the row shows amount (USD), resource URL, timestamp, txHash linked to block explorer, and status "success"
  And the badge count increments by one
  And no Tier 2 banner is shown to the owner
  And no Tier 3 interrupt is shown to the owner
```

### Scenario 2: Payment crosses 75% of cap — Tier 2 banner

```
Given the agent is running
  And cumulative spend is just below 75% of cap (e.g., 74%)
When the agent settles a payment that pushes cumulative spend to or past 75%
Then a Tier 2 banner notification fires
  And the receipt row appears in the feed with all five required fields and status "success"
  And the agent continues running without any pause or halt
  And no Tier 3 interrupt is triggered
```

### Scenario 3: Payment would exceed cap — Tier 3 interrupt, agent halted

```
Given the agent is running
  And cumulative spend is at or near 100% of cap
When the agent attempts a payment that would push cumulative spend past 100%
Then the payment is NOT submitted (no x402 call is made to the resource)
  And a Tier 3 interrupt notification fires requiring the owner to take action
  And an entry is logged in the feed with status "blocked" representing the cap-blocked attempt (not "failed" — no x402 call was ever made)
  And the agent halts and makes no further x402 payments
  And normal operation does not resume until the owner raises the cap or resets the cycle from the dashboard
```

### Scenario 4: Payment to an unrecognized resource URL — Tier 2 banner

```
Given the agent is running
  And cumulative spend is below 75% of cap
When the agent settles a payment to a resource URL not previously seen
Then the receipt row appears in the feed with status "success"
  And a Tier 2 banner notification fires for the unusual resource
  And no Tier 3 interrupt is triggered
```

### Scenario 5: Failed payment — logged silently

```
Given the agent is running
  And cumulative spend is well below 75% of cap
When an x402 payment attempt fails (e.g., network error, rejected by facilitator)
Then a receipt row is logged in the feed with status "failed"
  And the failed payment does not increase cumulative spend
  And no Tier 2 or Tier 3 notification fires solely because of the failure
```

---

## Notes

- **App-layer cap enforcement:** The spend cap is enforced in the agent loop, not by an on-chain smart contract or cryptographic session key. The cap block is a code check; it is honest and must be described as such. (Spec: R-LEASH-3; Non-Goals; Constraint 6)

- **txHash provenance:** The `txHash` shown in each receipt row comes from the `X-PAYMENT-RESPONSE` header returned by the CDP hosted facilitator after a successful x402 settlement. (Spec: R-LEASH-4)

- **Tier 3 anti-cry-wolf rule:** Tier 3 must never be used for routine events. Its signal value depends on this discipline — one false-alarm Tier 3 destroys the owner's trust in the notification system. (Spec: R-DASH-3; UX research §C)

- **Feed shows receipts in reverse-chronological order:** The most recent payment is always at the top. (Spec: R-DASH-1)

- **Amount display is USD-denominated:** The receipt row surfaces the human-readable USD value, not atomic units alone. Both are stored (R-LEASH-4), but the USD figure is what the owner reads. (Spec: R-LEASH-4, AC-DASH-1)

- **Mobile PWA mirrors the same feed:** R-DASH-6 specifies that the mobile PWA shows the same receipt data and delivers Tier 2 / Tier 3 events as Web Push notifications. Mobile notification behavior is out of scope for this story (see Story 6 and AC-MOBILE-1) but the underlying receipt data is shared.

- **Spend cap is set and adjusted in a separate story:** Story 4 covers cap setting and mid-cycle adjustment (R-DASH-2, R-DASH-5). This story assumes a cap is already in place.

---

## Open Questions

1. **What defines an "unrecognized or unusual resource URL" for Tier 2 triggering?** R-DASH-3 names this as a Tier 2 trigger but does not define the detection mechanism (e.g., a whitelist the owner maintains, a first-seen heuristic, domain pattern matching, or a manual flag). The rule cannot be tested without this definition.

2. **What is the dashboard's polling interval?** AC-DASH-1 and R-DASH-1 express timing as "within the polling interval" but the spec does not specify a target value in seconds or milliseconds. The testability of AC-1 depends on this being defined.

3. **Does a blocked-attempt row appear in the same receipt feed as settled payments?** R-LEASH-3 says the agent "logs the attempt"; R-LEASH-4 covers receipt logging for settled (success and failed) payments; AC-LEASH-2 says "the agent logs the blocked attempt" — but it is not stated explicitly whether blocked-attempt entries are rendered in the dashboard feed alongside settled receipt rows, or in a separate audit log.

4. **What surface carries the "badge count" for Tier 1 events?** R-DASH-3 says "badge count updates" on Tier 1 but does not specify where the badge lives (browser tab favicon counter, in-app unread indicator, PWA app icon, or some combination).
