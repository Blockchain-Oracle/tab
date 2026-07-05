# Product Surface Map: Tab + Leash

> Assembled 2026-07-02 from four raw surface maps (surface-buyer-checkout.md, surface-merchant-dev.md, surface-leash-dashboard.md, surface-mobile-pwa.md) cross-checked against the canonical spec (specs/2026-07-02-tab-leash.md). This document is the single designer-facing source of truth for screen inventory, states, data shapes, copy rules, and open questions across all four surfaces. No visual direction, layout, or code architecture is implied here.
>
> **Architecture update (2026-07-02):** Leash is a multi-chain x402 auto-payer. The agent does NOT pick a model — the owner's own external agent is the user. Pre-positioned USDC floats sit on **Base (primary)**, Arbitrum One, and Polygon; one Particle UA treasury balance rebalances them in the background. The dashboard shows per-chain float balances plus the unified UA treasury total (`getPrimaryAssets`). Each payment settles on whichever chain held the float; receipt rows show the actual settlement network. The agent setup screen is about connecting the owner's external agent (Leash MCP server / HTTP wrapper + a Leash key) — not model selection. Raw surface maps pre-dating this update that reference a single Arbitrum One float are superseded.

---

## Entry Points and Navigation Flow

### Buyer — shortest path to core action

```
Merchant page loads → <PayButton> IDLE ("Pay $X.XX" + lock icon)
  → click → LOADING (intent fetch + Magic SDK init)
    → AUTH: Magic email entry (Magic SDK modal)
      → 6-box OTP → auto-submit on 6th digit
        → or: RETURNING_USER_SKIP (valid session → skip OTP entirely)
    → Checkout confirmation panel (balance + "Pay $X.XX" CTA)
      → CONFIRMING → PROCESSING
        → Optimistic success panel (animated checkmark + Reference #)
        ↳ ERROR / retry panel (any failure point → retry in place)
```

Entry: merchant page on load.
Core action: OTP confirmed → balance visible → single CTA tap.
Return: PayButton SUCCESS / ERROR state in merchant page.

### Merchant / Developer — shortest path to first payment

**First visit (sign up):**
```
Sign Up (MA1) → email field → Magic OTP (6-box, auto-submit on 6th digit)
  → Account created → Quickstart (M2)
```

**Return visit (log in):**
```
Log In (MA2) → email field
  → [valid session: OTP skipped → Dashboard home (M4)]
  → [no session: Magic OTP → auto-submit → Dashboard home (M4)]
```

**Post-auth — first payment path:**
```
Quickstart (M2)
  → Step 1: npm install @tab/sdk + create API key (M3)
  → Step 2: Create intent endpoint (code block)
  → Step 3: Add <PayButton> to demo page (M1 — separate route)
  → Step 4: Configure webhook URL + signing secret (M5)
  → Step 5: Test — complete a payment → "Test payment received" milestone banner
    → Switch to Live mode (M7 Go Live modal)
```

Entry: Sign Up (MA1) on first visit; Log In (MA2) on return.
Core action: receive first settled webhook delivery.
Return: Transactions list (M4) as operational home; Settings (MA3) for business config updates.

### Agent Owner (web) — shortest path to core action

```
Dashboard root → Agent Overview (Screen W1) [command bridge]
  → "View all" → Live Payment Feed (Screen W2)
    → row click → Receipt Detail (Screen W3)
  → cap edit → Spend Bar + Cap Configuration (Screen W4)
  → notification badge → Notifications Center (Screen W5)
  → "Revoke" / status CTA → Revocation Controls (Screen W6)
  → "Connect agent" / "Add funds" / "Top up chain" → Agent Connection + Multi-Chain Float (Screen W7)
```

Entry: direct URL / root dashboard route.
Core action: review payment feed + adjust cap or revoke as needed.
Return: Agent Overview on every revisit.

### Agent Owner (mobile PWA) — shortest path to core action

```
PWA home → Overview (Screen P1)
  → "View all payments" → Payment Feed (Screen P2)
    → tap row → Receipt Detail overlay (Screen P3)
  → "Agent controls" → Revoke Sheet (Screen P6)
  ←← Push notification (Screen P4) → tap → Overview or Revoke Sheet
  ←← Expanded notification (Screen P5) → tap → same
```

Entry: PWA home or push notification tap.
Core action: review spend bar + tap revoke if needed — no config, no settings.
Return: Overview on back navigation.

---

## Screen Inventory (by role)

### Buyer

| ID | Screen name | Rendered by |
|---|---|---|
| B1 | `<PayButton>` — embedded in merchant page | Tab SDK |
| B2 | Magic email entry (AUTH phase) | Magic SDK (`loginWithEmailOTP`) |
| B3 | Magic 6-box OTP (AUTH phase) | Magic SDK |
| B4 | Checkout confirmation panel (post-auth) | Tab SDK |
| B5 | Optimistic success panel | Tab SDK |
| B6 | Error / retry panel | Tab SDK |

### Merchant / Developer

