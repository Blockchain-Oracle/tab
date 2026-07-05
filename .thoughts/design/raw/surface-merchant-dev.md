# Surface Map: Tab merchant / developer surface

> Spec sources: `.thoughts/specs/2026-07-02-tab-leash.md` (R-TAB-1,2,3, AC-TAB-4),
> `.thoughts/stories/story-1-merchant-integrates-tab.md`,
> `.thoughts/research/2026-06-30-ux-reality-research.md §D` (developer DX).
>
> RULE: This document makes the implicit explicit. It does NOT specify visual direction,
> layout, colors, or component architecture. Trace IDs anchor every design decision to a
> source requirement or verified research fact.

---

## What this surface is

The Tab merchant / developer surface covers every screen, panel, and overlay that a
merchant or developer encounters from first discovering Tab through operating a live
integration. It has two logical zones:

- **Zone A — Demo merchant checkout page.** The `<PayButton>` embedded in a merchant's
  product page. The merchant IS the author of this page; they see it both as an integrator
  (reading the quickstart) and as a live page their customers land on. The buyer surface
  (Magic OTP modal, success screen) is a separate surface map; this map covers only what
  the merchant controls and configures on that page.
- **Zone B — Tab merchant dashboard.** Where the merchant creates API keys, configures
  webhooks, inspects payments, and toggles between test and live mode. The spec (R-TAB-3)
  references "the merchant's configured webhook URL" without specifying where configuration
  happens. Story 1 Open Question 4 explicitly flags this as unresolved. This surface document
  resolves it as a dashboard, which is warranted by UX research §D (universal pattern across
  Stripe, Resend, LemonSqueezy, Clerk). Screens in Zone B are marked DECIDED or DESIGNER'S
  CALL individually.

---

## Screen inventory

---

### SCREEN 1 — Demo merchant checkout page

**Purpose:** A merchant product page with `<PayButton>` embedded. Demonstrates the complete
integration to hackathon judges and serves as the live surface buyers land on.

**Entry from:** Quickstart step "Test your integration" link; direct URL; merchant's own
product page after they embed the component.

**Traces to:** R-TAB-1 (`<PayButton>` is the sole integration artifact), R-TAB-2 (amount
and price come from the intent endpoint), R-TAB-10 (full button state machine), AC-TAB-1
(buyer flow completes by entering email + OTP only), Story 1 (Scenario 1 happy path).

**Required states:**

| State | Trigger | What merchant's page shows |
|---|---|---|
| INITIALIZING | SDK script loaded; intent fetch in flight | `<PayButton>` area shows skeleton/shimmer; layout preserved (no full-page spinner). Source: UX research §A ("skeleton screens while element initializes, layout preserved"). |
| IDLE | Intent fetch succeeded; buyer has not clicked | "Pay $X.XX" + lock icon. Amount sourced from intent endpoint `amount` + `currency`. Source: R-TAB-10, UX research §A button-state table (IDLE row). |
| INTENT_FETCH_ERROR | Merchant's `/api/pay/intent` returned error or timed out | Button area shows inline error below: "Unable to load payment details. Try refreshing." Button disabled. No retry CTA inside the button itself (page-level refresh is the escape). |
| AUTH_OPEN | Buyer clicked "Pay $X.XX"; Magic OTP modal has opened | Button behind the modal shows LOADING state (disabled + spinner). The modal is rendered by the buyer surface; the merchant's page is dimmed behind it. |
| AUTH_CANCELLED | Buyer dismissed the Magic OTP modal | Button returns to IDLE. No error displayed. Buyer's choice — soft cancel, not an error. Source: UX research §A ("CANCELED — soft copy, not an error"). |
| PROCESSING | Magic auth completed; `ua.sendTransaction` in flight | Button disabled + spinner + "Processing…" label. Prevents double-submit. Source: R-TAB-10, UX research §A (PROCESSING/PENDING row: "button disabled + spinner OR label → Processing…"). |
| SUCCESS | `ua.sendTransaction` returned `transactionId` | Animated checkmark. Button label morphs to "Done" (or merchant-configured label via `<PayButton>` prop). `onSuccess(transactionId, tokenChanges)` fires in the browser. Merchant's page may render a confirmation block below the button. Source: R-TAB-10, R-TAB-8 (optimistic — fires on `sendTransaction` return, NOT after block confirmations), AC-TAB-3, UX research §A (SUCCESS row: "animated checkmark"). |
| ERROR | `ua.sendTransaction` threw or returned an error | Inline error adjacent to button: "Payment didn't go through. You have not been charged. Try again." Entered state is preserved; buyer can retry without page refresh. Source: R-TAB-10, UX research §A (FAILURE row: "Stripe form shakes. Entered data preserved. Alternative payment method offered immediately"). Note: Tab has no alternative payment method in this surface; retry in place is the recovery path. |

