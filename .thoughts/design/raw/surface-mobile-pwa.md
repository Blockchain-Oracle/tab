# Surface Map: Leash Mobile PWA Monitor

> Surface: Leash mobile PWA monitor  
> Authored: 2026-07-02  
> Traces to: R-DASH-6, AC-MOBILE-1; Story 5 (owner watches + notified); Story 6 (owner revokes)  
> Constraint: mobile holds NO private key, performs NO signing, makes NO EIP-7702 authorization.  
> Revoke = HTTP POST to apps/web backend. Source: Constraint 7; research/x402-tab-leash-mechanics.md §5.

---

## Surface Scope

The mobile PWA is a **read + control client only**. It does three things and nothing else:

1. **Monitor** — shows one USD balance (agent float via `ua.getPrimaryAssets()` USD total) and a live reverse-chronological payment feed (same receipt data as the web dashboard).
2. **Notify** — delivers Web Push notifications for Tier 2 (banner) and Tier 3 (interrupt) events. Routine Tier 1 payments are silent: badge count only, no push.
3. **Revoke** — exposes all four revocation levels (soft pause / freeze / cancel / nuclear) as one-tap HTTP calls to the `apps/web` backend.

No wallet connection, no signing, no chain/gas/bridge language anywhere on this surface.

---

## Screen Inventory

### Screen 1 — Overview (Home)

**Purpose:** The primary landing screen. Shows the agent's USDC float balance in USD, the spend bar (current cumulative spend vs cap), the agent status chip, and entry points to the feed and revoke sheet. This is what the owner sees when they open the PWA.

**Traces to:** R-DASH-6, R-DASH-2, AC-DASH-2; Story 5 (agent running, owner sees balance and spend bar)

**Entry from:** PWA home / push notification tap (when no deep link specified) / back navigation from Feed or Revoke sheet

**Traces to next:** Payment Feed (tap feed row or "View all" link); Revoke Sheet (tap revoke control); agent status chip (inline, no navigation)

---

#### States

**NORMAL (agent running, spend below 75% of cap)**
- Agent status chip: "Active"
- USD balance: numeric, up to date
- Spend bar: filled portion proportional to (current spend / cap), no warning color
- Last-payment summary line: most recent receipt row (amount + resource, truncated) with timestamp
- Feed entry point: "View all payments →"
- Revoke section: collapsed or surfaced as a row labeled "Agent controls"
- No banner, no alert

**NEAR-LIMIT (cumulative spend ≥ 75% of cap — Tier 2)**
Source: R-DASH-2, R-DASH-3, AC-DASH-3-b; UX research §C (Vercel 75% threshold; Brex "approaching or exceeded" notification)