| ID | Screen name | Zone |
|---|---|---|
| M1 | Demo merchant checkout page | Zone A (merchant's page) |
| M2 | Dashboard — Quickstart / integration guide | Zone B (Tab dashboard) |
| M3 | Dashboard — API keys panel | Zone B |
| M4 | Dashboard — Transactions / payments list | Zone B |
| M5 | Dashboard — Webhook configuration panel | Zone B |
| M6 | Dashboard — Webhook delivery log (standalone) | Zone B |
| M7 | Test / live mode toggle + Go Live confirmation (persistent control) | Zone B |

### Merchant / Developer — Account & Dashboard

> Real product surface — NOT a demo add-on. Multi-tenant: each merchant account and data are fully isolated. Auth uses the Magic email-OTP SDK (same SDK as the buyer flow). No SSO, 2FA, team/roles/org management, or billing tiers — right-sized scope.

| ID | Screen name | Zone |
|---|---|---|
| MA1 | Sign Up (email + Magic OTP) | Zone B (Tab dashboard) |
| MA2 | Log In (email + Magic OTP; skip if valid session) | Zone B (Tab dashboard) |
| MA3 | Settings (business name, logo, receiving address) | Zone B (Tab dashboard) |

> Screens M2–M7 are the operational dashboard screens (Quickstart, API keys, Transactions, Webhooks, Test/Live toggle). MA1–MA3 are the account-layer screens that gate access. M3 (API keys), M4 (Transactions), M5+M6 (Webhooks) are listed in the Merchant / Developer table above and documented in Per-screen States and Data Shapes below.

---

### Agent Owner (web dashboard)

| ID | Screen name |
|---|---|
| W1 | Agent Overview (Home / Control Center) |
| W2 | Live Payment Feed |
| W3 | Receipt Detail Panel / Overlay |
| W4 | Spend Bar + Cap Configuration |
| W5 | Notifications Center |
| W6 | Revocation Controls |
| W7 | Agent Connection + Multi-Chain Float Management |

### Agent Owner (mobile PWA)

| ID | Screen name |
|---|---|
| P1 | Overview (Home) |
| P2 | Payment Feed |
| P3 | Receipt Detail (Overlay / Sheet) |
| P4 | Push Notification (Tier 2 and Tier 3) |
| P5 | Expanded Notification View (OS tray) |
| P6 | Revoke Sheet |

---

## Per-screen Required States

### B1 — `<PayButton>`

| State | Trigger | Buyer sees |
|---|---|---|
| IDLE | Page load / after ERROR reset | "Pay $X.XX" + lock icon; enabled |
| LOADING | Button clicked | Disabled + spinner; no interim screen |
| AUTH | Magic modal open | Disabled behind modal; modal has focus |
| PROCESSING | OTP resolved + buyer confirmed in B4 | Disabled; "Processing…" / spinner; double-submit blocked |
| SUCCESS | `ua.sendTransaction` returns `transactionId` | Animated checkmark; label morphs to "Done" (or merchant-configured) |
| ERROR | Any failure between LOADING and SUCCESS | Re-enabled; inline error message; data preserved; retry in place |
| DISABLED_INSUFFICIENT_FUNDS | B4 detected balance below amount | Disabled; "insufficient funds" label; no crypto vocabulary |

### B2 — Magic email entry (Magic SDK)

| State | What shows |
|---|---|
| EMAIL_ENTRY | Email field active; CTA disabled until valid email typed |
| EMAIL_SUBMITTING | CTA clicked; field locked; spinner; OTP dispatching |
| BACK_AVAILABLE | Back arrow top-left always present; exits to IDLE or ERROR |

### B3 — Magic 6-box OTP (Magic SDK)

| State | What shows |
|---|---|
| OTP_AWAITING_INPUT | 6 boxes focused; blinking cursor; auto-advance per character |
| OTP_AUTO_SUBMITTING | 6th digit entered; auto-submit; loading indicator |
| OTP_WRONG_CODE | Boxes turn red / clear; error banner; retry in place |
| OTP_EXPIRED | "This code has expired. We've sent a new one." |
| OTP_RATE_LIMITED | "Too many attempts. Please wait N minutes." |
| OTP_NOT_RECEIVED | "Resend code" link active; enters ~30s countdown after resend |
| RETURNING_USER_SKIP | Valid Magic session exists; Screens B2 and B3 skipped; button proceeds LOADING → B4 |

### B4 — Checkout confirmation panel

| State | What shows |
|---|---|
| BALANCE_LOADING | Panel visible; balance field skeleton / spinner; CTA disabled |
| BALANCE_READY | Balance loaded; CTA enabled |
| INSUFFICIENT_BALANCE | `totalAmountInUSD` below payment amount; CTA disabled or replaced; no chain breakdown |
| CONFIRMING | CTA tapped; CTA disabled; PayButton enters PROCESSING |

### B5 — Optimistic success panel

| State | What shows |
|---|---|
| OPTIMISTIC_SUCCESS | Single state only: animated checkmark + success copy + reference number; fires instantly on `sendTransaction` return |

### B6 — Error / retry panel

| State | What shows |
|---|---|
| INSUFFICIENT_BALANCE_ERROR | No funds to retry until buyer funds elsewhere; no crypto vocabulary |
| TRANSACTION_FAILED | `sendTransaction` threw; buyer not charged; retry available |
| NETWORK_ERROR | Connectivity failure during any async call; retry available |
| MAGIC_AUTH_FAILED | Terminal auth failure (rate-limited / session expired); retry from email step |

---

### M1 — Demo merchant checkout page

| State | What shows |
|---|---|
| INITIALIZING | `<PayButton>` area skeleton/shimmer; layout preserved; no full-page spinner |
| IDLE | "Pay $X.XX" + lock icon; amount from intent endpoint |
| INTENT_FETCH_ERROR | Button disabled; "Unable to load payment details. Try refreshing." |
| AUTH_OPEN | Buyer clicked Pay; Magic modal overlays page; button shows LOADING behind modal |
| AUTH_CANCELLED | Buyer dismissed modal; button returns to IDLE; no error |
| PROCESSING | Auth complete; `sendTransaction` in flight; disabled + "Processing…" |
| SUCCESS | `sendTransaction` returned; animated checkmark; `onSuccess(transactionId, tokenChanges)` fires |
| ERROR | `sendTransaction` threw; "Payment didn't go through. You have not been charged. Try again." |

### M2 — Quickstart / integration guide

| State | What shows |
|---|---|
| PRE_INTEGRATION_EMPTY | All steps visible, none completed; TEST badge; step 1 shows `<YOUR_API_KEY>` placeholder |
| KEY_CREATED | Step 1 code block auto-populates with masked test key prefix; step 1 shows "Done" |
| STEP_COMPLETE | Individual step shows checkmark; auto-detection is DESIGNER'S CALL |
| FIRST_TEST_PAYMENT | "Test payment received. Your integration is working." banner; CTA: "Switch to Live mode" |
| LIVE_MIGRATION | "Go live" step becomes active; test key reminder shown |
| LOADING | Skeleton per step row |

### M3 — API keys panel

| State | What shows |
|---|---|
| EMPTY | "No API keys. Create your first key to start integrating." + "Create key" CTA |
| LOADING | Table skeleton rows |
| LIST | Table of key rows |
| TEST_MODE | All keys test-prefixed; "You are in test mode." banner / badge |
| LIVE_MODE | All keys live-prefixed; no test banner |
| FETCH_ERROR | "Unable to load API keys. Try refreshing." + retry |
| CREATE_FORM (modal) | Fields: key name (optional), permissions radio; "Create key" / "Cancel" |
| CREATING (modal) | Fields disabled; spinner on "Create key" |
| KEY_REVEAL (modal) | Warning banner; full key monospace; copy button; "I've saved my key" CTA |
| KEY_REVEAL_COPY_CONFIRMED | Copy button shows "Copied!" for ~2s |
| KEY_REVEAL_CLOSED | Modal closes; new masked row in list; no reveal option |
| CREATE_ERROR (modal) | "Unable to create key. Try again." Fields preserved. |

### M4 — Transactions / payments list

| State | What shows |
|---|---|
| EMPTY | Illustration + "No payments yet. Complete your integration…" + quickstart link |
| LOADING | Skeleton rows (3–5, matching row height) |
| POPULATED | Rows in reverse-chronological order |
| FILTERED | Active filter chips; "Showing X of Y payments" |
| TEST_MODE | Banner: "Showing test payments only." Rows have TEST badge. |
| LIVE_MODE | No test banner; real payments; test transactions hidden |
| LOAD_MORE | Pagination or infinite scroll (DESIGNER'S CALL) |
| FETCH_ERROR | "Unable to load payments. Try refreshing." + retry |
| DETAIL_EXPANDED | Transaction detail side panel / page open (DESIGNER'S CALL on container) |

### M5 — Webhook configuration panel

Configuration section states:

| State | What shows |
|---|---|
| UNCONFIGURED | "Add a webhook URL to receive payment confirmations." + URL input + "Save" |
| LOADING | Input field skeleton |
| CONFIGURED | Read-only URL display; "Edit" + "Delete" actions; signing secret masked; delivery log section below |
| EDITING | URL field editable; "Save" + "Cancel" |
| SAVING | "Save" button spinner; fields disabled |
| SAVE_SUCCESS | "Webhook URL saved." (auto-dismisses or persists) |
| SIGNING_SECRET_REVEAL | Warning banner ("For security reasons, you can only view this signing secret once. Save it to a secure location."); full `whsec_...` value monospace; copy button; "I've saved my secret" CTA — same one-time-view pattern as API key reveal (OQ-M3 resolved: HMAC signing is confirmed) |
| SIGNING_SECRET_CONFIGURED | Secret masked as `whsec_••••••••[last4]`; "Regenerate" action (immediately invalidates old secret); no reveal option after initial show |
| SAVE_ERROR | "Could not save webhook URL. Check the URL format and try again." |
| DELETE_CONFIRM | "Remove this webhook URL? Tab will not deliver payment notifications until you add a new one." |
| DELETED | Returns to UNCONFIGURED |

Embedded delivery log states: EMPTY / LOADING / POPULATED / EXPANDED_ROW / FETCH_ERROR / RETRYING

### M6 — Webhook delivery log (standalone)

| State | What shows |
|---|---|
| EMPTY | "No webhook deliveries yet." |
| LOADING | Skeleton rows |
| POPULATED | Rows in reverse-chronological order; filtering and pagination |
| EXPANDED_ROW | Full request payload + response body + headers + response time |
| FETCH_ERROR | "Unable to load webhook log. Try refreshing." |
| RETRYING | Row spinner + "Retrying (attempt N of M)" |

### M7 — Test / live mode toggle (persistent control)

| State | What every screen shows |
|---|---|
| TEST_ACTIVE (default) | Persistent TEST badge; "You are in test mode. Test payments are simulated and do not move real funds."; `sk_test_` / `pk_test_` key prefixes; TEST badge per transaction row |
| LIVE_ACTIVE | LIVE badge; no test banners; real payments; test transactions hidden |
| SWITCHING_TEST_TO_LIVE | Go Live confirmation modal opens; toggle suspended |
| SWITCHING_LIVE_TO_TEST | Instant, no confirmation; returns to TEST_ACTIVE |

Go Live modal states: MODAL_OPEN / SWITCHING / SWITCH_SUCCESS / SWITCH_ERROR

---

### MA1 — Merchant Sign Up

| State | What shows |
|---|---|
| IDLE | Email field; "Create account" CTA disabled until valid email entered |
| SUBMITTING | CTA disabled; spinner; Magic OTP email dispatching |
| OTP_AWAITING_INPUT | 6 boxes focused; "Enter the code we sent to [email]"; auto-advance per character |
| OTP_AUTO_SUBMITTING | 6th digit entered; auto-submit; loading indicator |
| OTP_WRONG_CODE | Boxes red / clear; "That code didn't match. Try again."; retry in place |
| OTP_EXPIRED | "This code has expired. We've sent a new one." |
| OTP_RATE_LIMITED | "Too many attempts. Please wait N minutes." |
| EMAIL_ALREADY_REGISTERED | "An account with this email already exists. Log in instead." — inline error; "Log in" link → MA2 |
| SUCCESS | Account created; redirect to Quickstart (M2) |
| ERROR | "Couldn't create your account. Try again." Fields preserved. |

### MA2 — Merchant Log In

| State | What shows |
|---|---|
| IDLE | Email field; "Log in" CTA disabled until valid email entered |
| SUBMITTING | CTA disabled; spinner; OTP dispatching |
| OTP_AWAITING_INPUT | 6 boxes focused; auto-advance per character |
| OTP_AUTO_SUBMITTING | 6th digit entered; auto-submit; loading |
| OTP_WRONG_CODE | Boxes red / clear; error banner; retry in place |
| OTP_EXPIRED | "This code has expired. We've sent a new one." |
| OTP_RATE_LIMITED | "Too many attempts. Please wait N minutes." |
| RETURNING_SESSION | Valid Magic session exists; OTP screen skipped; redirects to Dashboard home (M4) without additional input |
| SUCCESS | Session established; redirect to M4 (return visit) or M2 (first login) |
| ERROR | "Couldn't log in. Try again." |

### MA3 — Merchant Settings

| State | What shows |
|---|---|
| LOADING | Field skeletons; save CTA disabled |
| IDLE | All fields with current saved values; "Save settings" CTA |
| EDITING | One or more fields changed; "Save settings" CTA enabled |
| SAVING | Fields disabled; spinner on "Save settings" |
| SAVE_SUCCESS | "Settings saved." inline confirmation (DESIGNER'S CALL: auto-dismiss or persist) |
| SAVE_ERROR | "Couldn't save settings. Try again." Fields re-enabled; previous values still in effect. |
| LOGO_UPLOADING | Logo upload progress indicator; save CTA disabled during upload |
| LOGO_UPLOAD_ERROR | "Couldn't upload logo. Try a JPG or PNG under 2MB." |

---

### W1 — Agent Overview

| State | What shows |
|---|---|
| ACTIVE | Status "Active"; spend bar neutral; no alert |
| NEAR-LIMIT | Spend ≥75%; Tier 2 banner; bar in warning visual; agent still running |
| AT-LIMIT / HALTED | Spend ≥100%; "Payments halted"; Tier 3 interrupt; owner action required |
| PAUSED | Status "Paused"; resume action prominent; key intact indicator |
| FROZEN | Status "Frozen"; unfreeze action prominent; key intact |
| CANCELLED | Status "Cancelled"; "Needs re-provisioning" notice; no resume |
| NOT PROVISIONED | Status "Not provisioned"; setup prompt prominent; no spend bar or feed |
| LOADING | Skeleton for spend bar and recent receipts |
| EMPTY / NO ACTIVITY | Spend bar at $0.00 / cap; "Your agent hasn't made any payments yet" |
| LOW FLOAT | Float indicator in warning state; "Add funds" CTA surfaced |

### W2 — Live Payment Feed

| State | What shows |
|---|---|
| ACTIVE / UPDATING | New rows prepend; live indicator visible |
| EMPTY | Empty state; "Your agent hasn't made any payments yet" |
| LOADING | Skeleton row placeholders |
| ERROR / LOAD FAILED | Error message; retry; previously loaded rows remain |
| MIXED-STATUS | Each row shows its own status badge |
| NEAR-LIMIT | Spend bar above feed enters warning visual |
| AT-LIMIT | "Payments halted — cap reached" banner above feed; subsequent rows are BLOCKED |
| CAP-RESET | Banner/notice that cycle has reset; feed continues |

### W3 — Receipt Detail Panel / Overlay

| State | What shows |
|---|---|
| LOADED | All fields rendered |
| LOADING | Skeleton within panel |
| BLOCKED DETAIL | No txHash; cap pre-check result shown |
| FAILED DETAIL | txHash may be absent; failure context shown |
| EXPLORER LINK UNAVAILABLE | txHash present but explorer unreachable; link disabled; hash still copyable |

### W4 — Spend Bar + Cap Configuration

| State | What shows |
|---|---|
| UNCONFIGURED | No spend bar; cap form visible; "agent active but uncapped" warning |
| CONFIGURED / ACTIVE | Spend bar; cap amount + frequency shown |
| NEAR-LIMIT (75%+) | Bar in warning visual; "Your agent is approaching its cap." Tier 2 banner |
| AT-LIMIT (100%) | Bar at full with danger visual; "Payments are halted"; CTA: "Raise cap" / "Reset cycle" |
| EDITING | Inline form or modal; current values pre-filled |
| SAVING | Form disabled; spinner |
| SAVE SUCCESS | Spend bar recalculates immediately; confirmation |
| SAVE ERROR | Inline error; form re-enabled; previous cap still in effect |
| MID-CYCLE LOWERED BELOW CURRENT SPEND | Immediate block + Tier-3 notification fires; new (lower) cap takes effect instantly; spend bar recalculates to show 100%+ overage; CTA: "Raise cap" or wait for cycle reset (OQ-W2 resolved) |

### W5 — Notifications Center

| State | What shows |
|---|---|
| EMPTY | "No notifications yet." |
| ALL-TIERS | All tiers reverse-chronological (default view) |
| FILTERED (Tier 2 only) | Only "Alert" events shown |
| FILTERED (Tier 3 only) | Only "Action required" events shown |
| LOADING | Skeleton rows |
| UNREAD / READ | Visual distinction per item; badge clears on screen visit |
| ACTIVE TIER 3 | Unresolved Tier 3 sticky at top until owner acts |

### W6 — Revocation Controls

| State | What shows |
|---|---|
| AGENT ACTIVE | All four levels presented; current state: Active |
| PAUSED | "Resume" prominent; Freeze / Cancel / Nuclear still available |
| FROZEN | "Unfreeze" prominent; Cancel / Nuclear available; soft pause not applicable |
| CANCELLED | Key rotated; "Provision new key" CTA; Nuclear still available |
| NOT PROVISIONED | Key deleted; "Re-provision" CTA; all revoke actions disabled |
| CONFIRM DIALOG (per level) | Level-specific confirmation overlay before action executes |
| EXECUTING | Loading state on button; no second action during HTTP round trip |
| ACTION SUCCESS | State badge updates; success notice; available actions update |
| ACTION ERROR | Error message; previous state unchanged; retry available |

### W7 — Agent Connection + Multi-Chain Float Management

**Connection panel states:**

| State | What shows |
|---|---|
| NOT_CONNECTED | "Connect your agent to start auto-paying x402 resources." Install instructions: MCP server config snippet (copy block) OR HTTP wrapper endpoint; "Your Leash key" shown once (API-key-style reveal, one-time only); "Connect" CTA |
| AWAITING_FIRST_PAYMENT | Key copied; Leash key installed; no traffic yet; "Waiting for your agent's first x402 call." Status indicator: clock/pending |
| ACTIVE | Agent has made at least one payment; status indicator: green / "Paying"; most recent payment timestamp shown |
| CONNECTION_ERROR | Agent installed key but Leash cannot verify reachability (e.g. key never used after 24 h, or revocation event); "Check your agent's Leash configuration." Retry CTA |

**Float management states:**

| State | What shows |
|---|---|
| ALL_CHAINS_FUNDED | Per-chain float panel: Base (primary) / Arbitrum / Polygon each show balance; unified UA treasury total shown below |
| LOW_FLOAT — SINGLE CHAIN | One chain's float below warning threshold; inline warning on that chain row; "Top up Base" / "Top up Arbitrum" / "Top up Polygon" CTA |
| REBALANCING_IN_PROGRESS | Background UA rebalance running; spinner on affected chain row(s); "Topping up from treasury…" |
| REBALANCE_COMPLETE | Chain float updated; brief success notice on row; treasury total recalculates |
| ALL_CHAINS_EMPTY | All chain floats at $0.00; urgent CTA: "Add funds to treasury"; agent cannot pay until at least one chain is topped up |
| TOP-UP IN PROGRESS | Owner-triggered UA SDK transfer executing; spinner; amount + destination chain shown |
| TOP-UP SUCCESS | "Funds added. New [chain] balance: $X.XX USDC." Chain row updates; treasury recalculates |
| TOP-UP ERROR | "Transfer failed. Your unified balance may be insufficient, or the transfer timed out." Retry available |
| REPROVISIONING (post-nuclear) | Connection panel resets to NOT_CONNECTED + "A new Leash key is required after nuclear revocation." |

---

### P1 — Mobile Overview (Home)

| State | What shows |
|---|---|
| NORMAL | Status "Active"; spend bar neutral; last-payment summary; no banner |
| NEAR-LIMIT | Non-blocking inline banner "Approaching limit — XX% used"; bar in warning visual |
| OVER-LIMIT / CAP HIT | Status "Halted — cap reached"; full-width non-dismissable interrupt banner; Revoke section prominent |
| PAUSED | Status "Paused"; "Agent loop halted. Payments suspended. Server key intact." Resume control visible |
| FROZEN | Status "Frozen"; "Agent frozen. No transactions can be submitted. Key intact." Unfreeze visible |
| CANCELLED | Status "Cancelled — provisioning required"; "Server key rotated." No resume control |
| NUCLEAR / NOT PROVISIONED | Status "Not provisioned"; spend bar absent/grayed; no revoke controls |
| OFFLINE | Status "Offline — last seen [timestamp]"; stale indicator; all controls disabled |
| LOADING | Skeleton shimmer on balance, spend bar, status chip; layout preserved; no full-page spinner |

### P2 — Mobile Payment Feed

| State | What shows |
|---|---|
| POPULATED | Rows reverse-chronological; "Settled" / "Failed" / "Blocked" status badges |
| EMPTY | "No payments yet. The agent hasn't made any x402 payments this cycle." |
| LOADING | Skeleton rows; layout preserved; shimmer |
| OFFLINE | Last-fetched rows visible with stale indicator; no new rows; pull-to-refresh re-attempts |
| NEAR-LIMIT BANNER | Non-dismissable top banner "Approaching spending cap — XX% used" |
| OVER-LIMIT INTERRUPT | Sticky non-dismissable banner "Spending cap reached. Agent halted. No further payments will be made."; feed static |
| PAUSED / FROZEN / CANCELLED / NUCLEAR | Historical rows visible read-only; status banner at top |

### P3 — Mobile Receipt Detail

| State | What shows |
|---|---|
| SETTLED RECEIPT | All fields populated; txHash tappable to block explorer |
| FAILED RECEIPT | Fields populated where available; txHash may be absent; error context |
| BLOCKED RECEIPT | No txHash; "This payment was not submitted — spending cap was reached before the x402 call was made." |

### P4 — Push Notification

| State / Tier | Copy |
|---|---|
| TIER 2 — approaching cap | Title: "Leash: approaching spending cap" / Body: "Agent has used XX% of $[cap]. [Amount] remaining." |
| TIER 2 — unusual URL | Title: "Leash: unusual payment destination" / Body: "Agent paid [domain] — tap to review." |
| TIER 3 — agent halted | Title: "Leash: agent halted — cap reached" / Body: "Spending cap hit. Agent stopped. Tap to act." |
| ANTI-CRY-WOLF RULE | Tier 3 MUST NOT fire for routine settled payments — one false-alarm Tier 3 destroys the notification system |

### P5 — Expanded Notification View

| State | What shows |
|---|---|
| TIER 2 EXPANDED | Title + body + expanded detail (current spend, cap, last payment, resource) + tap target to PWA |
| TIER 3 EXPANDED | Title + body + expanded detail (blocked amount, resource URL, current vs cap) + tap target + optional "Review" / "Revoke" action button |

### P6 — Revoke Sheet

| State | What shows |
|---|---|
| DEFAULT (active) | All four levels; no pre-selection; Level 3 + 4 require confirmation step |
| PAUSED | Level 1 shows "Resume agent" (toggle); Freeze / Cancel / Nuclear available |
| FROZEN | Level 2 shows "Unfreeze agent" (toggle); Cancel / Nuclear available |
| CANCELLED | Levels 1–2 grayed; Level 3 shows "Cancelled" (status indicator); Nuclear available if key exists |
| NOT PROVISIONED | All controls grayed; "Not provisioned — no key to revoke. Re-provisioning requires operator action on the server." |
| OFFLINE | All controls disabled; "No connection. Connect to network to revoke." on tap |
| IN-FLIGHT | Tapped control shows spinner; all other controls disabled during HTTP round trip |
| CONFIRMED / SUCCESS | Sheet closes (or brief inline confirmation); Overview updates status chip |

---

## On-screen Data Shapes

### Buyer surface

**B1 IDLE state**
- Payment amount: `$X.XX` — from merchant intent endpoint `{ amount, currency }`; immutable; merchant-set server-side
- Lock icon: trust-signal glyph

**B1 ERROR state**
- Error message: one sentence, human-friendly, no crypto vocab (see Copy Rules)
- Retry CTA: "Try again" — re-enables in place; no page reload

**B4 — Checkout confirmation panel**

| Field | Source | Notes |
|---|---|---|
| Payment amount | Intent endpoint `amount` | `$X.XX`; immutable |
| Merchant name | Intent endpoint / SDK config | Plain string |
| Merchant logo | Intent endpoint / SDK config (optional) | Absent → name only |
| Unified balance | `ua.getPrimaryAssets().totalAmountInUSD` | Single USD number, e.g. "$847.32 available"; NO per-chain breakdown; NO token names; NO network names |
| CTA label | Spec | "Pay $X.XX" or "Confirm" (DESIGNER'S CALL on exact verb) |

**B5 — Optimistic success panel**

| Field | Source | Notes |
|---|---|---|
| Animated checkmark | Tab animation | Required |
| Success heading | Tab copy | e.g. "Payment complete", "You're all set" — no crypto vocab |
| Amount paid | Intent endpoint `amount` | `$X.XX` |
| Merchant name | Intent endpoint / SDK config | Confirms recipient |
| Transaction reference | `TransactionResult.transactionId` | Labeled "Reference #" or "Confirmation #" — NEVER "txHash", "transaction hash", "blockchain ID" |
| Confirmation note (optional) | Tab copy | "A confirmation has been sent to [email]" — above fold |

---

### Merchant / developer surface

**M1 — Demo checkout page**

| Data | Notes |
|---|---|
| Product name / description | Merchant-set; not provided or validated by Tab |
| Button price | `$X.XX` from intent endpoint — the button IS the price display; merchant page must not show a divergent price |
| Post-success block (if merchant wires `onSuccess`) | `transactionId` (non-empty string) + any merchant-set order copy |

**M3 — API key row (in list)**

| Field | Format |
|---|---|
| Key name | Merchant-set string or "Unnamed key" |
| Key type | "Publishable" / "Secret" |
| Masked key value | `sk_test_••••••••[last4]` or `pk_test_••••••••[last4]` |
| Environment badge | TEST or LIVE pill |
| Permissions label | "Full access" or "Sending access" |
| Created date | Absolute: "Jul 2, 2026" |
| Last used | Relative: "N hours ago" or "Never" |
| Row actions | "Rotate" / "Delete" — NO "Reveal" for merchant-created secret keys after creation |

**M3 — KEY_REVEAL modal**

| Field | Notes |
|---|---|
| Warning banner | "For security reasons, you can only view this key once. Save it to a secure location before closing this dialog." |
| Full key value | Monospace, selectable |
| Copy button | Changes to "Copied!" for ~2s |
| Confirmation CTA | "I've saved my key" — primary; closes modal |

**M4 — Transaction row**

| Field | Format | Notes |
|---|---|---|
| Amount (primary) | `$X.XX` USD-denominated | Fiat-first, larger |
| Token amount (secondary) | `X.XX USDC` | Smaller, below or inline |
| Settlement chain | `Arbitrum One` | Always Arbitrum One; never "Arbitrum", "chainId 42161", "L2" |
| `transactionId` | Truncated `0x1234…5678` with copy | Links to transaction detail |
| Status badge | `Settled` / `Pending` / `Failed` | |
| Timestamp | Relative; absolute on hover | |
| Webhook delivery indicator | Delivered (check) / Failed (!) / Pending (clock) | Links to webhook log entry |
| Payer type (stretch, R-RAIL-2) | `Human` / `Agent` badge | DESIGNER'S CALL on MVP inclusion |

**M4 — Transaction detail**

| Field | Format | Notes |
|---|---|---|
| `transactionId` | Full value, monospace, copyable | |
| Amount | `$X.XX` + `X.XX USDC on Arbitrum One` | |
| `tokenChanges` | Structured rows or collapsed JSON | DESIGNER'S CALL on expand/collapse |
| Receiver address | Merchant's wallet address | From intent endpoint `receiver` field; copyable |
| Settlement chain | `Arbitrum One (chainId: 42161)` | |
| Block explorer link | "View on Arbiscan ↗" | `https://arbiscan.io/tx/{txHash}` |
| Timestamp | Full ISO 8601 | |
| Webhook delivery status | "Delivered" / "Failed" + link to webhook log | |
| Intent endpoint URL | Merchant's intent endpoint URL | Audit trail |

**M5 — Webhook configuration panel fields**

| Field | Format | Notes |
|---|---|---|
| Webhook URL | Full URL string; editable | Validated as HTTPS; persisted on save |
| Signing secret | `whsec_••••••••[last4]` (masked after initial creation) | HMAC-SHA256 signing secret; shown once on creation; "For security reasons, you can only view this signing secret once." |
| Retry policy note (read-only) | "Tab will retry failed deliveries up to 3 times with exponential backoff." | Fixed copy; not user-configurable |

**M5 / M6 — Webhook delivery log row**

| Field | Format | Notes |
|---|---|---|
| Delivery timestamp | Relative; absolute on hover | |
| HTTP status | `200` / `404` / `500` / `TIMEOUT` | Raw code + label |
| Status label | `Delivered` / `Failed` / `Timeout` / `Retrying` | |
| Attempt number | "Attempt 1 of 3" / "Attempt 2 of 3" / "Attempt 3 of 3" | Maximum 3 attempts; exponential backoff between retries |
| Associated `transactionId` | Truncated; links to M4 transaction detail | |
| Endpoint URL | The configured webhook URL | |

**M6 — Expanded row**

| Field | Notes |
|---|---|
| Request payload | Formatted JSON: `{ "transactionId": "...", "tokenChanges": [...] }`; copy button |
| Response body | First 500 chars of merchant HTTP response; "Show more" if longer |
| Request headers | Collapsible; `Content-Type: application/json` + HMAC signature header (`X-Tab-Signature`) |
| Response time | Round-trip latency in ms, e.g. "342ms" |
| Manual "Resend" button | DESIGNER'S CALL — whether supported by Tab server |

---

### Merchant / Developer — Account & Dashboard data shapes

**MA1 / MA2 — Sign Up and Log In**

| Field | Notes |
|---|---|
| Email input | Standard email field; "Create account" CTA (MA1) / "Log in" CTA (MA2); CTA disabled until valid email |
| OTP boxes | 6-box Magic SDK OTP; auto-submit on 6th digit — same component as the buyer flow (B3) |
| Link between screens | MA1 shows "Already have an account? Log in" → MA2; MA2 shows "Don't have an account? Sign up" → MA1 |
| Error message | Single human-friendly sentence; no crypto vocabulary |
| Session skip (MA2 only) | If valid Magic session exists, OTP screen is bypassed entirely and user is redirected without additional input (same RETURNING_USER_SKIP pattern as buyer B3) |

**MA3 — Settings**

| Field | Format | Notes |
|---|---|---|
| Business name | String | Appears as merchant name in buyer B4 checkout panel and in M4 transaction rows |
| Business logo | Image (JPG/PNG, ≤ 2 MB) | Optional; shown as merchant logo in B4; absent → business name text only |
| Receiving address | Ethereum address `0x...` (copyable) | The wallet address where Tab settles payments; displayed masked in M4 transaction rows as "receiver"; matches the `receiver` field in the intent endpoint |
| Settlement token | "USDC on Arbitrum One" (read-only; not user-configurable) | Fixed by platform; displayed for merchant transparency only |

---

### Agent Owner (web dashboard) data shapes

**W1 — Agent Overview**

| Field | Source | Format |
|---|---|---|
| Agent name and ID | Owner-assigned / default | String |
| Status badge | Backend state | Active / Paused / Frozen / Cancelled / Not Provisioned |
| Spend bar | Persistent ledger (settled only) | `$X.XX / $Y.YY (ZZ%)` — e.g. "$4.20 / $10.00 (42%)" |
| Cap cycle indicator | Owner config | Reset frequency + cycle start + next reset date |
| Per-chain float balances (summary) | On-chain reads | Base: `$X.XX` / Arbitrum: `$X.XX` / Polygon: `$X.XX` — compact row or mini-card per chain; Base marked "(primary)" |
| Unified UA treasury total | `getPrimaryAssets().totalAmountInUSD` | `$X,XXX.XX` — single USD number; labeled "Treasury" or "Unified balance" |
| Agent connection status | Backend | Connected / Awaiting first payment / Not connected |
| Server key status | Backend | Provisioned / Not Provisioned — NO key value ever shown |
| Recent receipt preview | Last 3–5 receipt rows | Same shape as W2 feed rows (includes network column) |
| Notification badge count | Unread Tier 2 + Tier 3 only | Number; Tier 1 does NOT increment |
| Quick action buttons | Context-sensitive | Varies by agent state (Pause / Resume / Freeze / Revoke / Raise cap / Connect agent / Top up) |

**W2 — Live Payment Feed (per receipt row, minimum 6 fields)**

| Field | Format | Notes |
|---|---|---|
| Amount (USD) | `$X.XX` | Primary |
| Resource / payTo URL | Truncated; expand affordance | |
| Network | `Base` / `Arbitrum` / `Polygon` | Per-payment settlement chain; always shown on feed row |
| Timestamp | Relative; absolute on hover | |
| txHash | `0xab12...ef56`; copyable; links to chain's block explorer | Absent for BLOCKED rows |
| Status badge | SUCCESS / FAILED / BLOCKED / PENDING | |

Secondary (expanded or detail):
- Asset: USDC (on settlement chain)
- Cycle contribution (SUCCESS only): "Takes cumulative to $X.XX of $Y.YY"

**W3 — Receipt Detail**

| Field | Notes |
|---|---|
| Amount USD | `$X.XX` |
| Amount raw | USDC atomic units (6 decimals), e.g. "420000" |
| Resource URL (payTo) | Full untruncated; copyable |
| Timestamp | Exact ISO 8601 |
| txHash | Full hash; copyable; block explorer link ("View on Basescan / Arbiscan / Polygonscan"); absent for BLOCKED |
| Network | Settlement chain in CAIP-2 format, e.g. `Base (eip155:8453)` / `Arbitrum One (eip155:42161)` / `Polygon (eip155:137)` — exact technical identifier appropriate here for operator audit |
| Asset | USDC |
| Status | SUCCESS / FAILED / BLOCKED / PENDING |
| Cumulative context (SUCCESS only) | "Cumulative spend after this payment: $X.XX / $Y.YY cap" |
| Block reason (BLOCKED only) | "Payment blocked — would push spend to $X.XX, exceeding $Y.YY cap" |
| Failure reason (FAILED only) | Available reason or "Settlement failed" |
| Trigger URL | What agent task initiated this payment; copyable |

**W4 — Cap Configuration**

| Field | Notes |
|---|---|
| Spend bar | `$X.XX / $Y.YY (ZZ%)` |
| Cap amount input | Dollar value |
| Reset frequency selector | Daily / Weekly / Monthly / Never (4 options; OQ-W1 resolved) |
| Cycle start date | When current cycle began |
| Next reset date | Derived from start + frequency |
| Notification threshold indicators (read-only) | 75% → Tier 2; 100% → Tier 3 + halt — NOT configurable |
| Hard block notice (read-only) | "Payments stop when the cap is reached. The agent does not continue spending." |
| Latency caveat (read-only) | "Notification delivery may lag a few minutes after a threshold is crossed. Set your cap below your true maximum to account for this." |
| Current-cycle blocked/failed count | Excluded from cumulative spend total |
| "Reset cycle" action (AT-LIMIT state only) | Manually resets cumulative spend to $0 |

**W5 — Notifications Center (per item)**

| Field | Notes |
|---|---|
| Tier indicator | UI label: "Alert" (Tier 2) or "Action required" (Tier 3). Tier 1 items are ambient — no label in notification center |
| Message text | Human-readable; see Copy Rules for examples |
| Timestamp | Absolute datetime |
| Amount (if payment-related) | USD value of triggering payment |
| Resource URL (if payment-related) | Endpoint that triggered the event |
| CTA (Tier 3 only) | "Raise cap" → W4 / "Revoke agent" → W6 / "Review" → W3 receipt |
| Read / Unread status | Tier 2 and Tier 3 can be marked read |
| Tier 3 resolution status | "Awaiting action" / "Resolved" — sticky at top until owner acts |

**W6 — Revocation Controls (per level card)**

| Field | Notes |
|---|---|
| Level name | Soft pause / Freeze / Cancel / Nuclear — exact spec-decided names |
| One-line consequence | What happens to agent loop and to the key |
| Key fate | Key intact / Key intact / Key rotated / Key deleted |
| Reversibility label | Resumable / Resumable / New key required / Re-provisioning required |
| Primary action button | Pause / Freeze / Cancel / Nuclear |
| Disabled state | Explains why level is not applicable from current state |

Confirmation mechanisms (decided, friction calibrated to severity):
- Level 1: Simple confirm dialog — "Pause your agent? Payments will stop. You can resume at any time."
- Level 2: Consequence dialog — "Freeze your agent? Key intact. You can unfreeze at any time."
- Level 3: Higher friction — text input (agent name or "CANCEL"); consequence: "This rotates your server key."
- Level 4: Highest friction — text input required; explicit irreversibility warning: "This permanently deletes your server key. There is no recovery."

**W7 — Agent Connection + Multi-Chain Float Management**

Connection panel:

| Field | Notes |
|---|---|
| Connection status indicator | Connected (green) / Awaiting first payment (pending) / Not connected (empty) / Error (red) |
| MCP server config snippet | Copy-ready JSON/TOML block for the Leash MCP server; install path note |
| HTTP wrapper endpoint | Alternative: base URL + auth header example |
| Leash key | Shown exactly once on first provisioning (API-key-style: monospace, copy button, "I've saved my key" CTA closes reveal); thereafter masked as `lsh_••••••••[last4]`; never re-revealed |
| Key health | Provisioned and active / Rotated — needs replacement / Deleted — re-provisioning required |
| Security note (read-only) | "Your Leash key is held in your agent's environment. It is never stored or shown here again." |
| Last-seen timestamp | "Agent last called at [timestamp]" / "No calls yet" |

Multi-chain float panel:

| Field | Notes |
|---|---|
| Per-chain float rows | One row each for Base (primary), Arbitrum One, Polygon; each shows: chain name + chain badge, USDC balance (`$X.XX`), low-float warning if below threshold, individual "Top up" CTA |
| Base row | Labeled "(primary)" — rebalance targets Base first |
| Unified UA treasury total | `getPrimaryAssets().totalAmountInUSD`; labeled "Treasury balance"; single USD number |
| Rebalancing indicator | "Topping up [chain] from treasury…" spinner on affected row; shows during background auto-rebalance |
| Low-float threshold (per chain) | Warns when chain float drops below **$5.00 USD** or below **20% of the most recent top-up amount** (whichever fires first) |
| Top-up | Amount input + destination chain selector (pre-selects low chain) + "Add funds from treasury" CTA; triggers Particle UA `createTransferTransaction` |
| Top-up note (read-only) | "Funds come from your unified treasury and are sent to the agent's address on the selected chain. This is separate from the agent's payments." |

---

### Agent Owner (mobile PWA) data shapes

**P1 — Overview**

| Field | Source | Display format |
|---|---|---|
| Unified UA treasury total | `getPrimaryAssets().totalAmountInUSD` | `$X,XXX.XX` (fiat-first; labeled "Treasury"; no per-chain breakdown on primary surface) |
| Per-chain float summary | On-chain reads | Compact row or collapsed section: Base `$X.XX` · Arbitrum `$X.XX` · Polygon `$X.XX`; low-float warning badge if any chain is below threshold; "Topping up…" badge if rebalance in progress |
| Current cumulative spend | Persistent ledger sum of settled receipts | `$X,XXX.XX` |
| Cap | Owner-set cap value | `$X,XXX.XX` |
| Spend percentage | (current / cap) × 100 | `XX%` |
| Agent status chip label | Backend state | One of: Active / Paused / Frozen / Cancelled / Not provisioned / Halted — cap reached / Offline |
| Last-payment summary | Most recent receipt row | "[amount] — [resource domain] · [network] · [relative timestamp]" (truncated) |
| Cap reset frequency | Owner configuration | "Resets [daily / weekly / monthly]" near spend bar |

**P2 — Payment Feed (per receipt card)**

| Field | Display format |
|---|---|
| Amount (USD) | `$X.XX` primary |
| Resource / payTo | Domain + path, truncated; full on expand |
| Network | `Base` / `Arbitrum` / `Polygon` — settlement chain shown per row |
| Timestamp | Relative ("2 min ago"); absolute on tap |
| txHash | First 6 + last 4 chars (e.g. "0x1a2b…cd9e"); tapping opens block explorer for the settlement network |
| Status badge | "Settled" / "Failed" / "Blocked" |

Note: "Failed" = x402 call made but settlement rejected. "Blocked" = payment never submitted; cap check fired first. Both logged. Neither increases cumulative spend.

**P3 — Receipt Detail**

All fields from P2 feed row, plus:
- Full resource URL (payTo): full untruncated; copyable
- Settlement network (full): e.g. "Base (eip155:8453)" / "Arbitrum One (eip155:42161)" / "Polygon (eip155:137)" — CAIP-2 form appropriate for detail view
- Trigger URL: full URL that caused agent to attempt this payment; copyable
- Block explorer link: full URL for txHash on the payment's settlement network's explorer (Basescan / Arbiscan / Polygonscan)
- Cycle context: "Payment X of N in current cap cycle" (if countable)

**P6 — Revoke Sheet**

| Control | Label | Reversibility |
|---|---|---|
| Level 1 | "Pause agent" / "Resume agent" (toggles) | Resumable |
| Level 2 | "Freeze agent" / "Unfreeze agent" (toggles) | Resumable |
| Level 3 | "Cancel agent" | Permanent until re-provisioned |
| Level 4 | "Nuclear — delete key" | Permanent; manual re-provisioning only |

Supporting data:
- Current agent status chip (compact)
- Current cumulative spend vs cap (compact spend bar or text)
- Last-payment timestamp: "Last payment: 3 minutes ago"

---

## Generated Artifacts

### 1. Webhook POST payload (Tab server → merchant server)

Fires on every settlement. This is the merchant's canonical order-fulfillment trigger (analog of Stripe `payment_intent.succeeded`).

```json
{
  "transactionId": "<string — from TransactionResult.transactionId>",
  "tokenChanges": [
    {
      "token": "<USDC contract address on Arbitrum One — verify exact address at build>",
      "chainId": 42161,
      "amount": "<string — credited amount in token units>",
      "receiver": "<merchant's wallet address>"
    }
  ]
}
```

Sources: R-TAB-3, AC-TAB-4. Exact sub-field names from `TransactionResult` in Particle UA SDK. Note: webhook is the canonical fulfillment signal — `onSuccess` callback may not fire if buyer closes tab immediately after payment. Merchants must not rely solely on `onSuccess`. (Story 1 Notes)

### 2. `onSuccess` browser callback payload (Tab SDK → merchant's JS)

Fires in the buyer's browser simultaneously with the optimistic success state.

```
onSuccess(transactionId: string, tokenChanges: TokenChange[])
```

Identical data to the webhook payload. Merchant can use this to update their page (redirect, show order number). Source: R-TAB-1, R-TAB-3.

### 3. x402 per-payment receipt row (Leash persistent store)

Written after every x402 event (success, failed, or blocked).

```
amount_usd:        "$0.42"                             — USD display value
amount_raw:        "420000"                            — USDC atomic units (6 decimals)
asset:             "USDC"
network:           "eip155:8453"                       — settlement network CAIP-2; varies per payment:
                                                         Base = eip155:8453 (primary)
                                                         Arbitrum One = eip155:42161
                                                         Polygon = eip155:137
resource_url:      "https://api.resource.com/data"    — payTo endpoint
tx_hash:           "0xabc...def"                       — from X-PAYMENT-RESPONSE header; absent for BLOCKED rows
timestamp:         "2026-07-02T14:23:01Z"
trigger_url:       "https://..."                       — what agent task initiated the fetch
status:            "success" | "failed" | "blocked" | "pending"
```

Sources: R-LEASH-4, story-3 AC-LEASH-1, story-5 AC-2.

### 4. Notification item data contract (Leash notification store)

```
tier:           1 | 2 | 3
message:        string  — human-readable (see Copy Rules for examples)
timestamp:      ISO 8601
amount_usd:     "$X.XX"  — if payment-related, else null
resource_url:   string   — if payment-related, else null
resolved:       boolean  — Tier 3 only; true when owner takes action
cta_type:       "raise_cap" | "revoke" | "review_receipt" | null
```

Sources: R-DASH-3, story-5 AC-4..8.

### 5. Push notification copy templates

**Tier 2 — approaching cap (75%):**
```
Title: "Leash: approaching spending cap"
Body:  "Agent at XX% of $[cap]. [Amount] remaining."
```

**Tier 2 — unusual resource:**
```
Title: "Leash: unusual payment destination"
Body:  "Agent paid [domain] — tap to review."
```

**Tier 3 — agent halted:**
```
Title: "Leash: agent halted — cap reached"
Body:  "Spending cap hit. Agent stopped. Tap to act."
```

Format rule: title 6–8 words, body ~10 words. Source: UX research §C MessageFlow fintech notification format.

### 6. Status chip vocabulary (cross-surface canonical list)

The agent status chip label must be identical across the web dashboard (W1, W6) and the mobile PWA (P1, P6). Mixed synonyms create operator confusion.

| Agent State | Status Chip Label |
|---|---|
| Running normally | "Active" |
| Soft paused | "Paused" |
| Frozen | "Frozen" |
| Cancelled (key rotated) | "Cancelled" |
| Nuclear / not provisioned | "Not provisioned" |
| Cap hit / halted | "Halted — cap reached" |
| Offline (no network) | "Offline" |

Source: AC-MOBILE-1.

---

## Copy and Vocabulary Rules

### Buyer surface — the crypto-vocabulary BAN list

All of the following are absolutely banned from any buyer-facing string (error messages, loading copy, tooltips, labels, modal headers, success copy, button text). This is a hard product requirement, not a style preference. Sources: R-TAB-9, AC-TAB-1.

**Banned words and phrases:**
- chain
- gas
- bridge
- Arbitrum
- EOA
- wallet address (the word "wallet" should be avoided entirely; the account is never surfaced to the buyer as a "wallet")
- sign / signing / authorize / authorization
- EIP (any EIP number or reference)
- token (in product copy — use "funds" or "balance")
- USDC / USDT (unless the merchant has explicitly opted in to showing the currency unit)

**Permissible framings:**

| Concept | Buyer-facing copy |
|---|---|
| Buyer's available funds | "Your balance", "$X.XX available" |
| The payment action | "Pay $X.XX", "Confirm payment", "Payment complete" |
| Auth / login | Magic SDK handles copy — Tab adds nothing to email or OTP screens |
| Success | "Payment complete", "You're all set", "Done" |
| Error (generic) | "Payment didn't go through", "Something went wrong — please try again" |
| Error (insufficient funds) | "You don't have enough to complete this payment" |
| Error (network) | "Couldn't connect — please try again" |
| Transaction reference | "Reference #", "Confirmation #" — NEVER "txHash", "transaction ID", "blockchain reference", raw hex |
| Amount | USD-first: `$X.XX` — NEVER "X USDC" unless merchant opted in |
| Loading state | "Processing your payment" — NEVER "Sending to blockchain", "Bridging your assets", "Confirming on-chain" |

**Tone:** Stripe-analogous — clear, brief, never apologetic-plus-technical. A technical error message is a spec violation as much as a UX failure.

---

### Merchant / developer surface — decided terminology

The merchant surface CAN and SHOULD use technical language. The buyer vocabulary exclusions (R-TAB-9) apply ONLY to the buyer-facing flow.

| Term | Use | Source |
|---|---|---|
| `transactionId` | Canonical identifier for a settled payment — always this, never "order ID", "payment ID", or "hash" on this surface | R-TAB-3 |
| `tokenChanges` | Settlement proof field from `TransactionResult` — use exact key name in webhook displays and developer labels | R-TAB-3 |
| `Arbitrum One` | Settlement chain name — not "Arbitrum", not "chainId 42161", not "L2"; chainId 42161 may appear in code blocks only | R-TAB-2 |
| `Test mode` / `Live mode` | Mode names — NOT "sandbox" / "production" | UX research §D |
| `Webhook delivery` | Not "webhook call", "webhook notification", "webhook ping" | UX research §D |
| `Settled` | Status for a completed, on-chain-confirmed payment — not "Confirmed", "Complete", "Processed" | R-TAB-3 |
| `Publishable key` / `Secret key` | Two key types — publishable is safe for browser code; secret is server-only | UX research §D |
| `Fiat-first dual display` | `$5.00` primary + `5.00 USDC` secondary — amount display format | UX research §A |

Copy tone rules (merchant surface):
- Step titles: imperative verb phrases ("Install", "Create your intent endpoint") — never "Step 1: Installation Process"
- Error copy attributes failure to system, not developer: "Unable to load API keys. Try refreshing." — not "Your API keys failed to load."
- API key reveal warning verbatim: "For security reasons, you can only view this key once. Save it to a secure location before closing this dialog."
- Test mode banner is non-alarming: "You are in test mode. Test payments are simulated and do not move real funds." — not "WARNING: TEST MODE ACTIVE"

---

### Agent owner surface — honest non-overclaiming language

**Words to use:**

| Concept | Copy to use | Notes |
|---|---|---|
| Agent running | "Active" | Status badge |
| Agent halted, resumable | "Paused" | Not "stopped" |
| Agent locked, key intact | "Frozen" | Distinct from Paused |
| Key rotated | "Cancelled" | Permanent until re-provisioned |
| Key deleted | "Not provisioned" | Exact phrase per AC-LEASH-4 |
| x402 payment blocked by cap | "Blocked" | Distinct from "failed" — no error, policy enforced |
| x402 payment settlement rejected | "Failed" | Settlement attempt made but rejected |
| Cap enforcement | "Payments halt when the cap is reached" | Hard block framing, never "soft limit" |
| USDC float at agent EOA | "Agent balance" | Not "EOA float", "USDC-on-Base float" |
| Top-up flow | "Add funds" | Matches Coinbase onboarding vocabulary |
| Tier 2 notification in UI | "Alert" or "Warning" | NEVER "Tier 2" — tier numbers are internal spec language |
| Tier 3 notification in UI | "Action required" | NEVER "Tier 3"; interrupt label must convey required action |

**Words to avoid:**

| Avoid | Instead |
|---|---|
| EOA | "agent address" or omit |
| EIP-7702, EIP-3009, eip155 | Show network as "Base" / "Arbitrum One" / "Polygon" in owner-facing copy; CAIP-2 format only in receipt detail where operators need exact audit data |
| gas | Omit — agent handles gas internally via x402; the owner never sees a gas line |
| session key, delegation, smart contract | The leash is economic and operational (app-layer cap + key control), not a cryptographic delegation primitive |
| "cryptographic leash", "on-chain leash" | The cap is app-layer policy; revoke is an HTTP call; the copy must be honest about this |
| "nuclear" in consequence descriptions | Use "nuclear" only as the action button / level name; in consequences: "permanently deletes your server key" |
| Tier numbers (1, 2, 3) as owner-facing labels | Use "Alert" / "Action required" / ambient behavior |
| "model" or "LLM" anywhere in Leash UI | Leash does not pick or host an LLM; the agent is the owner's external agent; omit model language entirely |

**Number formatting:**
- Spend amounts: always USD with two decimal places — `$4.20` not `4.2` or `USDC 4.20`
- Percentage: whole number — `42%` not `42.00%`
- txHash in feeds: first 6 + "..." + last 4 — `0xab12...ef56`; always copyable; always linked to the payment's settlement network's block explorer
- Timestamps: relative in feed rows; absolute on hover/expand and in detail panels

**Latency caveat (required on W4 cap configuration screen):**
"Notification delivery may lag a few minutes after a threshold is crossed. Set your cap below your true maximum to account for this."

---

## Decided vs Designer's Call

### DECIDED — locked by spec, stories, or verified UX research

| Decision | Source |
|---|---|
| `<PayButton>` is the sole integration artifact for the merchant's checkout page | R-TAB-1 |
| `<PayButton>` accepts `intentUrl` and `onSuccess(transactionId, tokenChanges)` as its only required props | R-TAB-1 |
| Intent endpoint returns `{ amount, receiver, token: { chainId: 42161, address: TOKEN }, currency }` | R-TAB-2 |
| Tab settlement chain is Arbitrum One (chainId 42161) — fixed for human-buyer flows | R-TAB-2 |
| Leash agent USDC float is MULTI-CHAIN: Base (eip155:8453, primary), Arbitrum One (eip155:42161), Polygon (eip155:137); one Particle UA treasury rebalances in the background; per-payment settlement network varies and is shown on every receipt row | Corrected architecture 2026-07-02 |
| Webhook payload: `{ transactionId, tokenChanges }` exact field names from `TransactionResult` | R-TAB-3 |
| Webhook is the canonical fulfillment signal; `onSuccess` is NOT reliable for order fulfillment | R-TAB-3, Story 1 Notes |
| Magic SDK renders email + OTP screens; Tab does NOT build a custom OTP screen | R-TAB-4, AC-TAB-6 |
| 6-box OTP with auto-submit on 6th digit is the auth UI | R-TAB-4, AC-TAB-6, UX research §B |
| Single unified USD balance in checkout panel — no per-chain breakdown, no token names | R-TAB-6 |
| Optimistic success fires on `sendTransaction` return — zero additional wait, NOT after block confirmations | R-TAB-8, AC-TAB-3 |
| Zero crypto vocabulary in any buyer-facing string (full ban list in Copy Rules) | R-TAB-9, AC-TAB-1 |
| PayButton state machine: IDLE → LOADING → AUTH → PROCESSING → SUCCESS → ERROR | R-TAB-10 |
| Button disabled in LOADING and PROCESSING (double-submit prevention) | R-TAB-10, Story 2 |
| IDLE button: "Pay $X.XX" + lock icon | R-TAB-10, UX research §A |
| SUCCESS: animated checkmark + label morphs to "Done" or merchant-configured string | R-TAB-10, R-TAB-8 |
| ERROR: inline message, data preserved, retry in place, no page reload | R-TAB-10, Story 2 |
| Amount is server-set by merchant; buyer cannot modify it | R-TAB-2 |
| No "your wallet is ready" screen after auth returns | AC-TAB-6, UX research §B |
| Returning buyer with valid Magic session skips OTP entirely | Story 2 returning-buyer scenario |
| `transactionId` shown in success as buyer-facing reference ("Reference #") — not raw hex | AC-TAB-3, AC-TAB-5 |
| Modal is self-contained in merchant page — no redirect, no new tab | R-TAB-4, AC-TAB-6 |
| API key value shown once on creation; never retrievable thereafter for merchant-created secret keys | UX research §D |
| API key reveal warning: "For security reasons, you can only view this key once. Save it to a secure location before closing this dialog." | UX research §D (Resend verbatim) |
| Test mode is the default for all new integrations | UX research §D |
| Test/live toggle is a persistent dashboard control affecting all screens | UX research §D |
| Switching live → test: no confirmation; test → live: explicit confirmation required | UX research §D |
| Quickstart: numbered steps, each with exactly one action and one code block, imperative short title | UX research §D |
| Transaction row must show: `transactionId`, USD amount, chain, status, timestamp, webhook delivery status | R-TAB-3, AC-TAB-4 |
| Transaction detail must show: `transactionId` (full, copyable), Arbiscan block explorer link, `tokenChanges`, receiver address | R-TAB-3, AC-TAB-4, UX research §C |
| Block explorer links point to Arbiscan (`https://arbiscan.io/tx/{txHash}`) for Arbitrum One settlements | AC-TAB-4, UX research §C |
| Four exact revocation levels and names: Soft pause / Freeze / Cancel / Nuclear | R-DASH-4, Story 6, UX research §C |
| Soft pause and freeze are resumable; cancel and nuclear are not without re-provisioning | R-DASH-4, AC-LEASH-3, AC-LEASH-4 |
| Key fate per level: intact / intact / rotated / deleted | R-DASH-4, Story 6 |
| All revocation is an HTTP call to backend — NO on-device signing, NO on-chain transaction | R-DASH-4, Constraint 7, AC-MOBILE-1 |
| Nuclear post-state label: "not provisioned" (exact phrasing) | AC-LEASH-4 |
| Three notification tiers: Tier 1 silent / Tier 2 banner / Tier 3 interrupt + required action | R-DASH-3, UX research §C |
| Tier 2 fires at 75% of cap | R-DASH-2, AC-DASH-3 |
| Tier 3 fires when payment would push past 100% of cap; that payment is blocked | R-DASH-2, R-LEASH-3, AC-LEASH-2 |
| Tier 3 MUST NOT fire on routine events (anti-cry-wolf rule) | R-DASH-3 |
| Blocked and failed payments do NOT increment cumulative spend | R-LEASH-3, AC-LEASH-2, AC-DASH-2 |
| Cap is a hard block — x402 call is NOT made when cap is exceeded | R-LEASH-3, AC-LEASH-2 |
| Cap change takes effect on next agent loop check, without restart | R-DASH-5 |
| Spend bar shows: current / cap / % (three-part format) | R-DASH-2, AC-DASH-2 |
| Leash is an x402 auto-payer — there is NO model picker, NO LLM, NO model selection in Leash; the agent is the owner's own external agent | Corrected architecture 2026-07-02 |
| Multi-chain USDC float: Base (primary), Arbitrum One, Polygon; one Particle UA treasury rebalances chains in the background | Corrected architecture 2026-07-02 |
| Dashboard shows per-chain float balances (Base / Arbitrum / Polygon) + one unified UA treasury total (`getPrimaryAssets`) | Corrected architecture 2026-07-02 |
| "Low float / topping up" state exists for the background auto-rebalance; user sees per-chain indicator, not raw transaction | Corrected architecture 2026-07-02 |
| Agent setup screen = "Connect your agent": install Leash MCP server (config snippet) or HTTP wrapper; copy Leash key (shown once, same one-time-reveal pattern as API keys); status indicator (not-connected / awaiting-first-payment / active / error) | Corrected architecture 2026-07-02 |
| Leash key shown exactly once on provisioning; pattern identical to merchant API key reveal (monospace, copy button, "I've saved my key" CTA, never re-revealed) | Corrected architecture 2026-07-02 |
| Float top-up is operator-triggered via UA SDK — NOT wired into x402 payment loop | R-LEASH-6, Constraint 2 |
| Server key NEVER exposed in client UI | R-LEASH-1 |
| txHash links to block explorer for settlement network | AC-DASH-1 |
| Feed is reverse-chronological order | R-DASH-1 |
| Latency caveat must appear on cap configuration screen | R-DASH-2, UX research §C |
| Mobile surface has exactly six screens: Overview / Feed / Receipt Detail / Push Notification / Expanded Notification / Revoke Sheet | R-DASH-6 ("Monitor / Notify / Revoke only") |
| USD balance on mobile Overview: `ua.getPrimaryAssets()` → `totalAmountInUSD`; one number, no per-chain breakdown | R-DASH-6, R-TAB-6 |
| Blocked-attempt entries appear in the same feed as settled entries — NOT in a separate audit log | Story 5 OQ-3 (resolved in mobile surface) |
| Tier 1 = no push, badge only; Tier 2 = push banner; Tier 3 = push interrupt | R-DASH-3, R-DASH-6 |
| No signing on mobile — all revoke actions are HTTP calls to apps/web backend | Constraint 7, AC-MOBILE-1 |
| Levels 3 (Cancel) and 4 (Nuclear) require confirmation step before executing | UX research §C |
| Seven status chip labels defined and fixed (see Generated Artifacts) | AC-MOBILE-1, R-DASH-4, AC-LEASH-4 |
| Offline state must be represented on all mobile screens; controls disabled offline | General PWA constraint, AC-MOBILE-1 |
| Notification copy format: title 6–8 words, body ~10 words | UX research §C |
| 75% threshold triggers Tier 2; 100% cap hit triggers Tier 3 and agent halt | R-DASH-2, R-DASH-3 |
| Fiat-first dual display: `$5.00` primary, `5.00 USDC` secondary | UX research §A |
| "Settled" not "Confirmed", "Complete", or "Processed" for completed payments on merchant surface | R-TAB-3 |
| "Publishable key" / "Secret key" as the two key type labels | UX research §D |
| **Merchant dashboard is a real multi-tenant product surface** (not a demo add-on) — includes Sign Up (MA1), Log In (MA2), API keys (M3), Transactions (M4), Webhooks (M5/M6), Settings (MA3); each merchant's account and data fully isolated | Abu (explicit), 2026-07-02 |
| Merchant dashboard scope: no SSO, 2FA, team / role / org management, or billing tiers — right-sized | Abu (explicit), 2026-07-02 |
| OQ-M5 resolved — Merchant auth: standard Magic email-OTP (same SDK as buyer flow); multi-tenant isolation | 2026-07-02 |
| OQ-B3 / OQ-M2 / spec-OQ-4 resolved — Settlement token: **USDC on Arbitrum One** (native Circle USDC, EIP-3009-capable); verify exact contract address at build | 2026-07-02 |
| OQ-W1 resolved — Cap reset frequency options: **Daily / Weekly / Monthly / Never** (four options) | 2026-07-02 |
| OQ-W2 resolved — Lowering cap below current cumulative spend → **immediate block + Tier-3 notification**; not deferred to next payment | 2026-07-02 |
| OQ-W4 resolved — Model picker removed entirely; W7 is now Agent Connection + Multi-Chain Float (no model selection) | Corrected architecture 2026-07-02 |
| OQ-B5 resolved — **Modal dismissal blocked during PROCESSING**; buyer cannot close the modal while `sendTransaction` is in flight | 2026-07-02 |
| OQ-B6 resolved — **Tab's in-modal success panel is the canonical buyer success moment**; `onSuccess` fires AFTER Tab's in-modal success renders; merchant must not rely on `onSuccess` alone | 2026-07-02 |
| OQ-W5 / OQ-P1 resolved — Tier-2 "unusual URL" = **first-seen domain heuristic** (any domain the agent has not paid previously in this account context) | 2026-07-02 |
| OQ-W6 / OQ-P2 resolved — Feed polling interval: **~3 seconds** | 2026-07-02 |
| OQ-W7 resolved — Low-float warning threshold: **below $5.00 USD or below 20% of the most recent top-up amount** (whichever fires first) | 2026-07-02 |
| OQ-B1 resolved — Insufficient-balance error copy: show **USD shortfall fiat-first** ("You're $X.XX short"); no crypto vocabulary | 2026-07-02 |
| OQ-P3 resolved — Mobile cap value shown **read-only** on P1 Overview; cap editing is web-dashboard-only (R-DASH-5 scope confirmed) | 2026-07-02 |
| OQ-P6 resolved — Tier-3 push notification **includes "Revoke" action button → soft pause (Level 1)** callable from lock screen via service worker HTTP call | 2026-07-02 |
| OQ-M1 resolved — npm package name: **`@tab/sdk`** | 2026-07-02 |
| OQ-M3 resolved — Webhook **HMAC signing: yes**; signing secret (`whsec_...`) shown once on creation (same one-time-reveal pattern as API keys); `X-Tab-Signature` header on every delivery | 2026-07-02 |
| OQ-M4 resolved — Webhook retry policy: **3 retries, exponential backoff**; affects "Attempt N of 3" label in M6 delivery log | 2026-07-02 |
| OQ-M6 resolved — Intent endpoint `amount` field format: **decimal string** e.g. `"5.00"` (not a JS number or atomic BigInt) | 2026-07-02 |
| OQ-M7 resolved — Demo checkout page (M1): **separate route** from the dashboard (not embedded in dashboard nav) | 2026-07-02 |
| OQ-S2 resolved — **Multi-chain is canonical** for Leash agent float: Base (primary), Arbitrum One, Polygon; settlement network varies per payment and is shown on every receipt row; Tab merchant settlement chain (Arbitrum One) is unchanged for human-buyer flows | Corrected architecture 2026-07-02 |

### DESIGNER'S CALL — not constrained by spec or research

**Buyer surface**
- Modal vs. drawer vs. inline overlay vs. bottom sheet (mobile)
- Whether Magic SDK OTP modal and Tab checkout panel share one visual container or appear as sequential layers
- Position of checkout panel relative to `<PayButton>` (popover, centered overlay, bottom sheet)
- Merchant logo placement in checkout panel header
- Visual treatment of OTP boxes (border style, spacing, focus ring) — within Magic SDK CSS customization limits
- Animation timing and style of the animated checkmark (duration, easing, SVG vs Lottie vs CSS)
- Whether payment amount appears in modal header as well as the CTA button
- Exact CTA verb in checkout panel: "Pay $X.XX" vs "Confirm" vs "Pay now"
- Whether success panel auto-dismisses after N seconds or requires explicit close
- Whether "cancel" / "close" escape from the post-auth checkout panel returns PayButton to IDLE or ERROR
- Visual treatment of the LOADING → B4 (checkout panel) transition when a returning buyer skips OTP — the brief window while balance fetches; needs shimmer, skeleton, or instant-transition treatment (OQ-B4)
- Color treatment of states (success green, error red) — from brand system
- Typography hierarchy within the modal
- Mobile-responsive layout of checkout panel and button
- Merchant branding extent in the modal (logo/name prominence vs Tab branding)

**Merchant / developer surface**
- Dashboard navigation structure (sidebar / top nav / tabs)
- Visual differentiation of TEST vs LIVE mode (colors, badge styles, banner placement)
- Whether transaction detail is a side panel, slide-over, modal, or separate page
- Whether `tokenChanges` is shown as formatted JSON, structured field rows, or collapsed "View details"
- Whether quickstart includes auto-detected step completion (requires polling) vs manual checkbox
- Whether "Go Live" confirmation modal includes auto-detected pre-flight checklist
- Whether manual "Resend" button exists in webhook delivery log
- Whether "Payer type" (Human vs Agent) column appears in transactions list (depends on R-RAIL-2 stretch scope)
- Key rotation UX (warn merchant old key is immediately invalidated?)
- API key permissions taxonomy ('Sending access' / 'Full access')
- Transaction list: infinite scroll vs. pagination
- Whether a "Send test webhook" button exists (synthetic payload to configured URL)
- Transaction list and quickstart: exact step titles, step count beyond R-TAB-1/2/3 anchor points

**Agent owner (web)**
- Overall layout: sidebar vs. top-nav; single-page vs. routed sections
- Whether revocation controls are dedicated page, side panel, or modal overlay
- Color system for spend bar states (neutral / warning / danger at 75% and 100%)
- Color system for status badges and notification tier indicators
- Whether receipt detail is a side panel, modal, or separate page
- Save confirmation mechanism for cap: toast vs. inline vs. persistent state
- Confirmation friction for Level 3 (Cancel): text input vs. checkbox vs. typed confirmation exact affordance
- Confirmation friction for Level 4 (Nuclear): exact input, copy, destructive button treatment
- Navigation between screens: tabs, sidebar, discrete pages
- Tier 1 badge surface: in-app indicator, browser tab favicon counter, or both
- Live-update visual treatment in the feed (live indicator, pulse icon, polling vs. SSE/WS visual)
- Whether agent is renameable; how agent name/ID displays
- Mobile-responsive behavior of web dashboard (distinct from the PWA)
- How to visually distinguish per-chain float rows in W7 (card vs. table row vs. mini-chart)
- Whether the per-chain float summary on W1 Overview is always visible or collapsed behind an expand affordance
- Whether the "Topping up from treasury" rebalance indicator on W1/W7 is a subtle inline badge or a more prominent status banner
- How to extend receipt row structure if future x402 resources add new chains — designer should build the network column as extensible (see OQ-W9)

**Agent owner (mobile PWA)**
- Color system, typography, spacing, icon set, corner radius, dark mode
- Visual treatment of spend bar in normal, near-limit, and over-limit states
- Whether Revoke Sheet is a bottom sheet, modal dialog, or full-screen overlay
- Whether Levels 1 and 2 are toggle buttons (Pause/Resume, Freeze/Unfreeze) or separate controls with state-aware visibility
- Exact confirmation form for Levels 3 and 4: confirmation dialog, type-to-confirm, or hold-to-confirm gesture
- Whether Revoke Sheet is reached via a prominent Overview CTA or a secondary collapsed "Agent controls" entry
- Whether feed row shows atomic amount alongside USD amount, or USD only
- Whether txHash is shown shortened in feed rows or hidden until receipt detail is opened
- How long resource URLs are truncated in the last-payment summary line on Overview
- How to visually and textually distinguish soft pause ("Paused") from freeze ("Frozen") on mobile when both leave the key intact and look similar from the owner's perspective (OQ-P4)
- Empty state treatment (illustration, plain text, icon)
- Whether cap and reset frequency appear inline below spend bar on Overview or in a separate section
- Navigation model (tab bar vs. header nav vs. single-scroll)
- PWA install prompt timing and design

---

## Traceability

| Screen | Requirement IDs | Stories |
|---|---|---|
| B1 — `<PayButton>` | R-TAB-1, R-TAB-2, R-TAB-10, AC-TAB-1, AC-TAB-3 | Story 2 (all scenarios) |
| B2 — Magic email entry | R-TAB-4, AC-TAB-6 | Story 2 |
| B3 — Magic 6-box OTP | R-TAB-4, AC-TAB-6 | Story 2 (returning-user, wrong-code, OTP edge cases) |
| B4 — Checkout confirmation panel | R-TAB-5, R-TAB-6, R-TAB-9, R-TAB-10, AC-TAB-1, AC-TAB-6 | Story 2 (happy path, insufficient-balance) |
| B5 — Optimistic success panel | R-TAB-8, R-TAB-9, R-TAB-10, AC-TAB-1, AC-TAB-3, AC-TAB-5 | Story 2 (happy path); Story 8 (flagship cross-chain) |
| B6 — Error / retry panel | R-TAB-9, R-TAB-10, AC-TAB-1 | Story 2 (wrong-code, sendTransaction-error, insufficient-balance) |
| M1 — Demo checkout page | R-TAB-1, R-TAB-2, R-TAB-8, R-TAB-10, AC-TAB-1, AC-TAB-3 | Story 1 Scenario 1 |
| M2 — Quickstart | R-TAB-1, R-TAB-2, R-TAB-3 | Story 1 |
| M3 — API keys panel | R-TAB-1 | — |
| M4 — Transactions list | R-TAB-3, AC-TAB-4, R-TAB-2 | Story 1, Story 9 (stretch) |
| M5 — Webhook configuration | R-TAB-3, AC-TAB-4 | Story 1 OQ-4 (resolved) |
| M6 — Webhook delivery log | R-TAB-3, AC-TAB-4 | — |
| M7 — Test/live toggle | — (UX research §D pattern) | — |
| MA1 — Merchant Sign Up | OQ-M5 resolved; Magic SDK (`loginWithEmailOTP`) | — |
| MA2 — Merchant Log In | OQ-M5 resolved; Magic SDK (`loginWithEmailOTP`); RETURNING_SESSION skip | — |
| MA3 — Merchant Settings | OQ-M5 resolved; business config surface | — |
| W1 — Agent Overview | R-DASH-1, R-DASH-2, R-DASH-4, R-LEASH-1, AC-LEASH-4; corrected architecture 2026-07-02 (per-chain float, unified treasury) | Goal 4 |
| W2 — Live Payment Feed | R-DASH-1, R-LEASH-4, AC-LEASH-1, AC-DASH-1; corrected architecture 2026-07-02 (network per row) | Story 3, Story 5 |
| W3 — Receipt Detail | R-LEASH-4, R-DASH-1, AC-DASH-1; corrected architecture 2026-07-02 (multi-chain network field) | Story 3, Story 5 |
| W4 — Cap Configuration | R-DASH-2, R-DASH-5, R-LEASH-3, AC-DASH-2, AC-DASH-3 | Story 4 |
| W5 — Notifications Center | R-DASH-3, AC-DASH-3 | Story 5 |
| W6 — Revocation Controls | R-DASH-4, R-DASH-6, AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1 | Story 6 |
| W7 — Agent Connection + Multi-Chain Float | R-LEASH-1, R-LEASH-6, AC-LEASH-4, Constraint 2; corrected architecture 2026-07-02 (connect agent, multi-chain float) | Story 6 (post-nuclear re-provisioning); corrected architecture |
| P1 — Mobile Overview | R-DASH-6, R-DASH-2, AC-DASH-2 | Story 5 |
| P2 — Mobile Payment Feed | R-DASH-1, R-DASH-6, R-LEASH-4, AC-DASH-1, AC-LEASH-1 | Story 5 AC-1,2,3 |
| P3 — Mobile Receipt Detail | R-DASH-1, R-LEASH-4, AC-DASH-1 | Story 5 AC-2 |
| P4 — Push Notification | R-DASH-3, R-DASH-6, AC-DASH-3 | Story 5 AC-5,6,7 |
| P5 — Expanded Notification | R-DASH-6 | — |
| P6 — Revoke Sheet | R-DASH-4, R-DASH-6, AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1, Constraint 7 | Story 6 (all scenarios) |

---

## Open Questions

Genuine gaps that require a product or engineering decision before the designer can close the affected screen. Resolved OQs have been moved to "Decided vs Designer's Call" above. Items migrated to DESIGNER'S CALL are noted there.

### Buyer surface

**OQ-B2** — UA V1 migration interstitial. If the buyer's account is on UA V1 and must withdraw before proceeding, an interruption may surface in the buyer flow. No copy, placement, or UX for this interstitial is defined anywhere in spec, stories, or surfaces. (Story 2 OQ-3, Spec Constraint 10)

*(OQ-B1, OQ-B3, OQ-B5, OQ-B6 resolved — see Decided section. OQ-B4 migrated to DESIGNER'S CALL.)*

### Merchant / developer surface

*(All OQs for this surface resolved. OQ-M1, OQ-M2, OQ-M3, OQ-M4, OQ-M5, OQ-M6, OQ-M7 — see Decided section.)*

### Agent owner — web dashboard

**OQ-W3 — CLOSED** — Model picker removed entirely from Leash. Leash is not an LLM host; the owner's external agent handles model selection. W7 is now Agent Connection + Multi-Chain Float.

**OQ-W9** — How does the background auto-rebalance trigger surface to the owner? The Particle UA treasury rebalances chains automatically (server-side). Does Leash fire a Tier-1 ambient notification ("topped up Base float") or is it entirely silent? Decision affects whether the "Topping up…" spinner on W7/P1 is push-notified or polling-detected only. (Corrected architecture 2026-07-02 — new gap)

*(OQ-W1, OQ-W2, OQ-W4, OQ-W5, OQ-W6, OQ-W7 resolved — see Decided section. Former OQ-W8 on network extensibility migrated to DESIGNER'S CALL.)*

### Agent owner — mobile PWA

**OQ-P5** — Mobile surface tech: Next.js `/mobile` route vs. separate Vite build? Affects URL structure for deep links from push notifications and service worker registration origin. Does not change screen inventory. (Spec OQ-6 — marked "proposed pending Abu's confirm")

*(OQ-P1, OQ-P2, OQ-P3, OQ-P6 resolved — see Decided section. OQ-P4 migrated to DESIGNER'S CALL.)*

### Cross-surface (stretch track)

**OQ-S1** — Is Tab-as-x402-resource (R-RAIL-1, R-RAIL-2) MVP or stretch? If the Leash agent pays a Tab checkout endpoint headlessly, the merchant's M4 transaction list must show a "Payer type: Agent" badge (or not — DESIGNER'S CALL). The "one rail, two payer types" narrative is the most differentiated part of the submission, but this path is marked ⚠️ unverified end-to-end. Decision needed before any UI for the stretch story can be designed. (Spec OQ-1)

*(OQ-S2 resolved — Arbitrum One is canonical; see Decided section.)*

---

*End of Product Surface Map: Tab + Leash*