**On-screen data shapes (what the merchant's page shows — not what the PayButton SDK renders internally):**

- Product name / description: merchant-set strings, not provided or validated by Tab.
- Price: `$X.XX` displayed on the button, sourced from intent endpoint `{ amount, currency }`. The merchant's page must NOT display a separate price that could diverge from the intent endpoint amount. The button IS the price display.
- Post-success confirmation block (if merchant wires `onSuccess`): contains `transactionId` (a non-empty string uniquely identifying the settlement, matching what the webhook delivers). The merchant decides what else to show (order number, shipping estimate). Tab provides only `transactionId` and `tokenChanges`.

**What this screen does NOT show (buyer-facing vocabulary exclusions):**

None of the following appear anywhere on this page: "chain", "gas", "bridge", "Arbitrum",
"EOA", "wallet address", "sign", "EIP", "USDC" (unless merchant opted into showing token).
Source: R-TAB-9, AC-TAB-1.

---

### SCREEN 2 — Dashboard: Quickstart / integration guide

**Purpose:** Numbered step-by-step guide for a developer going from zero to a working
`<PayButton>`. One action, one code block per step. Gets the merchant to their first test
payment as quickly as possible.

**Entry from:** First login (default landing state); "Get started" link from any dashboard
screen; "Integration guide" in sidebar nav.

**Traces to:** R-TAB-1 (install SDK), R-TAB-2 (create intent endpoint), R-TAB-3 (configure
webhook), UX research §D ("each step contains exactly one action and one code block; steps do
not branch; short imperative titles only" — Resend, Stripe, Clerk convergence; "each quickstart:
full end-to-end interactive code samples with step-by-step instructions").

**Required states:**

| State | Trigger | What the page shows |
|---|---|---|
| PRE_INTEGRATION_EMPTY | First login; no API key created yet | All steps visible, none completed. Test mode badge active. Step 1 code block shows placeholder (`<YOUR_API_KEY>`) until first key is created. |
| KEY_CREATED | Merchant created their first test key | Step 1 code block auto-populates with the actual test key prefix (masked: `sk_test_••••` + last 4). Step 1 shows a "Done" indicator. |
| STEP_COMPLETE | Detected completion (e.g., first test payment received) | The completed step shows a visual "done" marker (checkmark). Whether Tab auto-detects step completion from real events is a DESIGNER'S CALL (auto-detection would require polling; simpler is manual checkbox). |
| FIRST_TEST_PAYMENT | Tab receives a test payment from this merchant | A milestone banner or card appears: "Test payment received. Your integration is working." CTA: "Switch to Live mode". |
| LIVE_MIGRATION | Merchant switches to live mode during/after quickstart | Step for "Go live" becomes the active step; test key reminder shown. |
| LOADING | Page first load | Skeleton for each step row while fetching merchant's state. |

**On-screen data:**

- Mode badge: `TEST` (persistent, top of page or in global header)
- Numbered steps (DECIDED: these specific steps reflect R-TAB-1, R-TAB-2, R-TAB-3; exact step count and wording are DESIGNER'S CALL):
  - Step 1 — "Install": `npm install @tab/sdk` (package name is OQ-3 from Story 1; designer leaves placeholder)
  - Step 2 — "Create your intent endpoint": code block showing the server endpoint returning `{ amount, receiver, token: { chainId: 42161, address: TOKEN }, currency }`. Source: R-TAB-2.
  - Step 3 — "Add the PayButton": code block showing `<PayButton intentUrl="/api/pay/intent" onSuccess={handleSuccess} />`. Source: R-TAB-1.
  - Step 4 — "Configure your webhook": link to Webhook Configuration panel + "Your Tab server will POST to this URL on every settlement." Source: R-TAB-3.
  - Step 5 — "Test your integration": link to demo checkout page URL + instruction to complete a test payment.
- Per step: step number, short imperative title, one-sentence description, one code block (language-labeled, copyable).
- Security note on step 1: "Store your API key in an environment variable, not in source code." Source: UX research §D ("Store sensitive keys in a secrets vault / Don't put keys in source code").

---

### SCREEN 3 — Dashboard: API keys panel

**Purpose:** Create and manage Tab SDK API keys. Secret key value is shown exactly once on
creation and is never retrievable thereafter. Publishable key is safe to embed in client code.

**Entry from:** Dashboard sidebar nav ("API Keys" or "Developer"); quickstart step 1 "Create
your first key" CTA; quickstart code block "View API Keys" link.

**Traces to:** R-TAB-1 (SDK requires keys for initialization), UX research §D (API key
one-time-view pattern: "create → view/copy in modal → confirm saved → modal closes; key is
no longer retrievable in plaintext after close" — Resend + Stripe convergence; "For security
reasons, you can only view the API Key once" — Resend verbatim; Stripe: "Save the key value.
You can't retrieve it later").

**Required states — keys list:**

| State | Trigger | What the panel shows |
|---|---|---|
| EMPTY | No keys created yet | "No API keys. Create your first key to start integrating." + primary "Create key" CTA. |
| LOADING | Page/panel first load | Table skeleton rows. |
| LIST | One or more keys exist | Table of key rows (data shape below). |
| TEST_MODE | Test mode is active | All visible keys are test-prefixed. New keys created are test keys. Banner or badge: "You are in test mode." |
| LIVE_MODE | Live mode is active | All visible keys are live-prefixed. |
| FETCH_ERROR | API call to load keys failed | "Unable to load API keys. Try refreshing." Retry button. |

**Required states — key creation modal:**

| State | Trigger | What the modal shows |
|---|---|---|
| CREATE_FORM | Merchant clicked "Create key" | Modal open. Fields: Key name (text, optional, placeholder "e.g. Production server"). Permissions: radio/select — "Full access" / "Sending access". "Create key" button (primary). "Cancel" button (secondary). |
| CREATING | Merchant submitted the form | Form fields disabled. Spinner on "Create key" button. |
| KEY_REVEAL | Key creation succeeded | Warning banner (prominent): "For security reasons, you can only view this key once. Save it to a secure location before closing this dialog." Full key value in monospace, highlighted. Copy button. "I've saved my key" CTA (primary, closes modal only when clicked). |
| KEY_REVEAL_COPY_CONFIRMED | Merchant clicked the copy button | Copy button shows a brief "Copied!" checkmark state (~2s). |
| KEY_REVEAL_CLOSED | Merchant clicked "I've saved my key" | Modal closes. New key row appears in the list with masked value. No reveal option in the row. |
| CREATE_ERROR | Server error during creation | Inline error in modal: "Unable to create key. Try again." Fields remain filled. |

**On-screen data per key row in the list:**

| Field | Format | Notes |
|---|---|---|
| Key name | Merchant-set string or "Unnamed key" | |
| Key type | "Publishable" / "Secret" | Publishable key is safe to embed in client code. Secret key must never be exposed in browser. Source: UX research §D ("It's safe to embed this key in your code or apps" — Stripe publishable key callout). |
| Masked key value | `sk_test_••••••••[last4]` or `pk_test_••••••••[last4]` | Full value never shown after creation for merchant-created secret keys. |
| Environment badge | `TEST` or `LIVE` pill | |
| Permissions label | "Full access" or "Sending access" | |
| Created date | Absolute date: "Jul 2, 2026" | |
| Last used | Relative: "3 hours ago" or "Never" | |
| Row actions | "Rotate" (generates a new key; old key immediately invalid — DESIGNER'S CALL whether to warn), "Delete" (destructive confirm modal) | "Reveal" action does NOT exist for merchant-created secret keys after first view. Source: UX research §D ("You can't retrieve it later"). |

**On-screen data in the key reveal modal:**

| Field | Format |
|---|---|
| Warning banner copy | "For security reasons, you can only view this key once. Save it to a secure location before closing this dialog." (mirrors Resend pattern verbatim) |
| Full key value | Monospace string, selectable, e.g. `sk_test_abcdefghijklmnopqrstuvwxyz1234` |
| Copy button | Adjacent to key value; changes to "Copied!" for ~2s on click |
| Confirmation CTA | "I've saved my key" — primary, closes modal |
| Cancel link | "Cancel" below CTA — closes modal WITHOUT creating the key if merchant hasn't saved it yet. Wait: this is a UX question — can the merchant cancel AFTER seeing the key? In that case the key IS already created server-side. DESIGNER'S CALL on whether to show a "This key has been created. Closing without copying means you will need to delete and create a new one." warning. |

---

### SCREEN 4 — Dashboard: Transactions / payments list

**Purpose:** Reverse-chronological feed of all payments settled through Tab for this
merchant. Serves as the merchant's audit trail and order-fulfillment confirmation log.

**Entry from:** Dashboard sidebar nav ("Payments" or "Transactions"); global dashboard
landing after first payment; quickstart "first payment received" milestone link.

**Traces to:** R-TAB-3 (webhook delivers `transactionId` + `tokenChanges`; these are the
canonical settlement fields), AC-TAB-4 (webhook fires with matching `transactionId` and
`tokenChanges`), R-TAB-2 (settlement chain is always Arbitrum One, chainId 42161 — fixed),
UX research §D (Stripe Workbench: Inspector + Logs; Payman Execution Trace per-entry fields:
"timestamp + counterparty + status badge").

**Required states — list view:**

| State | Trigger | What the panel shows |
|---|---|---|
| EMPTY | No payments received yet (test or live) | Illustration + "No payments yet. Complete your integration and make a test payment to see it here." + link to quickstart. |
| LOADING | Page first load or refresh | Skeleton rows (3–5 visible, matching row height). |
| POPULATED | One or more payments exist | Rows in reverse-chronological order. |
| FILTERED | Merchant has applied a status or date filter | Active filter chips shown above list. Filtered row count shown: "Showing 12 of 47 payments". |
| TEST_MODE | Test mode is active | Persistent banner above list: "Showing test payments only. Switch to Live mode to view real payments." List rows have a `TEST` badge. |
| LIVE_MODE | Live mode is active | No test banner. Real payments shown. |
| LOAD_MORE | Merchant scrolls to bottom / clicks "Load more" | Pagination or infinite scroll — DESIGNER'S CALL. |
| FETCH_ERROR | API call to load transactions failed | "Unable to load payments. Try refreshing." Retry button. |

**On-screen data per transaction row:**

| Field | Format | Notes |
|---|---|---|
| Amount (primary) | `$X.XX` USD-denominated | Fiat-first display. Source: UX research §A ("dual-currency display format: fiat first, larger; crypto secondary"). |
| Token amount (secondary) | `X.XX USDC` (or USDT — pending OQ-4) | Smaller, below or inline with fiat amount. |
| Settlement chain | `Arbitrum One` | Always shown; always Arbitrum One (R-TAB-2 pins chainId 42161). This is information-dense for the developer; the buyer never sees it. |
| `transactionId` | Truncated: `0x1234…5678` with copy-on-click | Links to transaction detail panel/page. Source: R-TAB-3 (canonical identifier from `TransactionResult.transactionId`). |
| Status badge | `Settled` / `Pending` / `Failed` | |
| Timestamp | Relative: "2 minutes ago"; absolute on hover: "Jul 2, 2026 at 14:32 UTC" | |
| Webhook delivery indicator | Icon: delivered (check) / failed (exclamation) / pending (clock) | Quick-scan signal for the merchant. Links to webhook log entry. |
| Payer type (stretch, R-RAIL-2) | `Human` / `Agent` badge | Only shown if R-RAIL-1 / R-RAIL-2 is in scope. DESIGNER'S CALL whether to include in MVP column. |

**On-screen data in transaction detail panel (side-panel or full-page — DESIGNER'S CALL on container):**

| Field | Format | Notes |
|---|---|---|
| `transactionId` | Full value, monospace, copyable | e.g. `0xabc123...def456` (or Particle UA's own ID format — must match whatever `sendTransaction` returns) |
| Amount | `$X.XX` + `X.XX USDC on Arbitrum One` | |
| `tokenChanges` | Structured view OR collapsed JSON | Shows credited amount, token address, chain. Exact shape from `TransactionResult.tokenChanges`. DESIGNER'S CALL on expand/collapse. |
| Receiver address | Merchant's wallet address (from intent endpoint `receiver` field) | Copyable. Confirms payment landed at the correct address. |
| Settlement chain | `Arbitrum One (chainId: 42161)` | |
| Block explorer link | "View on Arbiscan ↗" | Links to `https://arbiscan.io/tx/{txHash}` from the Particle settlement. Source: AC-TAB-4 references the `transactionId`; the full `txHash` is the on-chain equivalent. |
| Timestamp | Full ISO 8601: `2026-07-02T14:32:05Z` | |
| Webhook delivery status | `Delivered` / `Failed` with link to webhook log entry | |
| Intent endpoint called | URL of the merchant's intent endpoint (e.g. `/api/pay/intent`) | Audit trail. |
| Payer type (stretch) | `Human payer` or `Agent payer (x402)` | |

---

### SCREEN 5 — Dashboard: webhook configuration panel

**Purpose:** Set and manage the webhook URL that Tab's server POSTs to on every settled
payment. This is the merchant's order-fulfillment trigger (the `payment_intent.succeeded`
analog). Configuration here resolves Story 1 Open Question 4 ("Where does the merchant
configure the webhook URL?").

**Entry from:** Dashboard sidebar nav ("Webhooks" or "Developer"); quickstart step 4 CTA;
transaction detail "Webhook delivery status" link (takes merchant to the log within this panel).

**Traces to:** R-TAB-3 (Tab server POSTs to "the merchant's configured webhook URL" —
where that URL is configured is unspecified in spec; this surface resolves it as a dashboard
panel), AC-TAB-4 (webhook must fire within a defined timeout of settlement), Story 1 OQ-4,
UX research §D (Stripe Workbench "Webhooks" tab; "Add destination" / "Manage" controls).

**Required states — configuration section:**

| State | Trigger | What the section shows |
|---|---|---|
| UNCONFIGURED | No webhook URL set | Inline prompt: "Add a webhook URL to receive payment confirmations." URL input field + "Save" button. No log section shown. |
| LOADING | Fetching current config | Input field skeleton. |
| CONFIGURED | URL is saved | Current URL shown in a read-only display field with "Edit" and "Delete" actions. Delivery log section appears below. |
| EDITING | Merchant clicked "Edit" | URL field becomes editable. "Save" (primary) and "Cancel" buttons appear. |
| SAVING | Merchant clicked "Save" | "Save" button shows spinner, fields disabled. |
| SAVE_SUCCESS | Save API call returned 200 | Inline confirmation: "Webhook URL saved." (auto-dismisses after ~3s, or persists as non-animated state change). |
| SAVE_ERROR | Save API call failed | Inline error adjacent to field: "Could not save webhook URL. Check the URL format and try again." Field preserved. |
| DELETE_CONFIRM | Merchant clicked "Delete" | Destructive confirmation (inline or modal): "Remove this webhook URL? Tab will not deliver payment notifications until you add a new one." "Remove" (destructive) / "Cancel". |
| DELETED | Delete confirmed | Returns to UNCONFIGURED state. |

**On-screen data — configuration section:**

| Field | Format | Notes |
|---|---|---|
| Webhook URL | Text input, placeholder: `https://yoursite.com/api/tab-webhook` | Validated as a valid HTTPS URL on save. HTTP URLs should warn or block (security pattern). |
| Webhook signing secret (OPEN QUESTION) | If Tab implements HMAC signing: "Tab signs each webhook payload with this secret so you can verify deliveries." Secret shown once on first configuration (same one-time-view pattern as API keys). | NOT specified in the spec. Stripe-standard DX best practice. Mark as DESIGNER'S CALL / open pending engineering decision. |
| Retry policy note | Static copy: "Tab retries failed deliveries up to [N] times with exponential backoff." | Exact policy is Story 1 OQ-2 (unresolved). Designer leaves `[N]` as a placeholder. |

**Required states — delivery log section (embedded in the same screen, below config):**

| State | Trigger | What the section shows |
|---|---|---|
| EMPTY | No deliveries yet | "No webhook deliveries yet. Make a test payment to see your first delivery." |
| LOADING | Fetching log | Skeleton rows. |
| POPULATED | Deliveries exist | Rows in reverse-chronological order (data shape below). |
| EXPANDED_ROW | Merchant clicked a row | Row expands to show full request payload and merchant server's response. |
| FETCH_ERROR | API call to load log failed | "Unable to load webhook log. Try refreshing." |
| RETRYING (if auto-retry) | Tab is making a retry attempt | Row shows spinner + "Retrying (attempt 2 of 3)". |

---

### SCREEN 6 — Dashboard: webhook delivery log (standalone view)

**Purpose:** Full paginated audit log of all webhook delivery attempts. Reached when the
merchant needs to debug or review a specific delivery beyond what the embedded log section
on Screen 5 shows.

**Entry from:** "View all deliveries" link from Screen 5 delivery log section; transaction
detail "Webhook delivery" link.

**Traces to:** R-TAB-3, AC-TAB-4, UX research §D (Stripe Workbench Webhooks tab anatomy).

This screen shares all states with the delivery log section of Screen 5 but in a full-page
context with pagination controls and potentially more filtering options.

**On-screen data per delivery log row:**

| Field | Format | Notes |
|---|---|---|
| Delivery timestamp | Relative: "4 minutes ago"; absolute on hover: "Jul 2, 2026 at 14:32:05 UTC" | |
| HTTP status returned by merchant endpoint | `200` / `404` / `500` / `TIMEOUT` | Raw HTTP code plus a label. |
| Status label | `Delivered` (green) / `Failed` (red) / `Timeout` (amber) / `Retrying` (spinner) | |
| Attempt number | "Attempt 1" / "Attempt 2 of 3" | Only shown if retries are implemented. |
| Associated `transactionId` | Truncated, links to transaction detail (Screen 4) | |
| Endpoint URL | The configured webhook URL | |

**Expanded row data:**

| Field | Format | Notes |
|---|---|---|
| Request payload | Formatted JSON: `{ "transactionId": "...", "tokenChanges": [...] }` | Exact fields from R-TAB-3. Copy button. |
| Response body | First 500 chars of merchant server's HTTP response body | Truncated with "Show more" if longer. |
| Request headers | Collapsible: `Content-Type: application/json` + any signing headers | |
| Response time | `342ms` | Round-trip latency from Tab server to merchant endpoint. |
| Manual "Resend" button | Sends the same payload to the configured URL again | DESIGNER'S CALL — whether manual resend is supported by the Tab server is not specified. Mark as open. |

---

### SCREEN 7 — Test / live mode toggle (persistent control + "Go Live" flow)

**Purpose:** Switch the entire dashboard context between test and live environments. Governs
which API keys, transactions, and webhook logs are shown across all screens. "Going live" is
a one-time transition that requires explicit confirmation.

**Entry from:** Persistent control in the dashboard header or sidebar (visible on every
screen). The "Go Live" confirmation flow is triggered from the toggle when switching from test
to live for the first time.

**Traces to:** UX research §D ("all products start developers in test mode by default";
LemonSqueezy: "test mode toggle at bottom-left of admin panel; separate test/live environments
with separate products/customers/purchases"; Stripe: "key prefix encodes mode visually;
dashboard pages notify and disable live settings while in sandbox"; "going live requires
creating a new API key in live mode").

**This is a persistent control, not a standalone screen.** The states below describe how
every other screen is affected when this control is toggled. The "Go Live" confirmation is
a modal that interrupts the toggle action.

**Required states of the toggle control:**

| State | What every screen shows |
|---|---|
| TEST_ACTIVE (default) | Persistent `TEST` badge on the toggle control (location and color: DESIGNER'S CALL). Non-destructive banner on each data screen: "You are in test mode. Test payments are simulated and do not move real funds." API key rows show `sk_test_` / `pk_test_` prefixes. Transaction list shows only test-mode payments with `TEST` badge per row. |
| LIVE_ACTIVE | `LIVE` badge on the toggle control (different visual treatment from TEST — DESIGNER'S CALL). No "test mode" banners. Real payments visible. Test transactions no longer shown. |
| SWITCHING_TEST_TO_LIVE (first time only) | Confirmation modal opens (see below). Toggle action is suspended until merchant confirms or cancels. |
| SWITCHING_LIVE_TO_TEST | Instant, no confirmation needed. Financial risk is zero when reverting to test. Returns to TEST_ACTIVE state. |

**"Go Live" confirmation modal — required states:**

| State | What the modal shows |
|---|---|
| MODAL_OPEN | Title: "Switch to Live mode". Body: "Real payments will be processed. Make sure you have a live API key and a webhook URL configured." Checklist items (DESIGNER'S CALL on whether to auto-detect completion): [ ] Live API key created, [ ] Webhook URL configured. CTAs: "Switch to Live" (primary, destructive intent) / "Cancel". |
| SWITCHING | "Switch to Live" button shows spinner. Modal stays open. |
| SWITCH_SUCCESS | Modal closes. Dashboard switches to LIVE_ACTIVE. |
| SWITCH_ERROR | Inline error in modal: "Unable to switch modes. Try again." |

---

## Artifacts generated by this surface

### Webhook payload (delivered by Tab server to merchant on every settlement)

This is not a screen but a data artifact the merchant's server receives. Its shape is
DECIDED by R-TAB-3 and `TransactionResult` fields from the Particle UA SDK.

```json
{
  "transactionId": "<string — from TransactionResult.transactionId>",
  "tokenChanges": [
    {
      "token": "<USDC or USDT contract address on Arbitrum One>",
      "chainId": 42161,
      "amount": "<string — credited amount in token units>",
      "receiver": "<merchant's wallet address>"
    }
  ]
}
```

Source: R-TAB-3 ("body containing `transactionId` and `tokenChanges`, sourced from the
`TransactionResult` returned by `ua.sendTransaction`"), AC-TAB-4 ("tokenChanges in the
webhook body reflects the credited amount at the merchant's Arbitrum One address").

Note: The exact shape of `tokenChanges` is determined by the Particle UA SDK's
`TransactionResult` type. The designer should leave the exact sub-fields as placeholders
(`amount`, `token`, `chainId`, `receiver`) subject to verification against the live SDK
response. Source: `.thoughts/specs/2026-07-02-tab-leash.md §R-TAB-3`.

### `onSuccess` callback payload (fires in buyer's browser)

Also delivered to the merchant's client-side code. Identical data to the webhook:
`onSuccess(transactionId, tokenChanges)`. Source: R-TAB-1 ("`onSuccess(transactionId,
tokenChanges)` as props"), Story 1 AC from R-TAB-3 ("The `onSuccess` callback fires in
the buyer's browser with the same `transactionId` and `tokenChanges` values").

Note: The webhook is the canonical fulfillment signal. The `onSuccess` callback may not
fire if the buyer closes the tab immediately after payment. Merchants must not rely on it
for order fulfillment. Source: Story 1 Notes ("The fulfillment trigger is the webhook POST,
not the `onSuccess` callback").

---

## Copy and vocabulary rules for this surface

These rules apply ONLY to the merchant / developer surface. The buyer surface has its own
stricter vocabulary restrictions (R-TAB-9: no "chain", "gas", "bridge", "Arbitrum", "EOA",
"wallet address", "sign", "EIP", "USDC" in buyer-facing strings). The merchant surface CAN
and SHOULD use developer-accurate language.

### Terms that are DECIDED

| Term | Use | Source |
|---|---|---|
| `transactionId` | Canonical identifier for a settled payment. Always shown as returned by `ua.sendTransaction`. Never called "order ID", "payment ID", or "hash" on this surface. | R-TAB-3, Particle UA SDK |
| `tokenChanges` | Settlement proof field from `TransactionResult`. Use the exact key name in documentation, webhook payload displays, and developer-facing labels. | R-TAB-3, Particle UA SDK |
| "Arbitrum One" | The settlement chain. Always show this name (not "Arbitrum", not "chainId 42161", not "L2") when showing settlement chain on the merchant dashboard. ChainId 42161 can appear in code blocks. | R-TAB-2 |
| "Test mode" / "Live mode" | Mode names. Do NOT use "sandbox" / "production". Source: LemonSqueezy and Stripe both use "test" / "live" language. | UX research §D |
| "Webhook delivery" | Not "webhook call", "webhook notification", or "webhook ping". "Delivery" connotes reliable transport with retry semantics. | UX research §D (Stripe Workbench "Webhooks" tab uses "delivery" language) |
| "API key" | Two types shown: "Publishable key" (safe for browser code) and "Secret key" (server-only). Source: Stripe pattern. | UX research §D |
| "Settled" | Status label for a completed, on-chain-confirmed payment. Not "Confirmed", "Complete", or "Processed". | R-TAB-3 (settlement is the merchant's signal) |
| "Install" | Step 1 quickstart title. Imperative verb, no "Step 1:". | UX research §D (Resend step titles: "Install" / "Set your API key") |

### Copy tone rules

- Imperative verb phrases for step titles: "Install", "Create your intent endpoint", "Add the PayButton". Never: "Step 1: Installation Process". Source: UX research §D (Resend + Clerk pattern).
- Error copy attributes failure to the system, not the developer. "Unable to load API keys. Try refreshing." Not "Your API keys failed to load." Source: UX research §B (passkey failure: "Face ID unavailable" — never "You failed").
- API key reveal warning uses exact industry-standard phrasing: "For security reasons, you can only view this key once." Source: UX research §D (Resend modal warning verbatim).
- Settlement confirmation copy is fiat-first: "$5.00 received" before "5.00 USDC". Source: UX research §A ("dual-currency display format: fiat first, larger; crypto secondary").
- "Test mode" banner copy is non-alarming: "You are in test mode. Test payments are simulated and do not move real funds." Not "WARNING: TEST MODE ACTIVE".
- Webhook retry note is informational, not alarming: "Tab retries failed deliveries up to [N] times with exponential backoff." Not "FAILED WEBHOOK — ATTENTION REQUIRED".

---

## Decided vs designer's call

### DECIDED — anchored to spec, story, or verified research pattern

| Item | Anchor |
|---|---|
| `<PayButton>` is the sole integration artifact for the merchant's checkout page | R-TAB-1 ("merchant drops in a single `<PayButton>` component") |
| `<PayButton>` accepts `intentUrl` and `onSuccess(transactionId, tokenChanges)` as its props | R-TAB-1 |
| Intent endpoint returns `{ amount, receiver, token: { chainId: 42161, address: TOKEN }, currency }` | R-TAB-2 |
| Settlement chain is Arbitrum One (chainId 42161) — fixed, merchant cannot change | R-TAB-2 |
| Webhook payload contains `{ transactionId, tokenChanges }` — these exact field names | R-TAB-3 |
| Webhook fires on settlement; it is the canonical fulfillment trigger, not `onSuccess` | R-TAB-3, Story 1 Notes |
| API key value is shown exactly once on creation and is never retrievable thereafter for merchant-created secret keys | UX research §D (Resend + Stripe convergence) |
| API key reveal modal copy: "For security reasons, you can only view this key once." | UX research §D (Resend verbatim) |
| Test mode is the default state for all new integrations | UX research §D ("all products start developers in test mode by default") |
| Test/live mode toggle exists and is a persistent dashboard control | UX research §D (LemonSqueezy, Stripe, Clerk — universal pattern) |
| Mode switch from live to test requires no confirmation; test to live requires confirmation | UX research §D (Stripe pattern: switching to live is a deliberate action) |
| Quickstart steps: numbered, each has exactly one action and one code block, imperative short title | UX research §D (Resend + Stripe + Clerk convergence) |
| Transaction row must show: `transactionId`, amount ($-denominated), `tokenChanges` summary, chain, timestamp, webhook delivery status | R-TAB-3, AC-TAB-4 |
| Transaction detail shows `transactionId` (full, copyable), block explorer link (Arbiscan), webhook delivery status | R-TAB-3, AC-TAB-4, UX research §C (settled receipt row: "txHash (links to block explorer)") |
| Demo checkout page: PayButton state machine has states IDLE → AUTH_OPEN → PROCESSING → SUCCESS → ERROR | R-TAB-10 |
| IDLE state copy: "Pay $X.XX" + lock icon | R-TAB-10, UX research §A button-state table |
| PROCESSING state: button disabled + spinner + "Processing…" | R-TAB-10, UX research §A |
| SUCCESS state: animated checkmark, label morphs | R-TAB-8, R-TAB-10, AC-TAB-3 |
| SUCCESS fires on `sendTransaction` return — not after polling or block confirmations | R-TAB-8 ("optimistic instant-success"), AC-TAB-3 |
| ERROR state: inline message, entered state preserved, retry in place | R-TAB-10, UX research §A |
| Amount is server-authoritative (set by intent endpoint); buyer cannot modify | R-TAB-2, Story 1 Scenario 2 |
| Fiat amount is the primary display; token amount is secondary | UX research §A ("dual-currency: fiat first, larger; crypto secondary") |
| Publishable key is safe for client code; secret key is server-only | UX research §D (Stripe publishable key callout) |
| Block explorer links point to Arbiscan (Arbitrum One explorer) | AC-TAB-4 references Arbitrum One settlement; UX research §C ("txHash links to block explorer") |
| Webhook delivery log rows show: timestamp, HTTP status returned, status label, associated `transactionId` | R-TAB-3, UX research §D (Stripe Workbench Webhooks tab) |

### DESIGNER'S CALL — layout, visual treatment, or unspecified in the spec

| Item | Notes |
|---|---|
| Dashboard navigation structure (sidebar / top nav / tabs) | No spec guidance. Designer decides. |
| Visual differentiation of TEST vs LIVE mode (colors, badge styles, banner placement) | Spec says toggle exists; visual treatment is the designer's decision. LemonSqueezy uses "bottom-left toggle" but position is DESIGNER'S CALL here. |
| Whether transaction detail is a side panel, slide-over, modal, or separate page | Not specified. DESIGNER'S CALL on container. |
| Whether `tokenChanges` is shown as formatted JSON, structured field rows, or collapsed "View details" | Not specified. DESIGNER'S CALL. |
| Whether quickstart includes auto-detected step completion (real-time event detection) | Requires polling or webhook; adds complexity. DESIGNER'S CALL. Simpler: manual checkbox. |
| Whether "Go Live" confirmation modal includes a pre-flight checklist | Not specified. DESIGNER'S CALL. |
| Whether webhook has HMAC signing secret | Not in spec. Stripe-standard DX best practice. OPEN QUESTION — requires engineering decision before designer can include the "signing secret shown once" pattern. |
| Retry policy (number of attempts, backoff) and associated copy | Story 1 OQ-2 explicitly unresolved. Designer leaves `[N]` placeholder. |
| Whether manual "Resend" is available in the webhook delivery log | Not specified. DESIGNER'S CALL / engineering decision. |
| Whether "Payer type" (Human vs Agent) column appears in transactions list | Depends on R-RAIL-2 (stretch). DESIGNER'S CALL pending stretch-vs-MVP decision. |
| Key rotation UX (warn merchant that old key is immediately invalidated?) | Not specified. DESIGNER'S CALL. |
| Whether API key permissions model is "Sending access" / "Full access" or a different taxonomy | Resend's model cited as a reference; whether Tab adopts it verbatim is DESIGNER'S CALL / engineering decision. |
| Demo checkout page: is it a hosted URL the merchant links to, or embedded in the dashboard? | Not specified. DESIGNER'S CALL. Separate URL is simpler for the hackathon demo. |
| Transaction list: infinite scroll vs. pagination | Not specified. DESIGNER'S CALL. |
| Quickstart step count and exact step titles | Step 1 (Install), Step 3 (PayButton), Step 4 (webhook) are anchored to spec. Exact titles and step count: DESIGNER'S CALL. |
| Whether a "Send test webhook" button exists (sends a synthetic payload to the configured URL) | Not specified. Common DX pattern (Stripe has it). DESIGNER'S CALL. |

---

## Open questions (from surface mapping)

These are gaps or ambiguities that require a product or engineering decision before the
designer can fully resolve the screen. Different from "DESIGNER'S CALL" items above, which
the designer can decide independently.

1. **OQ-SURFACE-1 — Exact npm package name for `packages/sdk`.** Story 1 OQ-3. The quickstart
   "Install" step code block needs the actual install command (e.g. `npm install @tab/sdk`).
   Affects copy in Screen 2 and any docs. Required before designer can finalize code blocks.

2. **OQ-SURFACE-2 — Exact token address on Arbitrum One (USDC vs USDT).** Spec OQ-4. Affects
   the intent endpoint code block on Screen 2 (`token.address` placeholder) and the token
   amount display format on Screens 4 and 6 ("X.XX USDC" vs "X.XX USDT").

3. **OQ-SURFACE-3 — Does Tab implement webhook HMAC signing?** Not mentioned in spec or story.
   If yes: a signing secret must be created and shown once (same one-time-view pattern as API
   keys). If no: webhook security note is omitted from Screen 5. Engineering must decide before
   Screen 5 can be finalized.

4. **OQ-SURFACE-4 — Webhook retry policy (count + backoff).** Story 1 OQ-2. Affects Screen 5
   retry policy note and Screen 6 "Attempt N of M" row label. Designer leaves placeholder `[N]`.

5. **OQ-SURFACE-5 — Merchant account / authentication.** The spec describes buyer auth (Magic
   OTP) in detail but does not address how the merchant authenticates to the Tab dashboard.
   Whether merchants have accounts, how they sign up, and how they log in is entirely
   unspecified. This affects what comes BEFORE Screen 2 (the entry point to the dashboard).
   Required before a complete screen inventory can be drawn.

6. **OQ-SURFACE-6 — Is the demo checkout page (Screen 1) a separate hosted URL or a route
   within the dashboard?** For the hackathon demo, a separate hosted URL at e.g.
   `/demo-merchant` is simpler. For a production product, it would be an embeddable component
   in the merchant's own site. The designer needs this resolved to know whether to include a
   dashboard "Demo" screen or only document the standalone page.

7. **OQ-SURFACE-7 — Intent `amount` field format.** R-TAB-2 states the intent endpoint returns
   `amount` but does not specify whether it is a string ("5.00"), a number (5.00), or a
   BigInt in atomic units (5000000 for 6-decimal USDC). The quickstart code block and
   transaction row amount display depend on the resolved format.
