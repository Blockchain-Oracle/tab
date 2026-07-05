> **SUPERSEDED — this raw intermediate predates the Leash reframe (still shows the removed Model Picker + Arbitrum-only float). Do NOT use. Canonical: ../2026-07-02-product-surface-map.md.**

# Surface Map: Leash Agent-Owner Web Dashboard

> Generated: 2026-07-02
> Traces to: R-LEASH-1..6, R-DASH-1..5, R-MODEL-1,2, AC-LEASH-1..5, AC-DASH-1..3, AC-MOBILE-1
> Source stories: story-3-agent-pays-x402, story-4-owner-sets-cap, story-5-owner-watches-and-notified, story-6-owner-revokes, story-7-owner-picks-model, story-9-one-rail-two-payers
> UX anchors: research/2026-06-30-ux-reality-research.md §C (agent spend dashboard, revocation spectrum, 3-tier notifications), §D

---

## Surface Description

The Leash agent-owner web dashboard is the primary control center for an agent owner who has deployed a headless AI agent (Leash) that autonomously pays x402-gated internet resources. The owner visits this surface to monitor every payment the agent makes, set and adjust the cap on what the agent can spend, pick which LLM model the agent runs, execute revocation at any level, and top up the agent's USDC float on Base. The surface is a web application (apps/web, Next.js App Router) served to a logged-in owner. A mobile PWA mirrors the same data and revocation controls but is a separate surface — not mapped here.

This surface does NOT serve buyers, merchants, or external developers. Its user is always the agent owner.

---

## Screen Inventory

### Screen 1 — Agent Overview (Home / Control Center)

**Purpose:** The owner's first screen on every visit. Shows the agent at a glance: current operational state, spend progress, recent activity preview, and access to all sub-surfaces. Functions as the command bridge.

**Entry from:** Direct URL / root dashboard route. Post-setup redirect after first provisioning.

**Traces to:** R-DASH-1, R-DASH-2, R-DASH-4, R-LEASH-1, R-MODEL-1; Goal 4; AC-LEASH-4 (not-provisioned state).

**Required states:**

| State | Trigger | What changes on-screen |
|---|---|---|
| ACTIVE | Agent running, cumulative spend below 75% cap | Status badge "Active". Spend bar green/neutral. No alert banner. |
| NEAR-LIMIT | Cumulative spend reaches 75% of cap | Spend bar shifts to warning visual. Tier 2 banner visible. Agent is still running. |
| AT-LIMIT / HALTED | Cumulative spend at or past 100% of cap | Spend bar at full with danger visual. Payments halted label. Tier 3 interrupt surface. Owner action required. |
| PAUSED | Owner triggered soft pause | Status badge "Paused". Resume action prominent. Key intact indicator. |
| FROZEN | Owner triggered freeze | Status badge "Frozen". Unfreeze action prominent. Key intact indicator. |
| CANCELLED | Owner triggered cancel; key rotated | Status badge "Cancelled". "Needs re-provisioning" notice. No resume available. |
| NOT PROVISIONED | Nuclear triggered or first-run before key set | Status badge "Not provisioned". Setup prompt prominent. No spend bar, no feed. |
| LOADING | Initial data fetch on page load | Skeleton placeholder for spend bar and recent receipts. Status area shimmered. |
| EMPTY / NO ACTIVITY | Provisioned and active, but no x402 payments made yet | Spend bar shows $0.00 / [cap]. Receipt preview shows empty state ("Your agent hasn't made any payments yet"). |
| LOW FLOAT | USDC balance on Base approaches $0 | Float balance indicator in warning state. Top-up CTA surfaced. Agent may still be active but approaching inability to pay. |

**On-screen data shape:**

- **Agent identity:** agent name (owner-assigned or default). Agent ID (internal reference).
- **Status badge:** one of: Active / Paused / Frozen / Cancelled / Not Provisioned.
- **Spend bar summary:** current cumulative spend (USD) / cap amount (USD) / percentage. Example: "$4.20 / $10.00 (42%)". Source: sum of settled receipts only (not blocked, not failed). Traces to: AC-DASH-2, R-DASH-2.
- **Cap cycle indicator:** reset frequency (e.g. Daily / Weekly / Monthly) + cycle start date + next reset date.
- **USDC float balance:** USD-denominated balance of USDC held at agent EOA on Base. Source: on-chain read from Base. Traces to: R-LEASH-1, R-DASH-6.
- **Current model (active selection):** display name + full OpenRouter model ID. Example: "Claude Sonnet 4.6 — anthropic/claude-sonnet-4.6". Traces to: R-MODEL-1.
- **Server key status:** Provisioned / Not Provisioned. No key value shown. Traces to: R-LEASH-1, AC-LEASH-4.
- **Recent receipt preview:** last 3–5 receipt rows (same data shape as full feed, see Screen 2). "View all" link to Screen 2.
- **Notification badge count:** count of unread Tier 2 + Tier 3 items. Tier 1 does NOT increment this badge. Traces to: R-DASH-3.
- **Quick action buttons (context-sensitive):** varies by state. Active state: "Pause" (soft pause). Paused state: "Resume" + "Freeze" options. Any active/paused/frozen state: "Revoke..." (opens Screen 6). At-limit: "Raise cap" CTA. Not-provisioned: "Set up agent" CTA. Traces to: R-DASH-4, R-DASH-5.