- Same as NORMAL plus:
- Spend bar visual changes to indicate warning (color treatment is designer's call)
- Non-blocking inline banner below the spend bar: "Approaching limit — [current]% used" (text, no modal)
- Agent status chip remains "Active"
- Agent continues running, no pause

**OVER-LIMIT / CAP HIT (cumulative spend would exceed 100% — Tier 3, agent halted)**
Source: R-DASH-3, R-LEASH-3, AC-LEASH-2, AC-DASH-3-c; Story 5 Scenario 3

- Agent status chip: "Halted — cap reached"
- Spend bar: 100% filled, distinct treatment (designer's call)
- Full-width interrupt banner (non-dismissable until owner acts): "Agent halted. Spending cap reached. Raise cap or reset cycle to resume."
- CTA on banner: "Raise cap" (links to cap adjustment — web dashboard deep link or in-PWA control, TBD)
- Revoke section: surfaced prominently (this is the moment the owner most needs control)
- No new x402 payments are being made; feed is static

**PAUSED (soft pause triggered by owner)**
Source: R-DASH-4 Level 1; AC-LEASH-3; Story 6 Scenario 1

- Agent status chip: "Paused"
- Spend bar: shows current spend at time of pause, no animation
- Inline status note: "Agent loop halted. Payments suspended. Server key intact."
- Resume control visible: "Resume agent" (one-tap HTTP call)
- Feed is static (no new rows arriving)

**FROZEN (freeze triggered by owner)**
Source: R-DASH-4 Level 2; Story 6 Scenario 2

- Agent status chip: "Frozen"
- Spend bar: static
- Inline status note: "Agent frozen. No transactions can be submitted. Key intact."
- Resume control visible: "Unfreeze agent"
- Feed is static

**CANCELLED (key rotated, re-provisioning required)**
Source: R-DASH-4 Level 3; Story 6 Scenario 3

- Agent status chip: "Cancelled — provisioning required"
- Spend bar: grayed / inactive
- Inline status note: "Server key rotated. Agent cannot transact until a new key is provisioned."
- No resume control (permanent until operator action)
- Feed is static

**NUCLEAR / NOT PROVISIONED (key deleted)**
Source: R-DASH-4 Level 4; AC-LEASH-4; Story 6 Scenario 4

- Agent status chip: "Not provisioned"
- Spend bar: absent or fully grayed
- Inline status note: "Server key deleted. Re-provisioning required before agent can operate."
- No resume control, no revoke controls (nothing to revoke)
- Feed is static
- Matches web dashboard "not provisioned" state per AC-LEASH-4

**OFFLINE (PWA has no network connection)**
- Agent status chip: "Offline — last seen [timestamp]"
- Spend bar: shows last known values with a stale indicator
- Inline banner: "No connection. Data shown is from [time]. Pull to refresh."
- All controls (revoke, resume) disabled with a "No connection" tooltip on tap
- Feed shows last-fetched rows, no new rows

**LOADING (initial fetch in progress)**
- Agent status chip: skeleton / shimmer
- Balance: skeleton line
- Spend bar: skeleton
- No feed rows yet
- Source: UX research §A (skeleton screens, not full-page spinner; layout preserved during load)

---

#### On-Screen Data Shape (Overview)

| Field | Source | Display format |
|---|---|---|
| USD float balance | `ua.getPrimaryAssets()` → `totalAmountInUSD` | "$X,XXX.XX" (fiat-first, no chain label) |
| Current cumulative spend | Persistent ledger sum of settled receipts in current cycle | "$X,XXX.XX" |
| Cap | Owner-set cap value | "$X,XXX.XX" |
| Spend percentage | (current / cap) × 100 | "XX%" displayed on or near bar |
| Agent status | Backend agent state field | Status chip label (see States above) |
| Last-payment summary | Most recent receipt row | "[amount] — [resource domain] · [relative timestamp]" |
| Cap reset frequency | Owner configuration | "Resets [daily / weekly / monthly]" (shown near spend bar) |

---

### Screen 2 — Payment Feed

**Purpose:** Full reverse-chronological list of x402 payment receipts. Same receipt data as the web dashboard. Allows the owner to inspect every payment the agent made, including failures and blocked attempts.

**Traces to:** R-DASH-1, R-DASH-6, R-LEASH-4, AC-DASH-1, AC-LEASH-1; Story 5 AC-1, AC-2, AC-3

**Entry from:** Overview "View all payments →" link; push notification tap with feed deep link; direct PWA URL

**Traces to next:** Receipt Detail overlay (tap on a feed row); back to Overview

---

#### States

**POPULATED (settled receipts exist)**
- Rows in reverse-chronological order, most recent at top
- Each row: receipt card (see data shape below)
- Success rows: status badge "Settled"
- Failed rows: status badge "Failed" (distinct treatment, designer's call)
- Blocked-attempt rows: status badge "Blocked" (cap enforcement; payment never submitted)
- Source: Story 5 Scenario 3 (blocked attempt logged in feed with status "failed"); R-LEASH-3 ("logs the attempt")

**EMPTY (no receipts yet in current cycle)**
- Empty state copy: "No payments yet. The agent hasn't made any x402 payments this cycle."
- No error, no alert
- Source: UX inference — empty state must not look broken

**LOADING (initial fetch)**
- Skeleton rows (layout preserved, shimmer animation)
- Source: UX research §A (skeleton screens)

**OFFLINE (no network)**
- Last-fetched rows visible, stale indicator on each row (e.g., "[X] minutes ago — may be stale")
- New rows do not arrive
- Pull-to-refresh triggers connection re-attempt

**NEAR-LIMIT BANNER (spend ≥ 75%)**
- Non-dismissable top-of-feed banner: "Approaching spending cap — XX% used."
- Feed rows continue to populate beneath it
- Source: R-DASH-3 Tier 2; Story 5 Scenario 2

**OVER-LIMIT INTERRUPT (agent halted)**
- Sticky non-dismissable interrupt banner at top: "Spending cap reached. Agent halted. No further payments will be made."
- Feed rows remain visible below (static)
- Source: R-DASH-3 Tier 3; Story 5 Scenario 3

**PAUSED / FROZEN / CANCELLED / NUCLEAR**
- Feed shows historical rows (read-only, static)
- Status banner at top matches Overview status label
- No new rows arrive

---

#### On-Screen Data Shape (Feed Row / Receipt Card)

Each row in the feed is a receipt card. These fields are DECIDED by spec and story (R-LEASH-4, AC-DASH-1, Story 5 AC-2):

| Field | Source | Display format |
|---|---|---|
| Amount (USD-denominated) | Receipt: `amount` in USD display | "$X.XX" (fiat-first, primary) |
| Amount (atomic) | Receipt: `amount` in atomic units | Secondary/smaller, or omitted — designer's call |
| Resource / payTo | Receipt: `payTo` endpoint URL | Domain + path, truncated; full URL on expand |
| Timestamp | Receipt: `timestamp` | Relative ("2 min ago") with absolute on tap or long-press |
| txHash | Receipt: `txHash` from `X-PAYMENT-RESPONSE` | Shortened hash (first 6 + last 4 chars); tapping opens block explorer for the settlement network |
| Settlement network | Receipt: `network` | Silent (not shown to owner in the primary label — chain language hidden per R-TAB-9 philosophy); shown in receipt detail if needed |
| Status | Receipt: `success` boolean + blocked flag | Badge: "Settled" / "Failed" / "Blocked" |
| Trigger URL | Receipt: URL that triggered the agent action | Shown in receipt detail overlay |

**NOTE:** "Failed" and "Blocked" are distinct statuses. "Failed" = x402 call was made but settlement failed (network error, facilitator rejection). "Blocked" = payment was never submitted because the cap check fired first (R-LEASH-3). Both are logged. Neither increases cumulative spend.

---

### Screen 3 — Receipt Detail (Overlay / Sheet)

**Purpose:** Expanded view of a single receipt row. Shows the full data that is truncated in the feed row. Tapping the txHash opens the block explorer.

**Traces to:** R-DASH-1, R-LEASH-4, AC-DASH-1; Story 5 AC-2

**Entry from:** Tap on any feed row in Screen 2

**Traces to next:** Block explorer (external, opens in browser); back to Feed

---

#### States

**SETTLED RECEIPT**
All receipt fields fully populated (see feed row data shape). txHash tappable, opens block explorer URL for the settlement network.

**FAILED RECEIPT**
All fields populated where available. txHash may be absent (if settlement never reached the chain). Status: "Failed". Error context if available (e.g., "Facilitator rejected payment").

**BLOCKED RECEIPT**
txHash absent (no transaction was made). Status: "Blocked". Copy: "This payment was not submitted — spending cap was reached before the x402 call was made."

---

#### On-Screen Data Shape (Receipt Detail)

All fields from the feed row, plus:

| Field | Display format |
|---|---|
| Full resource URL (`payTo`) | Full untruncated URL, copyable |
| Settlement network | Shown here (owner-level detail) |
| Trigger URL | Full URL that caused the agent to attempt this payment |
| Block explorer link | Full URL for `txHash` on the settlement network's explorer |
| Cycle context | "Payment X of N in current cap cycle" (if countable) |

---

### Screen 4 — Push Notification (Tier 2 and Tier 3)

**Purpose:** Web Push notification delivered to the owner's device when the Tier 2 (banner) or Tier 3 (interrupt) threshold fires. The owner does not need to have the PWA open to receive this.

**Traces to:** R-DASH-3, R-DASH-6, AC-DASH-3-b, AC-DASH-3-c; Story 5 AC-5, AC-7; UX research §C (notification tiering)

**Entry from:** Delivered by the browser's Web Push mechanism when the backend emits a Tier 2 or Tier 3 event. NOT delivered for Tier 1 (routine settled payments). Tier 1 = badge count only, no push.

**Traces to next:** Tapping a Tier 2 notification opens the PWA to the Overview or Feed. Tapping a Tier 3 notification opens the PWA to the Overview with the interrupt banner foregrounded (or directly to the Revoke sheet — designer's call).

---

#### Tier 2 — Banner Notification (approaching limit or unusual URL)

**Trigger conditions (R-DASH-3):**
- Cumulative spend reaches or passes 75% of cap
- Payment to an unrecognized or unusual resource URL (Story 5 AC-6)

**Copy format (source: UX research §C MessageFlow fintech patterns; rule: title 6–8 words, body ~10 words):**

Approaching cap (75%):
- Title: "Leash: approaching spending cap"
- Body: "Agent has used XX% of $[cap]. [XX] remaining."

Unusual resource URL:
- Title: "Leash: unusual payment destination"
- Body: "Agent paid [domain] — tap to review."

**On-screen data shown in the notification:**
- App name / icon
- Title (6–8 words)
- Body (~10 words)
- Timestamp (OS-rendered)

No action buttons required on the Tier 2 push itself (informational; agent continues running). Tapping navigates into the PWA.

---

#### Tier 3 — Interrupt Notification (cap exceeded, agent halted)

**Trigger conditions (R-DASH-3, R-LEASH-3, AC-LEASH-2):**
- A payment attempt would push cumulative spend past 100% of cap → payment blocked, agent halted, Tier 3 fires

**Copy format:**

Cap exceeded (agent halted):
- Title: "Leash: agent halted — cap reached"
- Body: "Spending cap hit. Agent stopped. Tap to review and resume."

**On-screen data shown in the notification:**
- App name / icon
- Title
- Body
- Timestamp (OS-rendered)
- Optional action button: "Review" (opens PWA Overview with interrupt state) — implementation depends on Web Push API capability on target OS

**Anti-cry-wolf rule (R-DASH-3, UX research §C):** Tier 3 MUST NOT fire for routine settled payments. If the Tier 3 notification fires, the owner must be able to trust that something requires their action. One false-alarm Tier 3 destroys the notification system's credibility.

---

### Screen 5 — Expanded Notification View (Notification Tray / Lock Screen)

**Purpose:** The OS-expanded version of the Tier 2 or Tier 3 push notification, shown when the owner expands the notification in the system tray or on the lock screen without opening the app. This is a read state; the owner sees more detail without fully entering the PWA.

**Traces to:** R-DASH-6; UX research §C (notification tiering)

**Entry from:** OS notification expansion (long-press or notification tray expand gesture) on Screen 4

**Traces to next:** Tapping "Open" or the notification body opens PWA Overview / Feed / Revoke sheet (depending on tier)

---

#### On-Screen Data Shape (Expanded Notification)

For Tier 2 (approaching limit):
- App name + icon
- Title: "Leash: approaching spending cap"
- Body: "Agent has used XX% of $[cap]. [Amount] remaining before halt."
- Expanded detail (if supported by OS): current spend + cap + last payment amount + resource
- Tap target: opens PWA

For Tier 3 (agent halted):
- App name + icon
- Title: "Leash: agent halted — cap reached"
- Body: "Spending cap hit. Agent stopped. No further payments will be made until you act."
- Expanded detail (if supported): blocked amount + resource URL + current spend vs cap
- Tap target: opens PWA to interrupt state
- Action button (if supported): "Review" → Overview; "Revoke" → Revoke sheet (designer's call whether to include a direct-to-revoke action in the notification itself)

---

### Screen 6 — Revoke Sheet (Bottom Sheet / Modal)

**Purpose:** The owner's control panel for all four revocation levels. Accessible from the Overview and from the interrupt state. Each control is a single HTTP call to the `apps/web` backend — no signing, no key, no chain interaction on-device.

**Traces to:** R-DASH-4, R-DASH-6, AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1; Story 6 (all scenarios); Constraint 7

**Entry from:** Overview "Agent controls" row tap; Tier 3 interrupt banner CTA; push notification action button (if implemented)

**Traces to next:** On any revoke action: sheet closes, Overview updates to reflect new agent state (status chip changes, spend bar grays, resume control appears or disappears)

---

#### States

**DEFAULT (agent active — all four levels available)**
All four revoke actions shown. No pre-selected option. Destructive levels (cancel, nuclear) have a confirmation step. Source: UX research §C (Vercel requires team-name typing before pause; Brex 6-second undo). The exact confirmation pattern for destructive levels is the designer's call (confirmation dialog vs. hold-to-confirm vs. type-to-confirm).

**PAUSED STATE (soft pause active)**
- "Soft pause" control changes to "Resume" (same HTTP endpoint, toggle behavior)
- Freeze, Cancel, Nuclear remain available (paused agent can still be escalated to a higher revocation level)

**FROZEN STATE (freeze active)**
- "Freeze" control changes to "Unfreeze" (resumable)
- Soft pause control is redundant but may remain visible as a lesser action
- Cancel, Nuclear remain available

**CANCELLED STATE (key rotated)**
- Soft pause and Freeze controls grayed / disabled (no loop to pause; key is rotated)
- Cancel control shows "Cancelled" (non-interactive, status indicator)
- Nuclear remains available (can still delete the new key if provisioned — or is grayed if no key exists yet)

**NOT PROVISIONED / NUCLEAR STATE**
- All revoke controls grayed / disabled
- Status: "Not provisioned — no key to revoke"
- Re-provisioning callout: "Re-provisioning requires operator action on the server."

**OFFLINE**
- All controls disabled
- Tooltip on tap: "No connection. Connect to network to revoke."
- Status chip: offline indicator

**IN-FLIGHT (revoke HTTP call in progress)**
- Tapped control shows loading spinner
- Other controls disabled during the HTTP round trip
- Source: AC-MOBILE-1 (halt takes effect within HTTP round-trip latency; the in-flight state must be represented)

**CONFIRMED / SUCCESS (revoke action completed)**
- Sheet closes (or shows a brief inline confirmation before closing)
- Overview updates status chip
- Source: UX research §C (post-action feedback; Brex 6-second undo model)

---

#### On-Screen Data Shape (Revoke Sheet)

| Control | Label | Action description | Reversibility |
|---|---|---|---|
| Level 1 | "Pause agent" / "Resume agent" (toggles) | Halts agent loop; key intact | Resumable |
| Level 2 | "Freeze agent" / "Unfreeze agent" (toggles) | Agent cannot transact; key intact | Resumable |
| Level 3 | "Cancel agent" | Rotates server key; agent dead until new key provisioned | Permanent until re-provisioned |
| Level 4 | "Nuclear — delete key" | Deletes server key from secrets store; full stop | Permanent; manual re-provisioning only |

**Confirmation requirement (decided — destructive levels need confirmation; UX treatment is designer's call):**
- Levels 1 and 2 (reversible): single tap executes.
- Levels 3 and 4 (permanent): require a confirmation step before executing. The form of confirmation (dialog box, type-to-confirm, hold-to-confirm) is the designer's call.

**Supporting data shown in the sheet:**
- Current agent status (chip)
- Current cumulative spend vs cap (compact spend bar or text)
- Last-payment timestamp ("Last payment: 3 minutes ago")

---

## Artifacts and Generated Content

### Push Notification Copy Templates

These are the canonical copy strings for Tier 2 and Tier 3 push notifications. They encode the anti-cry-wolf rule and the "title 6–8 words, body ~10 words" format from UX research §C.

**Tier 2 — approaching cap:**
```
Title: "Leash: approaching spending cap"
Body: "Agent at XX% of $[cap]. [Amount] remaining."
```

**Tier 2 — unusual resource:**
```
Title: "Leash: unusual payment destination"
Body: "Agent paid [domain] — tap to review."
```

**Tier 3 — agent halted:**
```
Title: "Leash: agent halted — cap reached"
Body: "Spending cap hit. Agent stopped. Tap to act."
```

### Status Chip Vocabulary

The agent status chip is the single most-read element on the Overview. Its label must be unambiguous at a glance. Decided vocabulary (maps to the four-level spectrum + normal and offline states):

| Agent State | Status Chip Label |
|---|---|
| Running normally | "Active" |
| Soft paused | "Paused" |
| Frozen | "Frozen" |
| Cancelled (key rotated) | "Cancelled" |
| Nuclear / not provisioned | "Not provisioned" |
| Cap hit / halted | "Halted — cap reached" |
| Offline (no network data) | "Offline" |

---

## Copy and Vocabulary Rules (This Surface)

These rules govern every string on the mobile PWA monitor surface.

**1. No crypto-infrastructure language.**
Do not use: "chain", "gas", "bridge", "EOA", "EIP-7702", "wallet address", "sign", "Base", "Arbitrum", "USDC" (unless the owner has explicitly configured USDC as their display currency). The owner sees USD amounts and agent states, not blockchain primitives. Source: R-TAB-9 philosophy extended to the operator surface; R-DASH-6.

**2. The "leash" is economic and operational — never cryptographic.**
Do not use: "session key", "delegation", "on-chain revoke", "smart contract". The revoke is an HTTP call. The cap is app-layer policy. The copy must be honest about this. Source: Spec Non-Goals; story-6-owner-revokes.md Notes; research/ideas/leash.md (brutal honesty section).

**3. Revocation levels must use plain-language, escalating vocabulary.**
"Pause" < "Freeze" < "Cancel" < "Nuclear" is the escalation ladder. "Pause" and "Freeze" are reversible; the copy must signal this. "Cancel" and "Nuclear" are permanent; the copy must signal this without triggering undue panic for normal use. Source: R-DASH-4; UX research §C (revocation spectrum).

**4. Tier 3 must never fire for routine events.**
The copy rule reinforces the notification rule: if a Tier 3 fires, the body must state what requires action. Never vague copy ("something happened") on a Tier 3. Source: R-DASH-3; UX research §C (anti-cry-wolf rule).

**5. Balance and amounts are always USD-denominated, fiat-first.**
$X.XX format. The owner manages spend in dollars, not in USDC atomic units or chain-native amounts. Source: R-LEASH-4 (USD-denominated display); UX research §C (USD-denominated display confirmed for agentic wallets); UX research §A ("0.00342 BTC ($285.00 USD)" — fiat first, larger).

**6. Status vocabulary is consistent across web dashboard and mobile PWA.**
The agent status chip labels on mobile must exactly match the labels on the web dashboard. Mixed vocabulary ("Halted" in one place, "Stopped" in another) creates ambiguity for operators switching surfaces. Source: AC-MOBILE-1 (same halt as web dashboard).

**7. Mobile controls never expose key mechanics.**
Revoke sheet labels say "Pause agent / Cancel agent / Nuclear — delete key." The label "Nuclear — delete key" is honest about what happens without exposing implementation details (secrets vault, key rotation mechanism). Source: Constraint 7.

---

## Decided vs Designer's Call

### DECIDED (in spec, stories, or research — not a design variable)

**Screens and navigation:**
- Mobile surface has exactly: Overview, Payment Feed, Receipt Detail, Push Notification, Expanded Notification View, Revoke Sheet. No other screens are in scope (no onboarding, no settings, no model picker, no cap configuration — those are web dashboard features).
- Source: R-DASH-6 ("Monitor / Notify / Revoke only").

**Balance source:**
- The USD balance on Overview comes from `ua.getPrimaryAssets()` → `totalAmountInUSD`. One number, no per-chain breakdown.
- Source: R-DASH-6; R-TAB-6.

**Feed data:**
- Reverse-chronological order. Five required fields per row: amount (USD), resource URL, timestamp, txHash (block-explorer-linked), status (success/failed).
- Blocked-attempt entries appear in the same feed as settled entries, not in a separate audit log.
- Source: R-DASH-1, R-LEASH-4, AC-DASH-1, Story 5 AC-2; Story 5 OQ-3 (answered here: same feed).

**Notification tiers:**
- Tier 1 = no push, badge only. Tier 2 = push banner. Tier 3 = push interrupt.
- Source: R-DASH-3; R-DASH-6.

**Four revocation levels and their reversibility:**
- Soft pause (resumable) / Freeze (resumable) / Cancel (key rotated, permanent until re-provisioned) / Nuclear (key deleted, permanent).
- Source: R-DASH-4; Story 6; UX research §C revocation spectrum.

**No signing on mobile:**
- All revoke actions are HTTP calls to apps/web backend. No EIP-7702, no signMessage, no private key, no wallet connection on the mobile device.
- Source: Constraint 7; AC-MOBILE-1; R-DASH-6.

**Destructive actions (Cancel, Nuclear) require a confirmation step:**
- Levels 3 and 4 must have a confirmation step before executing. The anti-pattern (single-tap permanent action with no confirmation) is not acceptable for a permanent key operation.
- Source: UX research §C (Vercel requires team-name typing before pause; kill-switch confirmation patterns).

**Notification copy format:**
- Title: 6–8 words. Body: ~10 words.
- Source: UX research §C (MessageFlow fintech notification format rule).

**Spend bar thresholds:**
- 75% threshold triggers Tier 2 banner. 100% cap hit triggers Tier 3 interrupt and agent halt.
- Source: R-DASH-2, R-DASH-3; UX research §C (Vercel 75% threshold).

**Status chip vocabulary:**
- Seven defined states listed in the Status Chip Vocabulary table above. Chip labels must match web dashboard labels exactly.
- Source: AC-MOBILE-1; R-DASH-4; AC-LEASH-4.

**Offline state must be represented on all screens:**
- Mobile is a PWA; network loss is a real condition. All screens must have an offline state. Controls are disabled when offline.
- Source: General PWA constraint; AC-MOBILE-1 (revoke must work within HTTP round-trip — implies failure must be handled).

---

### DESIGNER'S CALL (layout, visual treatment, information hierarchy — not specified anywhere)

- Color system, typography, spacing, corner radius, icon set.
- How the spend bar is visually styled in normal, near-limit, and over-limit states (color is a design tool; only the threshold trigger points are decided).
- Whether the Revoke Sheet is a bottom sheet (swipe-up), a modal dialog, or a full-screen overlay.
- Whether Level 1 (soft pause) and Level 2 (freeze) are shown as toggle buttons (Pause/Resume, Freeze/Unfreeze) or as separate controls with state-aware visibility.
- Exact form of confirmation for Levels 3 and 4: dialog + "Confirm" button, type-to-confirm ("type CANCEL to proceed"), or hold-to-confirm gesture.
- Whether the Revoke Sheet is reachable from the Overview via a prominent CTA or a secondary "Agent controls" entry point (collapsed vs always-visible).
- Whether the feed row shows the atomic amount alongside the USD amount, or USD only.
- Whether the txHash in the feed row is shown as "0x1a2b…cd9e" (shortened) or hidden until the receipt detail is opened.
- Whether the expanded notification (Screen 5) includes a "Revoke" action button in the notification tray (OS-capability-dependent; designer decides whether to implement it).
- How the "last payment" summary line on Overview truncates long resource URLs.
- Whether the feed's EMPTY state uses an illustration, a plain text message, or a simple icon.
- Whether the cap and reset frequency are shown on the Overview inline below the spend bar, or in a separate section.
- Tab bar vs. header navigation vs. single-scroll layout on the PWA.
- Dark mode treatment.
- PWA install prompt timing and design.

---

## Open Questions Raised by This Surface Map

These are gaps not resolvable from the spec, stories, or research alone. They must be answered before the designer can close the spec.

**OQ-A — What defines "unrecognized or unusual resource URL" for Tier 2?**
Story 5 OQ-1 remains open. The Tier 2 notification for unusual URL (R-DASH-3) cannot be implemented or designed until this detection mechanism is defined (whitelist, first-seen heuristic, domain pattern, manual flag). This affects what the Tier 2 notification body says and whether the Feed row has a visual "unusual" flag.

**OQ-B — What is the polling interval for the feed?**
Story 5 OQ-2 remains open. The mobile feed updates on a polling interval (or WebSocket push). The interval affects how the "last seen" stale indicator is calculated in offline mode and what "within the polling interval" means in AC-DASH-1. Designer needs to know whether rows feel real-time or batched.

**OQ-C — Does the mobile Overview also show the cap configuration (amount + reset frequency), or is cap configuration web-dashboard-only?**
R-DASH-5 (cap adjustment) is not assigned to the mobile surface; R-DASH-6 does not include cap adjustment in the mobile scope. The designer needs to know whether the cap value is read-only on mobile (visible but not editable) or fully absent. Recommended: show cap value read-only on Overview (owner needs context to interpret the spend bar), but cap editing is web-dashboard-only.

**OQ-D — Does the revoke sheet distinguish soft pause from freeze in the implementation (not just the label)?**
Story 6 OQ-1 remains open. Soft pause = scheduler-level halt; Freeze = payment-gate check inside a running loop. If they produce identical visible outcomes on the mobile surface (both show "agent not transacting"), the designer may need to explain the distinction to the owner within the sheet. Or they are presented identically and the distinction is hidden. This is a product decision, not a visual one — but it affects copy.

**OQ-E — Mobile surface tech: Next.js /mobile route vs. separate Vite build (OQ-6 from spec)?**
This is marked "proposed pending Abu's confirm" (Spec OQ-6). The decision affects whether Web Push is delivered via a Next.js API route (service worker registered under the same origin) or a separate PWA origin. Does not change the screen inventory, but the designer needs to know the URL structure for deep links from notifications.

**OQ-F — Does the Tier 3 push notification include a "Revoke" action button?**
On iOS and Android, Web Push notifications can carry action buttons ("Review" / "Revoke"). Including a "Revoke" button on the Tier 3 notification enables the owner to revoke from the lock screen without opening the PWA. This is a product decision (it calls the backend without the PWA being open, which requires a service worker HTTP call). If implemented, which revoke level does the one-tap "Revoke" in the notification trigger? Probably soft pause (least destructive). This must be decided before the notification design is finalized.

---

## Requirement Traceability Index

| Screen / Element | Requirement IDs | Story |
|---|---|---|
| Overview — USD balance | R-DASH-6, R-TAB-6 | Story 5 |
| Overview — spend bar | R-DASH-2, R-DASH-6 | Story 5 |
| Overview — agent status chip | R-DASH-4, R-DASH-6, AC-LEASH-4 | Story 6 |
| Overview — near-limit banner (75%) | R-DASH-2, R-DASH-3 | Story 5 Scenario 2 |
| Overview — over-limit interrupt (100%) | R-DASH-3, R-LEASH-3, AC-LEASH-2 | Story 5 Scenario 3 |
| Overview — paused / frozen / cancelled / nuclear states | R-DASH-4 | Story 6 |
| Overview — offline state | R-DASH-6, AC-MOBILE-1 | — |
| Payment Feed — reverse-chronological receipts | R-DASH-1, R-DASH-6, R-LEASH-4 | Story 5 AC-1, AC-2 |
| Payment Feed — failed/blocked rows | R-LEASH-3, R-LEASH-4, AC-LEASH-2 | Story 5 AC-3, AC-7 |
| Payment Feed — five required fields per row | R-DASH-1, R-LEASH-4, AC-DASH-1 | Story 5 AC-2 |
| Receipt Detail — txHash + block explorer | R-DASH-1, R-LEASH-4 | Story 5 AC-2 |
| Push Notification Tier 2 (75% / unusual URL) | R-DASH-3, R-DASH-6 | Story 5 AC-5, AC-6 |
| Push Notification Tier 3 (cap hit) | R-DASH-3, R-DASH-6, AC-LEASH-2 | Story 5 AC-7 |
| Tier 1 = no push, badge only | R-DASH-3 | Story 5 AC-4 |
| Revoke Sheet — all four levels | R-DASH-4, R-DASH-6 | Story 6 AC all |
| Revoke = HTTP call, no signing | R-DASH-6, AC-MOBILE-1, Constraint 7 | Story 6 Scenario 5 |
| Destructive level confirmation | UX research §C kill-switch patterns | Story 6 |
| Status chip vocabulary | R-DASH-4, AC-LEASH-4, AC-MOBILE-1 | Story 6 Scenario 4 |
| Nuclear = "not provisioned" dashboard state | AC-LEASH-4 | Story 6 Scenario 4 |
