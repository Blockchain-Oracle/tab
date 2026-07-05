# Designer Brief: Tab + Leash

> Prepared 2026-07-02 for Abu's AI designer agent.
> Consumes the canonical product surface map (`design/2026-07-02-product-surface-map.md`) and the
> spec (`specs/2026-07-02-tab-leash.md`). Screen and state inventory is NOT duplicated here —
> this document layers narrative, hierarchy, demo beats, and direction on top of what the surface
> map already defines precisely. When screen detail or data shape is needed, cross-reference the
> surface map.

---

## Purpose

This brief commissions a high-fidelity prototype of Tab + Leash — a two-product crypto payment
system targeting a Particle Network chain-abstraction hackathon. The prototype will be judged
(UX is 30–40% of score) AND must represent a real, right-sized product that could ship. The
designer produces per-screen high-fidelity frames with all required states, mocked data, and
mocked integrations. No real wallet, network, or database calls appear in the design artifact.

The two goals are not in tension: the same design that wins the demo also constitutes the
product. Treat both with equal seriousness.

---

## Prototype Scope

Four distinct surfaces, all in scope:

| Surface | Screens | Design artifact |
|---|---|---|
| Buyer checkout (Tab SDK) | B1–B6 | Embedded component in a demo merchant page |
| Merchant dashboard (Tab) | MA1–MA3, M1–M7 | Web app (desktop-first, responsive) |
| Agent owner dashboard (Leash) | W1–W8 | Web app (desktop-first, responsive) |
| Agent owner mobile PWA (Leash) | P1–P6 | Mobile web / PWA (375px viewport) |

All screens listed in the surface map must appear. Every required state for every screen must
appear. Missing states are not acceptable — judges and product reviewers will check them.

---

## Product Context

**Tab** is Stripe for crypto checkout. A merchant drops one `<PayButton>` component into their
page, creates a server endpoint that pins the amount and receiving address, and gets paid. The
buyer authenticates with just an email address and a 6-digit code. No chain, gas, bridge, or
wallet concepts appear on the buyer's side. Settlement is in USDC on Arbitrum One; the
merchant receives a webhook identical in shape to a Stripe `payment_intent.succeeded`.

Tab's dashboard is a real merchant product: sign up, create API keys, read transactions, manage
webhooks, toggle test / live mode. Not a throwaway demo page.

**Leash** is an x402 auto-payer for AI agents. The agent owner connects their own external
agent — a Claude Code instance, an OpenClaude process, a Cursor agent, or any tool that can
make HTTP calls — by installing the Leash MCP server or HTTP wrapper and pasting a Leash key.
Leash has no brain of its own: it does not pick a model, run inference, or orchestrate tasks.
When the owner's agent hits an HTTP 402 ("Payment Required") paywall mid-task, Leash intercepts,
auto-pays from a capped, monitored Particle UA wallet, and the agent continues — automatically,
in milliseconds, no human in the loop.

The wallet is multi-chain: x402 resources demand payment on different networks (mostly Base, but
also Arbitrum and Polygon). Leash pre-positions USDC floats on each chain; one Particle UA
treasury rebalances them in the background. The owner sees a single unified balance, not per-
chain breakdowns. This is the rail unity: the same Particle UA that powers Tab's human checkout
also powers Leash's agent auto-pay — one balance, two sides of the x402 economy.

The spending cap is enforced outside the agent by a hosted signer: when cumulative spend in a
cycle hits the cap, the signer refuses to authorize the next x402 call. The agent cannot spend
past the cap no matter what it does. The owner watches every payment in real time on a web
dashboard, adjusts the cap, and can revoke access across four levels — from a soft pause
(resumable, key intact) to nuclear (key deleted, re-provisioning required). A mobile PWA mirrors
the dashboard with push notifications and one-tap revoke.

**The rail unity (stretch goal, Demo Story 9):** Tab's checkout can optionally accept agent
payers via x402 headlessly — no modal, no human. Both a human and an agent can pay the same
merchant through the same rail. The merchant's webhook payload is identical either way. This is
the most differentiated part of the submission and should be visible in the merchant's M4
transaction list if the stretch goal is included.

---

## Target Users

**Buyer:** not a crypto person. Has money somewhere (ETH on Base, USDC on Polygon, anything
on any chain). Expects the payment to feel like tapping Apple Pay or entering a card number.
Will bounce immediately if they see "chain," "gas," or "bridge." The entire checkout must feel
as simple as Stripe Link.

**Merchant / Developer:** a developer or small business owner who wants to accept crypto without
becoming a crypto expert. Their mental model is Stripe: drop in a component, get a webhook,
get paid. They understand API keys, test mode, and webhooks — the same conceptual vocabulary
as Stripe, Resend, or Clerk.

**Agent Owner / Operator:** has deployed (or is deploying) an AI agent that autonomously pays
for internet resources. They want: a spending ceiling, real-time visibility into every payment
the agent makes, and the ability to yank the leash instantly from their phone if something goes
wrong. They are technically sophisticated but do not want to manage cryptographic primitives —
the leash is an operational and economic control, not a cryptographic abstraction. They bring
their own agent; Leash is the payment rail and watchdog, not the model or the brain.

---

## Domain Knowledge The Designer Needs

### Chain abstraction: "one balance"

Particle Network's Universal Accounts give a buyer a single USD balance that spans multiple
chains and tokens — ETH on Base, USDC on Polygon, anything — combined into one number. The
buyer sees only `$847.32 available`. No chain names appear. The checkout modal reads this
number from `ua.getPrimaryAssets().totalAmountInUSD` and shows it as a single USD figure.
The Tab SDK then routes the payment cross-chain to the merchant's Arbitrum One address without
the buyer choosing anything. One balance, one button, one payment.

### EIP-7702: "email becomes a smart wallet"

EIP-7702 is the mechanism that makes this possible. When the buyer authenticates via their
email address using Magic's OTP flow, their email-linked account (technically an externally
owned address, or EOA) is upgraded on-the-fly to a Particle Universal Account. This enables
cross-chain settlement without the buyer needing funds on the destination chain. For the
designer: this detail is entirely invisible to the buyer. The buyer types their email and a
6-digit code. That's it. The designer must never surface any EIP, EOA, delegation, or wallet
terminology to the buyer.