---

### Screen 2 — Live Payment Feed

**Purpose:** Full reverse-chronological log of all x402 payment events (settled, failed, and blocked). The owner's audit trail and real-time visibility into every payment the agent makes or attempts.

**Entry from:** Agent Overview "View all" link. Navigation tab/route in dashboard.

**Traces to:** R-DASH-1, R-LEASH-4; AC-LEASH-1, AC-DASH-1; Story 5 (owner watches), Story 3 (receipt logging).

**Required states:**

| State | Trigger | What changes on-screen |
|---|---|---|
| ACTIVE / UPDATING | New receipts arriving from agent activity | Feed prepends new rows. Live indicator visible (e.g. pulse icon). No page reload needed. |
| EMPTY | No payments ever made or attempted | Empty state illustration + "Your agent hasn't made any payments yet" message. No rows. Spend bar context still visible. |
| LOADING | Initial data fetch | Skeleton row placeholders. Spinner or shimmer for row content. |
| ERROR / LOAD FAILED | Network error on fetch | Error message. Retry button. Previously loaded rows remain if any. |
| MIXED-STATUS | Feed contains a mix of success, failed, and blocked rows | Each row shows its own status badge. No full-feed status change. |
| NEAR-LIMIT (feed context) | Cumulative spend entering 75% zone | Spend bar summary above the feed enters warning visual. Feed itself unchanged. |
| AT-LIMIT (feed context) | Payments halted | "Payments halted — cap reached" banner above the feed. New rows after this point are BLOCKED status. |
| CAP-RESET | Owner resets cycle / raises cap | Banner or notice that cycle has reset. Feed continues. |

**On-screen data shape (per receipt row):**

Each row is a single x402 payment event. Minimum five fields (AC-DASH-1, R-DASH-1, R-LEASH-4):

- **Amount:** USD-denominated display value. Example: "$0.42". Source: amount field from receipt log.
- **Resource / payTo URL:** the x402-gated endpoint the agent fetched. Example: "api.datasource.io/weather/forecast". Truncated with expand affordance for long URLs.
- **Timestamp:** human-relative (e.g. "2 minutes ago") with absolute datetime on hover/expand.
- **txHash:** truncated hash with copy affordance. Links to block explorer for the settlement network. For Base: Basescan. Example: "0xab12...cd56" → links to basescan.org/tx/0xab12...cd56. Source: X-PAYMENT-RESPONSE header field. Traces to: R-LEASH-4, AC-DASH-1.
- **Status badge:** one of:
  - SUCCESS — settled, txHash present, cumulative spend incremented.
  - FAILED — settlement rejected (e.g. insufficient on-chain balance, facilitator error). Does not increment cumulative spend.
  - BLOCKED — cap pre-check prevented x402 call. No txHash. Does not increment cumulative spend. Traces to: AC-LEASH-2, R-LEASH-3.
  - PENDING — submitted, awaiting facilitator settle. Transient; resolves to SUCCESS or FAILED.

Additional row-level data (secondary, visible on expand or in detail overlay):

- **Network:** "Base" (eip155:8453). The settlement network.
- **Asset:** "USDC".
- **Cycle contribution:** "Takes cumulative to $X.XX of $Y.YY". Only shown for SUCCESS rows.

**Feed-level data shape (above the rows):**