### x402: "agent pays per call"

x402 is a machine-native HTTP payment protocol. When the owner's agent fetches a URL protected
by a paywall, the server responds with HTTP 402 ("Payment Required") and a machine-readable
payment terms payload. The Leash middleware (MCP server or HTTP wrapper the owner installed)
intercepts this 402 response, checks the cap, signs and submits a USDC payment from the Leash
wallet, then retries the original request — automatically, in milliseconds, with no human in
the loop. The agent never paused from its own perspective; it just got a 200 back. From the
owner's perspective, each x402 payment is a receipt in their feed: amount, resource URL,
timestamp, chain, and a transaction hash linking to the block explorer. The owner never sees the
HTTP layer.

### Chain abstraction inside Leash: "one balance pays x402 on any chain"

x402 resources exist on multiple chains — a search API on Base, a data feed on Arbitrum, a
content gate on Polygon. Leash handles this invisibly: the owner funds one Particle UA balance,
and Leash pre-positions USDC floats on whichever chains are needed. The UA rebalances these
floats in the background. The owner never selects a chain, bridges funds, or thinks about which
network a given x402 resource lives on. The spend bar and feed show total USD spend — not per-
chain breakdowns (except in the receipt detail where chain context is useful for audit).

The W8 float panel should show the per-chain float balances as a secondary detail beneath the
primary unified USD total, styled as developer-detail (monospace, compact) — not as the primary
narrative. The primary narrative is "your agent can pay anything."

### The leash: economic cap, not a crypto primitive

The "leash" is an app-layer spending cap enforced in code. When the agent's cumulative spend in
a cycle hits the cap, the code refuses to make the next x402 call — the payment never goes out.
This is NOT an on-chain smart contract, NOT a cryptographic delegation, and NOT a Particle
session key. Revocation is also app-layer: the dashboard sends an HTTP call to the backend that
rotates or deletes the agent's server-held key. The designer must reflect this honestly.
Revoke copy should say "permanently deletes your server key," not "on-chain revocation" or
"cryptographic leash." Judges will penalize overclaiming.

---

## Core User Journey

### Journey 1: Buyer pays (the hero demo beat — "I paid with just an email")

1. Buyer lands on a merchant's product page and sees a `<PayButton>` labeled "Pay $12.00" with
   a lock icon. The button is enabled. Nothing else is visible.
2. Buyer clicks. The button briefly shows a spinner (LOADING state — intent fetch).
3. A Magic email entry modal appears. The buyer types their email and clicks "Continue."
4. The 6-box OTP screen appears. The buyer types 6 digits; the screen auto-submits on the 6th.
5. A checkout confirmation panel appears: buyer's balance ("$847.32 available"), merchant name,
   and amount. A single "Pay $12.00" button.
6. Buyer taps. The button disables and shows "Processing…".
7. Instantly, an animated checkmark appears. "Payment complete. Reference #A7B2." No crypto
   terminology anywhere.

The demo beat: a judge watches someone pay with an email address and a 6-digit code and never
once sees a wallet, a chain name, or a gas fee. The entire flow from button click to success
should feel like Stripe Link.

### Journey 2: Merchant integrates Tab (setup narrative)

1. Developer signs up with their email via the Tab dashboard. Magic OTP — same flow as the
   buyer, same 6 boxes.
2. Quickstart page shows numbered steps: install, create API key, write intent endpoint, add
   `<PayButton>`, configure webhook. One action per step.
3. Developer creates an API key. It appears once in a modal with a warning. They copy it and
   click "I've saved my key." The key is masked in the list from then on.
4. Developer completes the integration. A test payment fires. A "Test payment received.
   Your integration is working." banner appears with a "Switch to Live mode" CTA.
5. Operational home: the Transactions list shows every payment in reverse-chronological order —
   amount, status badge, timestamp, webhook delivery indicator.

### Journey 3: Agent owner watches and yanks the leash (the auto-pay + control beat)

0. **Setup (pre-narrative):** Owner connects their agent — installs the Leash MCP server in
   their Claude Code / Cursor / OpenClaude environment, pastes the Leash API key (provisioned
   on W7), sets a $10.00 daily cap. Agent starts running its task.
1. **Auto-pay fires:** The owner's agent hits an HTTP 402 paywall mid-task. Leash intercepts,
   pays $0.03 from the pre-positioned USDC float, and the agent continues without pausing. A
   receipt appears in the owner's Live Payment Feed (W2): "$0.03 — api.searchgrid.io/v1/search
   — Base — 0xab12…ef56." The agent never knew it was stopped.
2. Owner opens the web dashboard (W1). Agent Overview shows: status "Active," spend bar at 42%
   of the $10.00 daily cap, the last five receipt rows, a unified float balance reading, and
   quick-action buttons.
3. Owner clicks into the Live Payment Feed (W2). New rows prepend at ~3s intervals as the agent
   continues paying for resources. Each row: amount, resource URL, chain, timestamp, truncated
   txHash linked to block explorer.
4. Spend reaches 75% of cap. A Tier 2 "Alert" banner appears in-dashboard. A push notification
   arrives on the owner's phone: "Leash: approaching spending cap. Agent at 75% of $10.00."
5. The cap is reached. The next x402 attempt is blocked by the hosted signer. Tier 3 fires:
   interrupt banner in-dashboard, push notification on phone with title "Leash: agent halted —
   cap reached." The blocked payment appears in the feed with a "Blocked" status badge. The
   agent is stuck waiting; it cannot pay past the cap no matter what it does.
6. Owner taps the notification on their phone. PWA opens at Overview: status "Halted — cap
   reached," spend bar full with danger visual, Revoke section prominent. Owner taps "Pause
   agent" → confirmation dialog → "Paused." Or owner opens Revoke Sheet for a more severe
   action.

The demo beat: the owner's own AI agent is autonomously paying for resources across the
internet mid-task, and the owner can watch every cent in real time — per call, per chain, per
receipt — AND yank the leash in one tap from their phone. The agent is powerful; the owner is
in control.

---

## Screen-by-screen Direction

> Screen IDs and all required states come from the surface map. This section adds hierarchy,
> emphasis, and demo-beat framing — it does NOT restate state tables. Cross-reference the
> surface map for complete state and data inventories.

### Buyer surface

**B1 — `<PayButton>` (embedded in merchant page)**

This is the first impression. It must be a single self-contained component that looks
trustworthy and premium dropped into any merchant page. IDLE state: "Pay $X.XX" + a lock icon.
The button must look like it belongs on a high-quality e-commerce page — not like a crypto
widget. The SUCCESS state is a hero moment: the button transforms in place with an animated
checkmark and a morphed label. The state machine (IDLE → LOADING → AUTH → PROCESSING → SUCCESS
→ ERROR) is a visual narrative — the button IS the story.

Key states to make compelling: IDLE (the product's first handshake with the buyer); PROCESSING
(reassurance — the buyer must feel safe waiting); SUCCESS (the payoff — animated, celebratory
within the merchant page context); ERROR (calm, human, no blame: "Payment didn't go through.
You have not been charged. Try again.").

DISABLED_INSUFFICIENT_FUNDS is subtle but important: the button is disabled but the message
("You don't have enough to complete this payment") must be clearly visible and blame-free.

**B2 — Magic email entry**

The designer does not build this — the Magic SDK renders it. But the designer should show it
in the prototype as a mock of the Magic modal. It should appear as a clean, centered overlay
or sheet on top of the merchant page (behind the darkened PayButton). States: EMAIL_ENTRY
(email field active, CTA disabled) and EMAIL_SUBMITTING (field locked, spinner). Always
include a back arrow.

**B3 — Magic 6-box OTP**

Also rendered by Magic SDK — mock it faithfully in the prototype. The verified pattern from
Privy and Dynamic: back arrow top-left, envelope icon, header sentence, masked/truncated email
in body, 6 single-character boxes, auto-advance per character, auto-submit on 6th digit, resend
link. Show: OTP_AWAITING_INPUT, OTP_AUTO_SUBMITTING, OTP_WRONG_CODE (boxes clear and turn
red), OTP_NOT_RECEIVED (resend link). RETURNING_USER_SKIP is a critical state: if the buyer
has a valid session, B2 and B3 are bypassed entirely — LOADING → B4 directly.

**B4 — Checkout confirmation panel**

This is the buyer's only decision point after auth. It must be simple: merchant name (+ logo if
set), "$12.00," "$847.32 available" (single number, no breakdown), "Pay $12.00" button. No
chain names, no token names, no currency codes unless the merchant opted in. The balance line
uses "Your balance" framing. The CTA verb is the designer's call ("Pay $X.XX" vs "Confirm" vs
"Pay now"). BALANCE_LOADING uses a skeleton for the balance field and a disabled CTA.
INSUFFICIENT_BALANCE replaces the CTA with a disabled state and shows a USD shortfall: "You're
$3.50 short." No crypto vocabulary.

**B5 — Optimistic success panel**

One state only. This is the peak emotional moment of the buyer flow. Animated checkmark
(required — not a static icon). Heading: "Payment complete" or "You're all set." Amount paid,
merchant name, reference number labeled "Reference #" (never "txHash"). Below-fold: "A
confirmation has been sent to [email]." The entire panel should feel as good as the Stripe
success screen with a personalized touch.

**B6 — Error / retry panel**

Four states (INSUFFICIENT_BALANCE_ERROR, TRANSACTION_FAILED, NETWORK_ERROR, MAGIC_AUTH_FAILED)
each need appropriate human-readable copy. The shared principle: the buyer is never blamed and
never sees a technical error. TRANSACTION_FAILED: "Payment didn't go through. You have not been
charged. Try again." Data is preserved. Retry is in place — no page reload.

---

### Merchant / Developer surface

**MA1 and MA2 — Sign Up and Log In**