- **Spend bar:** current cumulative spend / cap / % (same as overview). Always visible above the feed for context.
- **Row count:** total number of events in current cycle.
- **Filter controls:** All / Success / Failed / Blocked (designer's call on affordance).

---

### Screen 3 — Receipt Detail Panel / Overlay

**Purpose:** Expanded view of a single x402 payment event. Shows all logged fields for that receipt, including the full txHash and block explorer link, and the exact amounts in both USD and USDC atomic units.

**Entry from:** Clicking any row in Screen 2. May also be reachable via notification items in Screen 5.

**Traces to:** R-LEASH-4, R-DASH-1; AC-DASH-1.

**Required states:**

| State | Trigger | What changes |
|---|---|---|
| LOADED | Row click, data available | All fields rendered. |
| LOADING | Row click before data fetch returns | Skeleton within panel. |
| BLOCKED DETAIL | Row is a BLOCKED event | No txHash field (no x402 call was made). Cap pre-check result shown instead. |
| FAILED DETAIL | Row is a FAILED event | txHash may be absent (if facilitator never responded) or present (if settle failed). Error context shown. |
| EXPLORER LINK UNAVAILABLE | txHash present but block explorer unreachable | Link disabled with "Explorer unavailable" label. txHash still copyable. |

**On-screen data shape:**

- **Amount (USD):** display value, e.g. "$0.42".
- **Amount (raw):** USDC atomic units, e.g. "420000" (6 decimals). For operator-level audit.
- **Resource URL (payTo):** full untruncated URL. Copy affordance.
- **Timestamp:** exact datetime (ISO 8601 or localized).
- **txHash:** full hash. Copy affordance. Block explorer hyperlink. Label: "View on [Network Explorer]". Source: X-PAYMENT-RESPONSE header. Absent for BLOCKED events.
- **Network:** "Base" (eip155:8453).
- **Asset:** "USDC".
- **Status:** SUCCESS / FAILED / BLOCKED / PENDING.
- **Cumulative context (SUCCESS only):** "Cumulative spend after this payment: $X.XX / $Y.YY cap".
- **Block reason (BLOCKED only):** "Payment blocked — would push spend to $X.XX, exceeding $Y.YY cap."
- **Failure reason (FAILED only):** reason if available (e.g. "Insufficient on-chain balance", "Facilitator rejected"). If unavailable: "Settlement failed".
- **Trigger task / agent context (if available):** what agent task prompted this fetch. Traces to: R-LEASH-4 "trigger URL".

---

### Screen 4 — Spend Bar + Cap Configuration

**Purpose:** Owner sets the cap amount and reset frequency. Adjusts the cap mid-cycle. Views current cumulative spend progress against the cap. Understands notification threshold behavior.

**Entry from:** Agent Overview (cap edit affordance on spend bar). Navigation settings or dedicated cap route.

**Traces to:** R-DASH-2, R-DASH-5, R-LEASH-3; AC-DASH-2, AC-DASH-3; Story 4 (owner sets cap).

**Required states:**

| State | Trigger | What changes |
|---|---|---|
| UNCONFIGURED | No cap has been set | No spend bar. Prompt to set cap. "Set cap" form visible. Agent is active but uncapped — this is a high-risk state; surface must make this clear. |
| CONFIGURED / ACTIVE | Cap set, spend within cap, below 75% | Spend bar rendered. Cap amount and frequency shown. |
| NEAR-LIMIT (75%+) | Cumulative spend >= 75% of cap | Spend bar in warning visual. Tier 2 banner text: "Your agent is approaching its cap." |
| AT-LIMIT (100%) | Payment blocked by cap | Spend bar at 100% with danger visual. "Payments are halted" notice. Tier 3 interrupt text. CTA: "Raise cap" or "Reset cycle". |
| EDITING | Owner opens cap edit form | Inline form or modal with cap amount + reset frequency inputs. Current values pre-filled. |
| SAVING | Owner submits cap change | Form disabled. Spinner. |
| SAVE SUCCESS | Cap change persisted | Spend bar recalculates immediately. Confirmation (toast or inline). |
| SAVE ERROR | Network or validation error | Error message inline. Form re-enabled. Previous cap still in effect. |
| MID-CYCLE LOWERED BELOW CURRENT SPEND | Owner lowers cap to value below current cumulative | The system must handle this edge case: does it trigger immediate Tier 3? (See Open Questions.) |

**On-screen data shape:**

- **Spend bar (visual + numeric):** current cumulative spend (USD) / cap (USD) / percentage. Example: "$4.20 / $10.00 (42%)". Updates within polling interval after each settlement.
- **Cap amount input:** dollar value (numeric input). No minimum or maximum enforced by spec — designer should consider floor guard (e.g. warning for $0 cap).
- **Reset frequency selector:** the spec names this field but does not enumerate all valid options. UX research confirms the Ramp/Brex/Stripe standard set: Daily / Weekly / Monthly / Quarterly / Annually / Does not reset (manual-reset-only). Exact set is OPEN QUESTION (see Open Questions section).
- **Cycle start date:** when current cycle began.
- **Next reset date:** derived from start + frequency. Shown as absolute date.
- **Notification threshold indicators (read-only, not configurable):** Two fixed thresholds, decided by spec:
  - 75% → Tier 2 banner notification fires.
  - 100% → Tier 3 interrupt fires; payments halt.
  - These are NOT owner-configurable. They are product-decided. Source: R-DASH-2, AC-DASH-3.
- **Hard block notice (read-only):** "Payments stop when the cap is reached. The agent does not continue spending." Not a toggle. Always on.
- **Latency caveat notice (informational):** "Notification delivery may lag a few minutes after a threshold is crossed. Set your cap below your true maximum to account for this." Source: R-DASH-2, UX research §C latency caveat.
- **Current-cycle blocked/failed count:** number of blocked and failed payments in this cycle. Excluded from cumulative spend total.
- **"Reset cycle" action (Tier 3 state only):** allows owner to manually reset cumulative spend to $0 and restart the cycle. Equivalent to "unblocking" the agent when the cap has been hit.

---

### Screen 5 — Notifications Center

**Purpose:** Consolidated log of all notification events across Tier 1, Tier 2, and Tier 3. Owner can review past alerts, see which events required action, and identify patterns.

**Entry from:** Badge icon in header / navigation. Tier 3 interrupt may surface inline on any screen; this screen is the full history view.

**Traces to:** R-DASH-3; AC-DASH-3; Story 5 (notification triggers).

**Required states:**

| State | Trigger | What changes |
|---|---|---|
| EMPTY | No notifications yet | Empty state. "No notifications yet." |
| ALL-TIERS | Default view | All tiers listed, reverse-chronological. |
| FILTERED (Tier 2 only) | Filter applied | Only Tier 2 (banner) events shown. |
| FILTERED (Tier 3 only) | Filter applied | Only Tier 3 (interrupt) events shown. |
| LOADING | Initial fetch | Skeleton rows. |
| UNREAD / READ | Read state per item | Visual distinction for unread. Badge count clears when this screen is visited. |
| ACTIVE TIER 3 (requires action) | Current unresolved Tier 3 | Tier 3 item is "sticky" at top until owner takes action (raises cap, resumes agent, etc.). |

**On-screen data shape (per notification item):**

- **Tier indicator:** visible tier signal. Functional label, not "Tier 1/2/3" in UI copy — use product language. See Copy/Vocabulary Rules.
- **Message text:** human-readable description of event. Examples from UX research §C microcopy patterns:
  - Tier 1 (routine): "[Amount] paid to [Resource URL] at [timestamp]."
  - Tier 2 (approaching): "Your agent has used 75% of its $X.XX cap."
  - Tier 2 (unusual URL): "Your agent paid an unrecognized resource: [URL]. Review if unexpected."
  - Tier 3 (halted): "Payments halted. Your agent reached its $X.XX cap. Raise the cap or reset the cycle to resume."
- **Timestamp:** absolute datetime.
- **Amount (if payment-related):** USD value of the triggering payment.
- **Resource URL (if payment-related):** the endpoint that triggered the event.
- **CTA (Tier 3 only):** "Raise cap" (links to Screen 4) / "Revoke agent" (links to Screen 6) / "Review" (links to the triggering receipt in Screen 2).
- **Read / Unread status:** Tier 2 and Tier 3 items can be marked read. Tier 1 items are always read (ambient log).
- **Tier 3 resolution status:** "Resolved" / "Awaiting action". A Tier 3 item stays "Awaiting action" until the owner raises the cap, resets the cycle, or resumes the agent.

**Notification tier definitions (decided, not configurable):**

| Tier | Product trigger | Owner interrupt? |
|---|---|---|
| Tier 1 — Routine | Every settled payment (SUCCESS) | No — log only, badge count updates. |
| Tier 2 — Alert | Cumulative spend >= 75% cap; unusual/unrecognized resource URL | Banner only — no interrupt, no required action. Agent continues. |
| Tier 3 — Action required | Cap exceeded (payment blocked); agent halted; suspicious activity | Interrupt — requires owner action before agent resumes. |

Source: R-DASH-3, UX research §C notification tiering, anti-cry-wolf rule.

---

### Screen 6 — Revocation Controls

**Purpose:** Execute any of the four revocation levels against the agent. Shows current agent state and the consequences of each level before the owner acts. Highest-stakes screen on the surface.

**Entry from:** Agent Overview quick action area. Header "Revoke" emergency shortcut. Tier 3 notification CTA. Any screen that surfaces the current agent status.

**Traces to:** R-DASH-4, R-DASH-6; AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1; Story 6.

**Required states:**

| State | What is shown |
|---|---|
| AGENT ACTIVE — choose level | All four revocation level options presented. Current state: Active. |
| PAUSED (after soft pause) | Current state: Paused. "Resume" action prominent. "Upgrade to freeze", "Cancel", "Nuclear" also available. |
| FROZEN (after freeze) | Current state: Frozen. "Unfreeze" action prominent. "Cancel", "Nuclear" available. Soft pause not applicable. |
| CANCELLED (after cancel) | Current state: Cancelled. Key has been rotated. Agent non-operational. "Provision new key" CTA. Nuclear still available. |
| NOT PROVISIONED (after nuclear) | Current state: Not Provisioned. Key deleted. "Re-provision" CTA (operator action required). |
| CONFIRM DIALOG (per level) | Confirmation overlay/dialog specific to the chosen level. |
| EXECUTING (HTTP call in flight) | Loading state on button. No second action possible during execution. |
| ACTION SUCCESS | State badge updates. Success notice. Available actions update to reflect new state. |
| ACTION ERROR | Error message. Previous state label unchanged. Retry available. |

**On-screen data shape:**

**Current state panel:**
- **Status badge:** Active / Paused / Frozen / Cancelled / Not Provisioned.
- **Key status:** Provisioned and active / Provisioned but frozen / Key rotated — provisioning required / Key deleted — reprovisioning required.
- **Last action:** what was last done and when (e.g. "Soft paused 3 minutes ago").
- **Reversibility:** "Resumable" (for Active / Paused / Frozen) or "Requires re-provisioning" (Cancelled / Not Provisioned).

**Revocation level cards (one per level, 4 total):**

Each card shows:
- **Level name:** Level 1: Soft pause / Level 2: Freeze / Level 3: Cancel / Level 4: Nuclear. (Spec-decided names.)
- **One-line consequence:** what happens to the agent loop and to the key.
- **Key fate:** Key intact / Key intact / Key rotated / Key deleted.
- **Reversibility:** Resumable / Resumable / New key required / Re-provisioning required.
- **Primary action button:** "Pause" / "Freeze" / "Cancel" / "Nuclear".
- **Disabled state:** A level that is not applicable from the current state is disabled with a label explaining why.

**Confirmation mechanism (per level — decided by spec, friction calibrated to severity):**

| Level | Confirmation approach |
|---|---|
| Level 1 — Soft pause | Single confirm click / tap. Simple dialog: "Pause your agent? Payments will stop. You can resume at any time." |
| Level 2 — Freeze | Confirm dialog with consequence summary. "Freeze your agent? Payments will stop and the agent cannot transact. Your key is intact. You can unfreeze at any time." |
| Level 3 — Cancel | Higher friction. Text input: owner must type agent name or "CANCEL" before confirming. Consequence: "This rotates your server key. The agent cannot transact until you provision a new key." Source: Vercel team-name pattern, UX research §C kill-switch confirmation patterns. |
| Level 4 — Nuclear | Highest friction. Text input required. Explicit irreversibility warning: "This permanently deletes your server key. There is no recovery. Your agent will not be able to operate until you manually re-provision." Distinct destructive button color (designer's call on color, designer's call on exact affordance). Source: UX research §C Vercel confirmation pattern. |

**Post-nuclear state (NOT PROVISIONED):**
- Full screen state shows "Not provisioned" prominently.
- "Your agent has been stopped permanently. Re-provisioning requires manual operator action."
- "Set up agent" CTA leading to Screen 8 (Setup / Provisioning).
- No resume, no unfreeze, no soft pause available.
- Traces to: AC-LEASH-4.

---

### Screen 7 — Model Picker

**Purpose:** Owner selects the LLM model the agent uses for every subsequent call. Change takes effect on the next agent LLM call without restart.

**Entry from:** Agent Overview (model chip / "Change model" link). Dashboard settings area.

**Traces to:** R-MODEL-1, R-MODEL-2; AC-LEASH-5; Story 7.

**Required states:**

| State | What is shown |
|---|---|
| INITIAL / VIEWING | Current selection highlighted. Full curated list visible. |
| SELECTING | User is browsing the list. Current saved selection still shown as "active". |
| SAVING | Persistence call in progress. List disabled. Spinner. |
| SAVE SUCCESS | New selection is now active. Confirmation: "Model updated — next agent call will use [model name]." |
| SAVE ERROR | Error message. Previous selection still in effect and shown as active. Retry. |
| MODEL UNAVAILABLE (edge case) | A previously selected model is no longer available via OpenRouter. Warning on the active model chip. "This model is unavailable. Please select another." |

**On-screen data shape:**

- **Active model display:** friendly name + full OpenRouter model ID. Example: "Claude Sonnet 4.6" with subtitle "anthropic/claude-sonnet-4.6". Full ID always shown for transparency.
- **Curated model list (minimum content — exact list is OPEN QUESTION):**
  - Grouped by provider family.
  - **Anthropic group:** at minimum `anthropic/claude-sonnet-4.6`. Full model name + ID per entry.
  - **OpenAI group:** at minimum `openai/gpt-5.5`. Full model name + ID per entry.
  - **Google group:** at minimum `google/gemini-3.1-pro-preview`. Full model name + ID per entry.
  - Per list entry: friendly name + full model ID + provider logo/icon (designer's call on icon sourcing).
- **"Take effect" indicator (read-only):** "The selected model takes effect on your agent's next call. No restart required." Traces to: R-MODEL-2, AC-LEASH-5.
- **In-progress call notice (edge case):** "Calls already dispatched will complete with the previous model. The next call uses your new selection." Traces to: story-7 "mid-flight switch" scenario.
- **Save / confirm affordance:** explicit "Save" button OR auto-save on selection — OPEN QUESTION (see Open Questions). If save is explicit: button disabled until a change is made.

---

### Screen 8 — Agent Setup / Provisioning + Float Management

**Purpose:** Initial setup screen to provision the agent's server key and fund the USDC float on Base. Also the re-entry point after nuclear revocation. Float top-up is operator-triggered using the Particle UA SDK (separate from the x402 payment loop).

**Entry from:** First-run flow (no key provisioned). "Not provisioned" state on Screen 1 or Screen 6. "Top up" CTA from Agent Overview float balance display.

**Traces to:** R-LEASH-1, R-LEASH-6; AC-LEASH-4 (re-provisioning after nuclear); Constraint 2 (UA SDK top-up is separate from x402 loop).

**Required states:**

| State | What is shown |
|---|---|
| NOT PROVISIONED — KEY MISSING | "Your agent is not set up. A server key is required before your agent can make payments." Setup flow visible. |
| PROVISIONED — FUNDED | Key active. Float balance shown. Top-up option available but not urgent. |
| PROVISIONED — LOW FLOAT | Key active. Float balance in warning state. "Your agent may not be able to pay — add funds." Top-up CTA prominent. |
| PROVISIONED — FLOAT EMPTY | Key active. Float is $0.00 or insufficient for any x402 payment. Agent cannot pay. "Add funds to restore payments." Top-up CTA urgent. |
| TOP-UP IN PROGRESS | UA SDK call executing to transfer USDC to Base EOA. Spinner. Amount shown. |
| TOP-UP SUCCESS | "Funds added. New balance: $X.XX USDC on Base." |
| TOP-UP ERROR | "Transfer failed. Your unified balance may be insufficient, or the transfer timed out." Retry. |
| REPROVISIONING (post-nuclear) | Same as NOT PROVISIONED state but with context: "A new key is required after nuclear revocation." |

**On-screen data shape:**

**Key status panel:**
- **Status:** Provisioned / Not Provisioned.
- **EOA address on Base:** the agent's wallet address (float address). Shown for owner reference, copyable. NOT the private key.
- **Security note (read-only):** "Your server key is held securely in the environment. It is never shown here." Source: R-LEASH-1.
- **Key health:** Provisioned and active / Rotated — needs replacement / Deleted — reprovisioning required.

**USDC float panel:**
- **Float balance:** USDC balance at agent EOA on Base. USD-denominated. Example: "$3.50 USDC on Base".
- **Low-float threshold indicator:** OPEN QUESTION — spec does not define a low-float threshold amount. Designer should surface this as a product decision.
- **Top-up section:**
  - Amount to add (USD input).
  - "Add funds from your unified balance" — triggers Particle UA `createTransferTransaction` from the owner's chain-abstracted balance to the agent EOA on Base. Traces to: R-LEASH-6.
  - Note (read-only): "Funds come from your unified balance and land at the agent's address on Base. This is a separate step from the agent's payments." Honest framing per Constraint 2.
  - "After adding funds, your agent's next payment will use the updated balance."
- **Network label:** "Base (eip155:8453)" — shown on this screen (owner context; chain language is appropriate here, unlike the buyer flow).

---

## Generated Artifacts / Receipts

### Receipt row data contract (minimum spec, confirmed)

All of the following fields are required in every SUCCESS or FAILED receipt row. BLOCKED rows omit txHash.

```
amount_usd:        "$0.42"                          — USD display
amount_raw:        "420000"                          — USDC atomic units (6 decimals)
asset:             "USDC"
network:           "eip155:8453"                     — settlement network CAIP-2
resource_url:      "https://api.resource.com/data"  — payTo endpoint
tx_hash:           "0xabc...def"                     — from X-PAYMENT-RESPONSE header
timestamp:         "2026-07-02T14:23:01Z"
trigger_url:       "https://..."                     — what agent task initiated fetch
status:            "success" | "failed" | "blocked" | "pending"
```

Source: R-LEASH-4, story-3 AC-LEASH-1, story-5 AC-2.

### Notification item data contract

```
tier:           1 | 2 | 3
message:        string (human-readable, see copy rules)
timestamp:      ISO 8601
amount_usd:     "$X.XX" (if payment-related, else null)
resource_url:   string (if payment-related, else null)
resolved:       boolean (Tier 3 only — set true when owner takes action)
cta_type:       "raise_cap" | "revoke" | "review_receipt" | null
```

Source: R-DASH-3, story-5 AC-4..8.

---

## Copy / Vocabulary Rules for This Surface

These rules are product-decided. They shape every label, badge, and message on the dashboard.

### Words to use

| Concept | Copy to use | Rationale |
|---|---|---|
| Agent is running normally | "Active" | Status badge. Consistent with Stripe Issuing active state. |
| Agent halted, resumable | "Paused" | Not "stopped" — implies resumability. |
| Agent locked, key intact | "Frozen" | Distinct from paused; UX research §C Stripe `status=inactive`. |
| Key rotated, needs provisioning | "Cancelled" | Permanent until reprovisioned. |
| Key deleted | "Not provisioned" | AC-LEASH-4 exact phrasing. |
| x402 payment succeeded | "Paid" (row level) / "Success" (badge) | Functional, not crypto-jargon. |
| x402 payment blocked by cap | "Blocked" | Distinct from "failed" — no error occurred, policy enforced. |
| x402 payment settlement rejected | "Failed" | Settlement attempt was made but rejected. |
| Cap enforcement | "Payments halt when the cap is reached" | Hard block framing, not "soft limit". |
| USDC float on Base | "Agent balance" | Owner-facing. Do not say "EOA float" or "USDC-on-Base float". |
| Top-up flow | "Add funds" | Matches onboarding vocabulary (Coinbase: "Add Funds"). |
| Model change | "Update model" or "Switch model" | Active verbs. |
| Tier 2 notification in UI | "Alert" or "Warning" | Not "Tier 2". The tier number is internal. |
| Tier 3 notification in UI | "Action required" | Not "Tier 3". Interrupt label must convey required action. |
| Tier 1 log entry | No label needed in notification feed | Ambient. Appears in receipt feed, not notification center as a distinct item. |

### Words to avoid on this surface

| Avoid | Instead |
|---|---|
| "EOA" | "agent address" or omit |
| "EIP-7702", "EIP-3009", "eip155" | Show network as "Base" or "Arbitrum" — not CAIP-2 identifiers — except in receipt detail where technical users need the exact format |
| "gas" | Omit — the agent pays gas internally via x402 mechanics; the owner never sees a gas line |
| "session key", "delegation", "smart contract" | These are not the architecture — do not imply cryptographic delegation |
| "Leash" as a cryptographic primitive | The leash is economic and operational (app-layer cap + key control). Never say "cryptographic leash" or "on-chain leash". |
| "nuclear" in body copy | Use "nuclear" only in the action button label / level name. In consequence descriptions: "permanently delete the server key". |
| Notification tier numbers in UI copy | Use "Alert" / "Action required" / ambient behavior. Tier numbers are internal spec language. |

### Number formatting rules

- Spend amounts: always USD-denominated with two decimal places. "$4.20" not "4.2" or "USDC 4.20".
- Percentage: round to whole number. "42%" not "42.00%".
- txHash: show first 6 + "..." + last 4. Example: "0xab12...ef56". Always copyable.
- Model IDs: show in full `{provider}/{model}` format — these are technical and should not be truncated. Example: `anthropic/claude-sonnet-4.6`.
- Timestamps: relative ("2 minutes ago") in feed rows; absolute on hover/expand and in detail panel.

---

## Decided vs Designer's Call

### Decided (locked in spec, stories, or UX research — designer inherits these)

| Decision | Source |
|---|---|
| Four exact revocation levels and their names: Soft pause / Freeze / Cancel / Nuclear | R-DASH-4, story-6, UX research §C revocation spectrum |
| Soft pause and freeze are resumable; cancel and nuclear are not (without re-provisioning) | R-DASH-4, AC-LEASH-3, AC-LEASH-4 |
| Key fate per level: Level 1 intact / Level 2 intact / Level 3 rotated / Level 4 deleted | R-DASH-4, story-6 |
| All revocation is an HTTP call to backend — no on-device signing, no on-chain tx | R-DASH-4, Constraint 7, AC-MOBILE-1 |
| Nuclear post-state is "not provisioned" (exact label per AC-LEASH-4) | AC-LEASH-4 |
| Notification tiers: 1 = silent / 2 = banner / 3 = interrupt + required action | R-DASH-3, UX research §C |
| Tier 2 fires at 75% of cap | R-DASH-2, AC-DASH-3 |
| Tier 3 fires when a payment would push past 100% of cap; that payment is blocked | R-DASH-2, R-LEASH-3, AC-LEASH-2 |
| Tier 3 must never fire on routine events (anti-cry-wolf rule) | R-DASH-3, UX research §C |
| Receipt row minimum fields: amount USD, resource URL, timestamp, txHash (linked), status | R-DASH-1, R-LEASH-4, AC-DASH-1 |
| Blocked and failed payments do NOT increment cumulative spend | R-LEASH-3, AC-LEASH-2, AC-DASH-2 |
| Cap is a hard block — agent does not submit the x402 call when cap is exceeded | R-LEASH-3, AC-LEASH-2 |
| Cap change takes effect on next agent loop check, without restart | R-DASH-5, AC-LEASH-5-analog |
| Spend bar shows: current / cap / % (three-part format) | R-DASH-2, AC-DASH-2 |
| Model picker shows at minimum one model per provider family: Anthropic, OpenAI, Google | R-MODEL-1 |
| Model IDs shown in full `{provider}/{model}` format | R-MODEL-1, story-7 |
| Model switch takes effect on next LLM call with no restart | R-MODEL-2, AC-LEASH-5 |
| USDC float is on Base (eip155:8453) | R-LEASH-1 |
| Float top-up is operator-triggered via UA SDK, NOT wired into x402 payment loop | R-LEASH-6, Constraint 2 |
| Server key never exposed in client UI | R-LEASH-1 |
| txHash links to block explorer for the settlement network | AC-DASH-1 |
| Feed is reverse-chronological | R-DASH-1 |
| Latency caveat must be communicated to owner: notifications can lag several minutes | R-DASH-2, UX research §C latency caveat |
| "Payments halt" language (hard block framing, not soft notify) | AC-LEASH-2, R-DASH-2 |

### Designer's Call (not specified in spec or stories — designer decides)

| Design decision | Notes for designer |
|---|---|
| Overall layout / information architecture | Sidebar vs top-nav, single-page vs routed sections. No layout prescribed. |
| Whether revocation controls are in a dedicated page, side panel, or modal overlay | Spec says "accessible from the dashboard" — format is open. |
| Color system for spend bar states (neutral / warning / danger) | Spec says colors shift at 75% and 100% — exact palette is designer's call. |
| Color system for status badges and notification tiers | Agent state and tier mapping to color. |
| Whether receipt detail is a side panel, modal, or separate page | Spec says "row shows" — expansion affordance not prescribed. |
| Model picker affordance: dropdown, radio card grid, list with icons | Spec says "dropdown or settings panel" — both acceptable. |
| Save confirmation mechanism for model picker: explicit Save button vs auto-save | Open question from story-7. |
| Save confirmation mechanism for cap: toast vs inline vs persistent success state | Not prescribed. |
| Confirmation friction for Level 3 (Cancel): text input vs checkbox vs typed confirmation | Spec says "hard block with confirmation"; exact affordance is designer's call. Reference: Vercel team-name input. |
| Confirmation friction for Level 4 (Nuclear): exact input, copy, and destructive button treatment | Spec says "nuclear" is highest friction — visual severity is designer's job. |
| Navigation between screens: tabs, sidebar, discrete pages | Not prescribed. |
| Tier 1 badge surface: in-app indicator, browser tab favicon counter, or both | Spec says "badge count updates" — where the badge lives is open. |
| Whether blocked-attempt rows appear inline in the main feed or in a separate audit panel | Open question from story-5. |
| Feed live-update indicator | Polling vs websocket vs SSE is an architecture choice; the visual treatment of "live" is design. |
| Low-float threshold: at what dollar amount does float enter warning state | Not specified. Product decision (designer should flag to product). |
| Agent name / ID display and whether owners can rename agents | Not specified. |
| Mobile-responsive behavior of this surface (distinct from the PWA mobile surface) | Not prescribed. |
| Whether the model picker is a sub-screen or an inline component on the overview | Not prescribed beyond "dropdown or settings panel". |

---

## Open Questions

These items are unresolved in the spec and stories. The designer cannot finalize the affected screens without answers. Each traces to a story open question or spec OQ.

1. **What reset-frequency options are offered in the cap configuration?** The spec names "amount + reset frequency" but does not enumerate the valid periods. Standard industry set (Ramp/Brex/Stripe): Daily / Weekly / Monthly / Quarterly / Annually / Does not reset. The cap screen and cycle reset logic depend on this being defined. Source: story-4 OQ-1.

2. **What happens when the owner lowers the cap below the current cumulative spend?** For example: cumulative is $8.00, owner lowers cap to $6.00. Does this trigger an immediate Tier 3 notification and immediate payment block? Or does it only block the next payment attempt? The spend bar layout and the save-success state on Screen 4 cannot be finalized without this. Source: story-4 OQ-2.

3. **What is the full curated model list?** R-MODEL-1 says "at minimum" one per provider family. The exact list (how many models per provider, which specific model IDs) is unspecified. Screen 7 layout depends on list length. Source: story-7 OQ-1.

4. **Is the model picker save explicit (Save button) or implicit (auto-save on selection)?** This changes both the interaction flow and the error-handling design on Screen 7. Source: story-7 OQ-2.

5. **What defines "unusual or unrecognized resource URL" for Tier 2 triggering?** R-DASH-3 names this as a Tier 2 trigger but does not define the detection mechanism. A whitelist? A first-seen heuristic? Domain pattern matching? Without this, the Tier 2 notification message copy and the Screen 5 filter logic are incomplete. Source: story-5 OQ-1.

6. **What is the dashboard polling interval for receipt updates?** AC-DASH-1 says "within the polling interval" — the interval is not specified. This determines whether "real-time" is accurate in the demo. Source: story-5 OQ-2.

7. **Do blocked-attempt rows appear in the main receipt feed (Screen 2) or a separate audit log?** The spec logs blocked attempts (R-LEASH-3) and they appear in story-5 scenario 3 as a "failed" feed entry — but "blocked" and "failed" are distinct statuses. Whether they coexist in the same feed row set or are in a separate section is unresolved. Source: story-5 OQ-3.

8. **At what USDC balance does the "low float" warning trigger on Screen 8?** No threshold is defined in the spec. This is a product decision the designer should flag.

9. **Is Tab-as-x402-resource (R-RAIL-1, story-9) surfaced anywhere in the dashboard?** If the Leash agent pays a Tab checkout endpoint headlessly, that receipt appears in the same feed (same data shape). The designer does not need a separate screen for this — but the receipt row's resource URL would be the Tab endpoint, and the network would be Arbitrum One (not Base), which the receipt detail on Screen 3 must accommodate. OPEN: does the feed visually distinguish Arbitrum settlement from Base settlement?

---

*End of surface map: Leash agent-owner web dashboard*