These are the entry gates to the Tab merchant product. The pattern is the same embedded-wallet
email OTP pattern as the buyer flow — same 6-box OTP, same auto-submit, same Magic SDK. The
surfaces are distinct product shells (Tab dashboard, not a buyer checkout), but share the auth
component visually. MA1 should feel like a clean SaaS sign-up page that happens to use magic
links. MA2 is identical but for returning users; RETURNING_SESSION silently redirects to M4
without showing OTP. Show the cross-link between MA1 and MA2 ("Already have an account? Log
in.").

**MA3 — Settings**

Lightweight form: business name, business logo (with upload affordance and upload progress /
error states), receiving address (display-masked, copyable), and settlement token (read-only:
"USDC on Arbitrum One"). All states required: LOADING (field skeletons), IDLE, EDITING, SAVING,
SAVE_SUCCESS, SAVE_ERROR, LOGO_UPLOADING, LOGO_UPLOAD_ERROR.

**M1 — Demo merchant checkout page**

This is Zone A — the merchant's own page with `<PayButton>` dropped in. It should look like a
real, minimal e-commerce product page (a single product, a price, a description, a button). The
button IS the B1–B6 flow in situ. Show the page in multiple states: IDLE (button ready),
AUTH_OPEN (Magic modal overlays the page), SUCCESS (checkmark on the button, order number
shown if merchant wired onSuccess), ERROR. The demo checkout page exists on a separate route
from the dashboard (M1 is its own page).

**M2 — Quickstart / integration guide**

This is the developer's onboarding home. Numbered steps, each with exactly one action and one
code block. Short imperative titles: "Install," "Create your intent endpoint," "Add the pay
button," "Configure your webhook," "Test it." Step titles are sequential — they don't branch.
The progress story is visual: PRE_INTEGRATION_EMPTY → KEY_CREATED → step by step →
FIRST_TEST_PAYMENT (celebratory banner: "Test payment received. Your integration is working.")
→ LIVE_MIGRATION. The TEST badge is persistent during this whole flow.

**M3 — API keys panel**

Closely modeled on Stripe / Resend key management. EMPTY state has a clear CTA to create the
first key. LIST shows masked key values (`sk_test_••••••••[last4]`), key name, permissions
label, created date, last-used date, TEST or LIVE badge, and row actions (Rotate, Delete — not
Reveal). CREATE_FORM is a modal. KEY_REVEAL is the hero moment of this screen: warning banner,
full monospace key, copy button (changes to "Copied!" for 2 seconds), "I've saved my key" CTA
that closes the modal. After closing, no reveal option exists. This one-time-view pattern must
be unmistakably communicated.

**M4 — Transactions / payments list**

The operational home for most return visits. EMPTY state with illustration + "No payments yet"
+ quickstart link. POPULATED shows rows in reverse-chronological order: USD amount (primary,
larger), USDC amount (secondary, smaller), "Settled" / "Pending" / "Failed" status badge,
timestamp (relative in list; absolute on hover), webhook delivery indicator (check / ! / clock).
TEST_MODE shows a persistent banner + TEST badge per row. LIVE_MODE shows nothing extra —
live payments need no badge. The optional DETAIL_EXPANDED state (side panel or separate page)
shows the full transaction including `transactionId` (full, copyable), "View on Arbiscan ↗,"
`tokenChanges`, receiver address, and webhook delivery status linked to M6.

**M5 — Webhook configuration panel**

Configuration and the embedded delivery log live on this screen. UNCONFIGURED shows a URL
input and "Save." CONFIGURED shows read-only URL, masked signing secret
(`whsec_••••••••[last4]`), and a delivery log section. SIGNING_SECRET_REVEAL mirrors the API
key reveal pattern exactly: warning banner ("For security reasons, you can only view this
signing secret once. Save it to a secure location."), full `whsec_...` value, copy button,
"I've saved my secret" CTA. The retry policy note is read-only text: "Tab will retry failed
deliveries up to 3 times with exponential backoff." All configuration states must be shown:
UNCONFIGURED → EDITING → SAVING → SAVE_SUCCESS → CONFIGURED; SIGNING_SECRET_REVEAL;
DELETE_CONFIRM; DELETED (returns to UNCONFIGURED).

**M6 — Webhook delivery log (standalone)**

POPULATED shows rows in reverse-chronological order with timestamp, HTTP status code (200 /
404 / 500 / TIMEOUT), status label (Delivered / Failed / Timeout / Retrying), attempt number
("Attempt 1 of 3"), associated `transactionId` truncated and linked to M4. EXPANDED_ROW shows
request payload (JSON), response body (first 500 chars), headers (collapsible), response time
in ms. Show RETRYING state on a row (spinner + "Retrying (attempt N of M)").

**M7 — Test / live mode toggle (persistent control)**

This control is always visible on every merchant dashboard screen. TEST_ACTIVE (default):
persistent TEST badge + non-alarming banner ("You are in test mode. Test payments are simulated
and do not move real funds."). LIVE_ACTIVE: LIVE badge, no banner. The transition TEST → LIVE
requires a Go Live confirmation modal (MODAL_OPEN → SWITCHING → SWITCH_SUCCESS → SWITCH_ERROR).
LIVE → TEST is instant, no confirmation.

---

### Agent Owner — web dashboard

**W1 — Agent Overview**

This is the command bridge. The designer's primary design challenge for the Leash product. It
must surface the most critical information at a glance — without feeling like a surveillance
state or a generic dark dashboard. The information hierarchy: agent status chip (top) → spend
bar with current/cap/% (prominent, large, not a thin progress bar) → recent receipt preview
rows (the feed at a glance) → unified float balance + low-float warning if applicable →
quick-action buttons (context-sensitive to agent state).

There is no model chip on this screen. Leash does not know or control what model the owner's
agent uses — that is the owner's concern, configured in their own agent environment.

Key states to show compellingly: ACTIVE (calm, operational); NEAR-LIMIT (warning visual on
spend bar — not panic, but unmistakable); AT-LIMIT / HALTED (interrupt — the leash has
snapped; payments halted, owner action required); NOT PROVISIONED (setup prompt, no spend bar);
LOW FLOAT ("Add funds" surfaced urgently). The LOADING state uses skeletons, not a full-page
spinner — layout is preserved.

Quick-action buttons are context-sensitive: in ACTIVE state, "Pause" and "Adjust cap" are
prominent; in HALTED state, "Raise cap" and "Revoke" are prominent; in PAUSED state, "Resume"
is the primary action.

**W2 — Live Payment Feed**

Real-time feed of x402 payment receipts. New rows prepend as the owner's agent pays for
resources mid-task. The live indicator should communicate real-time motion without being
distracting (the designer's call — pulse, dot, "Live" chip). Each row (minimum 6 fields): USD
amount, resource URL (truncated), chain label (e.g., "Base"), timestamp, txHash (truncated
`0xab12…ef56`, copyable, linked to appropriate block explorer for that chain), status badge
(SUCCESS / FAILED / BLOCKED / PENDING). Spend bar appears above the feed (mirroring W1).

Show the NEAR-LIMIT state (spend bar enters warning visual; banner above feed) and the
AT-LIMIT state (prominent "Payments halted — cap reached" banner; BLOCKED rows start appearing
in the feed for subsequent payment attempts). CAP-RESET notice should appear when cycle resets.

**W3 — Receipt Detail Panel / Overlay**

Opens on row click from W2. Richer data for operators: full USD amount + raw USDC atomic units,
full resource URL (untruncated, copyable), exact timestamp (ISO 8601), full txHash (copyable,
"View on [Explorer]" link that resolves to the correct block explorer for the chain used — e.g.,
Basescan for Base, Arbiscan for Arbitrum), network in technical notation (e.g., "Base
(eip155:8453)" or "Arbitrum One (eip155:42161)" — appropriate here for operator audit), USDC
amount, status, cumulative context for SUCCESS ("Cumulative spend after this payment: $4.20 /
$10.00 cap"), block reason for BLOCKED ("Payment blocked — would push spend to $10.50, exceeding
$10.00 cap"), failure reason for FAILED, trigger URL. BLOCKED DETAIL has no txHash — this is a
design constraint, not an error. EXPLORER LINK UNAVAILABLE: hash still copyable, link disabled.

**W4 — Spend Bar + Cap Configuration**

The spend bar is prominent — not decorative. Three-part format: `$4.20 / $10.00 (42%)`.
Configuration form below: cap amount input, reset frequency selector (Daily / Weekly / Monthly /
Never), cycle start date, next reset date (derived, read-only). Two required read-only notes:
(1) "Payments stop when the cap is reached. The agent does not continue spending." (2) "Notification delivery may lag a few minutes after a threshold is crossed. Set your cap below your true maximum to account for this."

MID-CYCLE LOWERED BELOW CURRENT SPEND is a dramatic state: the spend bar immediately recalculates
to show 100%+ overage, a Tier-3 fires, payments halt. Show this state explicitly — it
communicates the cap is real and immediate.

**W5 — Notifications Center**

All tiers, reverse-chronological by default. Important: the UI label for Tier 2 is "Alert" and
for Tier 3 is "Action required" — never use tier numbers in owner-facing copy. Tier 3 items are
sticky at the top until the owner acts and marked with an urgent visual treatment. CTAs on
Tier 3 items link directly to action: "Raise cap" → W4, "Revoke agent" → W6, "Review" → W3
receipt. ACTIVE TIER 3 state: the unresolved item dominates the view. FILTERED views (Alerts
only / Action required only) should be designable as chips or tabs.

**W6 — Revocation Controls**

Four levels presented as distinct cards or sections — each with a name, one-line consequence,
key fate, reversibility label, and primary action button. The visual severity must escalate
clearly from Level 1 (soft, resumable, calm) to Level 4 (nuclear, permanent, destructive). Do
not make all four look equal.

Confirmation mechanisms are decided and must be rendered precisely:
- Level 1 (Soft pause): simple confirm dialog.
- Level 2 (Freeze): consequence dialog.
- Level 3 (Cancel): text input confirmation (agent name or "CANCEL"); consequence copy: "This
  rotates your server key."
- Level 4 (Nuclear): text input required; irreversibility warning: "This permanently deletes
  your server key. There is no recovery." The destructive button treatment for Level 4 must
  communicate finality.

State machine: AGENT ACTIVE → any level's CONFIRM DIALOG → EXECUTING (single active HTTP call,
all other buttons disabled) → ACTION SUCCESS (state badge updates, available actions update) →
ACTION ERROR (previous state unchanged, retry available).

**W7 — Agent Connection + Provisioning**

This is where the owner connects their agent to Leash. It is the setup entry point: no agent
can auto-pay until the owner completes this flow. Two panels: the API key panel and the
connection guide panel.

API key panel: generates the Leash API key the owner pastes into their agent environment
(Claude Code `.env`, Cursor settings, or any MCP config). KEY_REVEAL is the hero moment —
identical one-time-reveal pattern to M3: warning banner, full key in monospace, copy button
("Copied!" for 2 seconds), "I've saved my key" CTA. After closing, no reveal. PROVISIONED
state shows a masked key (`lsh_••••••••[last4]`), key created date, last-used timestamp (so
the owner can confirm their agent is connecting), and a Regenerate action (with consequence
dialog: "This invalidates your current key. Your agent will stop paying until you update the
key in your environment.").

Connection guide panel: tabbed or stepped code snippet for three environments — MCP server
(for Claude Code / Claude Desktop), HTTP wrapper (for any HTTP client), and environment
variable format. Each snippet is short, copyable, and correct. The copy button is the primary
affordance on each snippet. Below the snippets: a "Test connection" button that triggers a
lightweight health-check request; TESTING state (spinner); CONNECTED state (green indicator,
"Leash is receiving requests from your agent"); NOT_CONNECTED (neutral, "No requests received
yet — paste your key and restart your agent").

States required: NOT_PROVISIONED (setup prompt, key panel shows generate CTA); KEY_REVEAL
(one-time modal); PROVISIONED_NOT_CONNECTED (key exists but no requests seen); PROVISIONED_
CONNECTED (key active, last-seen timestamp); REGENERATE_CONFIRM (consequence dialog).

Note: the owner's agent identity, model, and task are entirely the owner's concern. This screen
connects Leash to the agent's payment path — it does not configure the agent itself.

**W8 — Float Management**

The UA treasury and multi-chain float panel. This screen is about the money the agent draws
from — not the agent connection (that is W7).

Primary section — unified balance: A single large USD number ("$12.50 total available") is the
headline. Below it: a brief explainer line in muted text: "One Particle UA balance. Pre-
positioned across chains automatically." Top-up CTA ("Add funds") opens an amount input; funds
come from the owner's external wallet or exchange and are deposited to the UA.

Secondary section — per-chain float detail: Compact table or card list showing the pre-
positioned USDC float on each active chain: Base ($6.00 USDC), Arbitrum ($4.50 USDC), Polygon
($2.00 USDC). Each row shows chain name, USDC amount, and a low-float indicator if that chain's
float is below the warning threshold. A read-only note: "Leash rebalances these floats
automatically as your agent spends. You do not need to manage individual chain balances." This
section is developer-detail styled (monospace values, compact) — not a primary visual emphasis.

Wallet address section: the Particle UA public address (copyable — for the owner's reference
when depositing; NOT a key value). Security note: "Your Leash server key is separate from this
address. The address is public; your key is never shown here."

NOT_PROVISIONED state (or REPROVISIONING post-nuclear revocation): setup prompt is prominent —
direct the owner to W7 to generate a key first.

States required: LOADING (field skeletons); FUNDED_HEALTHY (all chains above threshold, calm);
LOW_FLOAT_WARNING (one or more chains at threshold, urgent inline badge, "Add funds" surfaced);
CRITICALLY_LOW ("Your agent may not be able to pay — add funds now"); TOP-UP_IN_PROGRESS
(spinner, amount); TOP-UP_SUCCESS ("Funds added. New total: $X.XX"); TOP-UP_ERROR (inline
error, retry available); NOT_PROVISIONED.

---

### Agent Owner — mobile PWA

**P1 — Overview (Home)**

The mobile command center — stripped to essentials. Top section: agent status chip + USD float
balance (one number, large). Middle: spend bar (visual + `$X.XX / $Y.YY` text + "Resets daily"
label). Below: last-payment summary as a single line (amount — resource domain · relative
timestamp). Bottom or floating: Revoke access shortcut.

States: NORMAL (calm), NEAR-LIMIT (non-blocking inline banner, warning spend bar), OVER-LIMIT
(full-width non-dismissable interrupt banner; Revoke section prominent), PAUSED / FROZEN /
CANCELLED (each with their distinct status chip label and corresponding visible control),
OFFLINE (stale indicator, all controls disabled), LOADING (skeletons, layout preserved).

**P2 — Payment Feed**

Mobile card list. Each card: USD amount (primary, large), resource domain + path (truncated),
relative timestamp, txHash (first 6 + last 4, tappable to block explorer), status badge
(Settled / Failed / Blocked). NEAR-LIMIT BANNER and OVER-LIMIT INTERRUPT banner states as
described in the surface map. OFFLINE shows last-fetched rows with stale indicator. Pull-to-
refresh behavior should be implied in the design.

**P3 — Receipt Detail (Overlay / Sheet)**

Full receipt data. Three states: SETTLED RECEIPT (all fields populated, txHash tappable),
FAILED RECEIPT (txHash may be absent, error context shown), BLOCKED RECEIPT (no txHash;
"This payment was not submitted — spending cap was reached before the x402 call was made.").

**P4 — Push Notification and P5 — Expanded Notification View**

These are OS-layer notifications — design them as phone lock screen mockups. P4 is the compact
notification. P5 is the expanded notification (pulled down). Tier 2 compact: title + body.
Tier 2 expanded: + current spend, cap, last payment, resource. Tier 3 compact: title + body.
Tier 3 expanded: + blocked amount, resource URL, current vs cap + optional "Review" / "Revoke"
action button (OQ-P6 resolved: the Revoke action button on Tier 3 triggers soft pause via
service worker HTTP call — show the "Revoke" action button on the Tier 3 expanded notification).

**P6 — Revoke Sheet**

Bottom sheet (or modal — designer's call). Shows the same four levels as W6 but condensed for
mobile: level name, one-line consequence, primary action button. Supporting context at the top:
current status chip (compact), spend bar or text (`$4.20 / $10.00`), last-payment timestamp.

Confirmation mechanics for Level 3 (Cancel) and Level 4 (Nuclear) — exact affordance is the
designer's call (confirmation dialog, type-to-confirm, hold-to-confirm gesture — pick what
conveys the right weight on mobile). Levels 1 and 2 toggle (Pause/Resume, Freeze/Unfreeze)
with a single confirm dialog. OFFLINE state: all controls disabled with inline message "No
connection. Connect to network to revoke." IN-FLIGHT state: tapped control shows spinner, all
other controls disabled. CONFIRMED / SUCCESS: sheet closes; Overview status chip updates.

---

## Data, States, And Mocking Rules

All integrations are mocked. No real network calls, wallet connections, or database reads
appear in the design artifact. The designer populates all numeric values with plausible,
internally consistent mock data.

**Mock data guidelines:**

- Buyer: email `maya.chen@example.com`, balance `$847.32 available`, payment amount `$12.00`,
  merchant "Atlas Coffee Roasters," reference `#TAB-7B4A2`.
- Merchant: business "Atlas Coffee Roasters," logo placeholder, receiving address
  `0x1a2b...cd9e` (truncated). Test transactions with amounts $5–$50. API key
  `sk_test_••••••••a3f9`.
- Agent owner: agent name "Research Agent v2," unified float `$12.50` (Base: $6.00 USDC,
  Arbitrum: $4.50 USDC, Polygon: $2.00 USDC), cap `$10.00 / daily`, cumulative spend
  `$4.20 (42%)`. Recent payment receipts: real-looking resource URLs (e.g.,
  `api.searchgrid.io/v1/search`, `data.cortex.ai/v2/enrich`, `news.feedlabs.io/headlines`),
  amounts $0.01–$1.50, chain labels ("Base," "Arbitrum"), realistic timestamps.
- txHash values: `0x1a2b3c4d...ef56` format. Block explorer label matches chain: "View on
  Basescan" for Base payments, "View on Arbiscan" for Arbitrum payments.

**State coverage requirement:** every screen must include frames for every state listed in the
surface map. Empty states, loading states, error states, and edge states (OTP expired, cap
hit, nuclear post-state) are not optional. Judges look for edge case polish.

**No speculative states:** do not add states not in the surface map. Do not add screens not in
the screen inventory. Scope is defined and right-sized.

---

## Prototype Quality Bar

- High-fidelity with real mocked data. No placeholder text ("Lorem ipsum," "Content here,"
  "[Amount]").
- Every required state from the surface map is represented as a separate frame.
- Hover and focus states implied in the frames (the designer may add these as interaction notes
  rather than full duplicate frames).
- Responsive intent: buyer checkout and mobile PWA designed at 375px viewport; merchant and
  agent web dashboards designed at 1440px with responsive intent documented.
- Components are consistent: the same OTP box appears in B3, MA1, and MA2 (one component,
  three contexts).
- Vocabulary rules enforced visually: inspect any buyer-facing frame — no banned word should
  appear in any label, placeholder, button, or tooltip.
- The animated checkmark in B5 / B1 SUCCESS is noted as animated in the frame (can be a
  static frame with an animation note, or a Lottie / GIF asset — designer's call).

---

## Anti-slop Risks To Avoid

These are product-specific failure modes for this project. Generic crypto dashboard clichés
will actively undermine the judging score and the product's credibility.

**No generic dark-purple-gradient crypto dashboard.** The Leash dashboard is an operator
control surface, not a crypto product page. Reference Mercury, Linear, Vercel, and Ramp for
the aesthetic register — clean, data-forward, professional. If it looks like a DeFi analytics
page, it has gone wrong.

**No glowing cards.** No glassmorphism, no neon-glow status indicators, no dark web3 aesthetic.
This product is explicitly about making crypto invisible. The dashboard surfaces that explicitly
show crypto details (W3 receipt detail, W8 float panel) should show those details in a clean
developer-tool style (monospace, copyable — like Stripe Workbench or Etherscan), not with
decorative crypto styling.

**No wall of equal cards.** The agent overview (W1) and the mobile overview (P1) must have clear
visual hierarchy. The spend bar, agent status, and float balance are NOT equal in importance.
The spend bar is the primary operational signal — it should be large and legible. Items below it
are secondary.

**The buyer checkout must NOT look like Coinbase Commerce.** Coinbase Commerce is the named
anti-pattern: cryptocurrency selector, countdown timer, QR code, wallet address, 30-minute
confirmation wait, "Awaiting Payment" state. Tab's checkout must look like Stripe Link or Apple
Pay: one balance, one button, one tap, instant success. No countdown. No address display. No
chain-level confirmation states. The optimistic success fires immediately on `sendTransaction`
return — not after block confirmations.

**Every state present.** The most common prototype failure for judged demos is missing edge
states. A demo where the judge asks "what happens when the OTP is wrong?" or "what does the
spend bar look like at 100%?" and the designer has no frame is a visible gap. All states in
the surface map are required.

**Honest revocation copy.** The leash is economic and operational — not cryptographic. "Nuclear"
is the Level 4 action name; its consequence is "permanently deletes your server key." Do not
write "on-chain revocation," "cryptographic kill switch," or "blockchain-level delegation
revoked." Judges penalize overclaiming.

**No crypto vocabulary in any buyer-facing frame.** Inspect every buyer-facing frame character
by character. The ban list from the surface map (chain, gas, bridge, Arbitrum, EOA, wallet
address, sign, EIP, token, USDC unless opted in) must not appear anywhere a buyer sees. This
includes placeholder text, loading copy, error messages, and tooltips.

---

## Interaction Opportunities

These are design moments worth elevating beyond static frames. The designer chooses which to
pursue based on their judgment of demo impact.

- **PayButton state machine:** the IDLE → LOADING → AUTH → PROCESSING → SUCCESS transition is
  the hero interaction. Consider a seamless morph rather than discrete jumps — especially
  the PROCESSING → SUCCESS transition (spinner resolves into an animated checkmark).
- **Spend bar near-limit transition:** the bar's color / visual treatment shifting as it crosses
  75% and then 100% is the physical analog of "the leash tightening." This transition should
  feel alive.
- **Live feed row prepend:** new rows prepending to W2 at ~3s polling intervals could be shown
  as a micro-animation (row slides in from top). Communicates "live" without a blinking dot.
- **Nuclear confirmation:** Level 4 has the highest friction. The confirmation interaction
  (type-to-confirm, destructive button) should communicate genuine weight and irreversibility.
  The contrast between this and Level 1 (simple confirm) should be felt.
- **Returning buyer skip:** the RETURNING_USER_SKIP path (valid session → skip OTP entirely →
  LOADING → checkout panel directly) should feel magical — the buyer comes back and the step
  that was hard before is just gone.
- **Push notification → revoke:** tapping the Tier 3 push notification → PWA opens at the
  right state → one tap to pause. The three-step flow from alarm to control should feel like
  the product's core value proposition demonstrated in motion.

---

## Inspiration And Source Material

These are referenced for design vocabulary. The designer studies them for what each teaches,
not to replicate them.

**Stripe Checkout + Payment Element** — the gold standard for embedded checkout DX. Study: the
express-checkout-above-form layout (express options at top, "Or" divider, full form below); the
button state machine (idle → loading → success with label morph); the one-time API key reveal
flow ("Save the key value. You can't retrieve it later." + click-to-copy); the test/live mode
split with distinct key prefixes (`sk_test_` / `sk_live_`); the success page anatomy (heading,
amount, confirmation email line above fold). Teaches: professional DX without ceremony.

**Daimo Pay** — the leading crypto checkout that actually hides crypto. Study: the
`payment_started` optimistic success pattern (show success on tx detection, not after
confirmations); the "funds arrive in seconds" speed framing; the total abstraction of chain
selection, wallet connection, bridge, and gas. Teaches: Tab's success moment must fire
immediately — not after any blockchain wait.

**Mercury / Linear / Vercel dashboards** — the aesthetic register for the Leash web dashboard.
Study: Mercury for a clean fintech data density; Linear for issue status chips and state
communication without heavy color use; Vercel's Spend Management for threshold-based
notification UX (50%/75%/100% escalation, the exact pattern Leash adapts). Teaches: an
operator dashboard can be data-rich without feeling like a crypto product.

**Ramp / Brex spend controls** — the corporate card spend management pattern space closest to
the Leash cap/revoke surface. Study: Ramp's "out of policy" flag UX; Brex's spend bar +
"Notifications when approaching or exceeded" toggle; the "Allow limit increase requests" CTA.
Teaches: the spend bar and cap configuration belong to a mature, understood pattern — apply
that register, not a novel crypto one.

**Privy and Dynamic OTP flows (both VERIFIED-LIVE 2026-07-02)** — the de facto standard for
embedded wallet email OTP. Structure is identical: back arrow → envelope icon → header sentence
→ body sentence with masked/truncated email → 6-box OTP → auto-advance → auto-submit on 6th
digit → resend link. Both use this exact structure independently. This is the component the
designer mocks for B2, B3, MA1, and MA2.

**Anti-reference: Coinbase Commerce (hosted)** — the design must NOT resemble this product.
Coinbase Commerce shows: cryptocurrency selector before payment, a countdown timer for rate-lock,
a QR code with a wallet address, an explicit "Awaiting Payment" state, chain-level confirmation
progress ("Pending → Confirmed"), and settlement times up to 30 minutes. Any Tab checkout frame
that echoes these patterns — countdown timers, QR codes, wallet addresses, confirmation progress
bars, chain selection — has violated the core product promise.

---

## Creative Freedom

Visual direction — including color system, typography, spacing, corner radius, icon set, dark
mode, brand voice, illustration style, component library choice, and motion design language —
is entirely the designer's call. This brief does not prescribe any of these.

The only visual constraint is what emerges from the product's honest character: a product that
hides crypto from buyers while giving operators clear, trustworthy control. That honest
character should drive the aesthetic choices, not the genre conventions of "a crypto product."

The designer's creative interpretation is expected and welcome. Surprise and delight at the
visual level is a differentiator in hackathon judging.

---

## Explicit Non-goals

These are out of scope for the prototype. Do not add them.

- **No real integrations.** No real wallet connections, no real Particle Network calls, no live
  blockchain data, no real Magic SDK session, no real database. All data is mocked.
- **No SSO, 2FA, roles, billing, or org management** in the merchant dashboard. Right-sized
  scope: email + Magic OTP is the only auth method. One user per account. No billing tiers.
- **No extension-wallet UI.** MetaMask and injected wallet flows do not exist in this product.
  Extension wallets cannot produce EIP-7702 authorization lists and are explicitly excluded.
- **No on-device signing on mobile.** The mobile PWA holds no private key and shows no signing
  UI. Every revoke action is an HTTP call to the backend. No `signMessage`, `signAuthorization`,
  or wallet connect affordance appears on any mobile screen.
- **No cryptocurrency selection for the buyer.** The buyer never picks a chain, token, or
  network. Chain abstraction handles this invisibly.
- **No rate-lock countdown timer.** The buyer checkout must not show a timer of any kind.
- **No QR code or wallet address for the buyer.** The buyer never sees a wallet address, a QR
  code, or a "Copy address" button.
- **No custom Solidity contract UI.** The spend cap is app-layer policy. No on-chain
  transaction confirmation for revocation.
- **No LLM or model selection in Leash.** Leash does not know, display, or control what AI
  model the owner's agent uses. There is no model picker, no OpenRouter integration, no "which
  model" UI in any Leash screen. The owner configures their model in their own agent
  environment.
- **No Solana.** All Leash chains are EVM: Base, Arbitrum, Polygon. Solana is out of scope.
- **No UA V1 migration interstitial design** (OQ-B2 — this open question is not resolved and
  not in scope for the prototype).

---

## Open Questions (Designer's Call Items)

These are genuine undecided items the designer must pick and commit to. The choices become
canonical for the prototype.

**Buyer surface:**
- Modal vs. drawer vs. bottom sheet vs. centered overlay for the checkout panel (B4) relative
  to the `<PayButton>` on mobile.
- Whether the Magic OTP modal (B2/B3) and the Tab checkout panel (B4) share one visual container
  or appear as visually sequential layers.
- Exact CTA verb in B4: "Pay $12.00" vs "Confirm" vs "Pay now."
- Whether the B5 success panel auto-dismisses after N seconds or requires an explicit close.
- Animated checkmark implementation preference: SVG animation, Lottie, or CSS keyframes.

**Merchant dashboard:**
- Dashboard navigation structure: sidebar vs. top nav vs. tab bar.
- Transaction detail container: side panel (Stripe-style) vs. modal vs. separate page.
- Whether the Quickstart includes auto-detected step completion (polling) or manual progression.
- Infinite scroll vs. pagination for the M4 transactions list.
- Whether a "Send test webhook" button exists on M5 (synthetic payload to configured URL).

**Agent owner — web:**
- Overall layout: sidebar navigation vs. top nav; single-page vs. routed sections.
- Receipt detail (W3): side panel vs. modal vs. separate page.
- Color system for spend bar states (the designer picks the three-state palette: neutral →
  warning → danger — no colors are prescribed).
- Live-update visual treatment in W2 (live indicator type: pulse dot, "Live" chip, row-prepend
  animation, or combination).
- Level 3 and Level 4 confirmation exact affordance on web (text-input-to-confirm vs.
  checkbox + typed phrase vs. other).
- Connection guide panel in W7: tab-per-environment vs. stepped accordion vs. single
  recommended snippet with language toggle (MCP / HTTP / env-var).

**Agent owner — mobile PWA:**
- Navigation model: tab bar vs. header back-navigation vs. single-scroll.
- Revoke Sheet container: bottom sheet vs. full-screen overlay vs. modal dialog.
- Levels 1 and 2 as toggle buttons (state-aware Pause/Resume, Freeze/Unfreeze) vs. separate
  state-aware controls.
- Level 3 / Level 4 confirmation on mobile: type-to-confirm vs. hold-to-confirm gesture vs.
  confirmation dialog with checkbox.
- Visual and textual distinction between "Paused" (soft pause, resumable, loop halted, key
  intact) and "Frozen" (frozen, resumable, transactions blocked, key intact) — two states that
  are semantically close; the design must make them feel meaningfully different (OQ-P4).
- Feed row: show atomic USDC amount alongside USD, or USD only until receipt detail.
- Empty state treatment: illustration vs. icon vs. plain text.

---

## Handback Contract

This brief is delivered to an AI designer agent without a live interview. The following
defaults apply unless the designer explicitly states a different preference:

**Deliverable format:** one frame per screen per state. States are named using the IDs from the
surface map (e.g., "B1 — IDLE," "W1 — AT-LIMIT / HALTED," "P6 — CONFIRMED / SUCCESS") so
frames can be cross-referenced against the surface map. Frames grouped by surface (Buyer /
Merchant / Agent Web / Agent Mobile) then by screen then by state.

**File structure (default):** four top-level groups in the design file. Within each group,
screens are in the recommended design order from this brief's screen-by-screen direction section.

**Mocked data:** designer populates all numeric and string fields with the mock data values
listed in the "Data, States, And Mocking Rules" section. If the designer prefers different
placeholder conventions, state the preference and it will be accepted.

**Open questions:** the designer resolves every open question in this brief and documents the
chosen direction in a brief cover note or frame annotation. These choices are canonical for
the prototype and will be respected downstream.

**Adjustable:** if the designer has specific format needs (file type, frame naming convention,
component library, delivery method), state the preference and the brief will be updated to
match before work begins.

---

*End of Designer Brief — Tab + Leash*
*Source of truth for screens and states: `design/2026-07-02-product-surface-map.md`*
*Source of truth for requirements: `specs/2026-07-02-tab-leash.md`*
