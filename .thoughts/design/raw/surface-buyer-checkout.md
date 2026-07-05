# Surface: Tab buyer checkout — `<PayButton>` + checkout modal

> Designer handoff. Surface map for the buyer-facing payment flow: from the `<PayButton>` embedded in a merchant page through email OTP authentication, checkout confirmation, and optimistic success. Produced from: spec R-TAB-4..R-TAB-10, AC-TAB-1/2/3/5/6; Story 2 (buyer pays by email); Story 8 (flagship cross-chain op); UX reality research §A (checkout) and §B (wallet onboarding).

---

## Who this surface serves

**The buyer.** No crypto knowledge. No wallet extension. May hold ETH on Base, USDC on Polygon, or assets on any supported chain — does not know or care. Their only inputs are an email address and a 6-digit code. From button click to success, no word describing blockchain infrastructure appears in any copy, tooltip, error, or loading state.

---

## How this surface is owned: Tab vs. Magic SDK

Two distinct rendering authorities produce the buyer-facing UI on this surface:

- **Tab renders:** the `<PayButton>` component in the merchant page; the checkout confirmation panel (balance + confirm CTA); the success receipt panel; the error / retry panel.
- **Magic SDK renders:** the email entry screen and the 6-box OTP screen, via `magic.auth.loginWithEmailOTP({ showUI: true })`. Tab does NOT build a custom OTP screen. Magic's pre-built modal is the auth surface. (R-TAB-4, AC-TAB-6)

This distinction is load-bearing for the designer: the OTP screens are Magic's component and cannot be redesigned without forking or replacing the SDK. The designer can influence how the modal container hosting Magic's UI is framed (backdrop, z-index, surrounding chrome) but not the 6-box field itself.

---

## Button state machine

The `<PayButton>` drives the entire flow as a state machine. Every state change is a product requirement — not a visual suggestion. (R-TAB-10, UX research §A button-state sequence table)

| State | Trigger | Button is | What the buyer sees |
|---|---|---|---|
| IDLE | Page load; or after ERROR reset | Enabled | "Pay $X.XX" + lock icon |
| LOADING | Button clicked | Disabled | Spinner; label suppressed or replaced |
| AUTH | Magic SDK modal opens | Disabled (modal has focus) | Magic email + OTP overlay; button behind modal |
| PROCESSING | OTP resolves; buyer confirms in checkout panel | Disabled | "Processing…" or spinner; prevents double-submit |
| SUCCESS | `ua.sendTransaction` returns a `transactionId` | Morphed | Animated checkmark; label → "Done" or merchant-configured label |
| ERROR | Any failure between LOADING and SUCCESS | Enabled (retry) | Inline error message; entered data preserved |

**The button MUST be disabled in LOADING and PROCESSING.** A tap in either state is a no-op. (Story 2, R-TAB-10)

**SUCCESS fires the instant `sendTransaction` returns** — not after any polling interval, not after block confirmations. Zero additional wait between the call resolving and the success state appearing. (R-TAB-8, AC-TAB-3)

---

## Screen inventory

### Screen 1: `<PayButton>` — embedded in merchant page

**Purpose.** The merchant drops this single component into their page. It is the buyer's entry point: shows the price, conveys trust (lock icon), initiates the entire payment flow on click, and surfaces the terminal states (success, error) back into the merchant page context when the modal is dismissed or the flow completes.

**Entered from.** Merchant page on load (IDLE state). Terminal states return here after the full flow.

**States.**

- `IDLE` — enabled button showing "Pay $X.XX" with lock icon. No crypto framing. (R-TAB-10)
- `LOADING` — button clicked, disabled, spinner shown. Magic SDK initializing or payment intent being fetched. No interim screen shown to the buyer. (R-TAB-10)
- `AUTH` — Magic OTP modal is open. Button is disabled behind the modal. This state persists until OTP resolves or the buyer dismisses. (R-TAB-10)
- `PROCESSING` — OTP complete, buyer has confirmed in the checkout panel, `sendTransaction` in flight. Button disabled. "Processing…" label or spinner. (R-TAB-10)
- `SUCCESS` — `sendTransaction` returned a `transactionId`. Animated checkmark. Label morphs to "Done" or merchant-configured string. (R-TAB-8, R-TAB-10, UX research §A inference 3)
- `ERROR` — any failure (network, insufficient balance, transaction rejected). Inline error message. Button re-enabled. Buyer data preserved. (R-TAB-10, Story 2 edge case: sendTransaction error)
- `DISABLED_INSUFFICIENT_FUNDS` — checkout panel detected balance below amount. Button disabled with "insufficient funds" state. No crypto vocabulary in the label. (Story 2 edge case: balance below amount)

**Exact on-screen data shown (IDLE state).**
- Payment amount: USD-formatted string, e.g. `$12.00`. Set server-side from the merchant's payment-intent endpoint. Immutable — the buyer cannot modify it. (R-TAB-2)
- Lock icon: small trust-signal glyph adjacent to the amount.
- Merchant context (from the merchant page, not from Tab): merchant name, merchant logo. These are part of the merchant's page layout, not the `<PayButton>` component itself.

**Exact on-screen data shown (ERROR state).**
- Error message: human-friendly, one sentence. No crypto vocabulary. No "transaction", "chain", "gas", "wallet", "sign", or "EIP". Examples of permissible phrasing: "Payment didn't go through", "Something went wrong — please try again". (R-TAB-9, AC-TAB-1)
- Retry CTA: re-enables the button in place. No page reload. (R-TAB-10, Story 2)

**Traces to.** R-TAB-1, R-TAB-10, AC-TAB-1, AC-TAB-3. Story 2 (all scenarios).

---

### Screen 2: Magic email entry screen (AUTH phase — Magic SDK renders)

**Purpose.** The buyer enters their email address to begin the OTP authentication flow. This is the entry point into the Magic embedded wallet auth loop. Tab does not build this screen; it is rendered by `magic.auth.loginWithEmailOTP({ showUI: true })`. The buyer does not leave the merchant page. (R-TAB-4, AC-TAB-6)

**Entered from.** `<PayButton>` entering LOADING → AUTH state (button clicked).

**States.**

- `EMAIL_ENTRY` — Input field active. CTA disabled until a valid email is typed. (UX research §B: "primary button stays disabled until valid input is entered")
- `EMAIL_SUBMITTING` — CTA clicked; email field locked; spinner shown; OTP dispatch in progress. (UX research §B: "OTP sending state — primary button disabled, spinner shown, email field locked")
- `BACK_AVAILABLE` — Back arrow top-left is present at all times within the Magic modal; buyer can exit the auth flow. If they exit, the `<PayButton>` returns to IDLE (or ERROR, depending on Tab's handling of the dismissal).

**Exact on-screen data shown.**
- Email input field (placeholder pattern from UX research: "your@email.com" or "Enter your email").
- CTA button (disabled until input; label is Magic's — approximately "Submit" or "Continue").
- No payment amount is shown on this screen. The buyer already saw the amount on the button before clicking.
- Attribution footer: "Protected by Magic" or equivalent Magic SDK attribution.

**DECIDED:** Magic SDK controls all copy on this screen. Tab cannot override the field label or button text without replacing the SDK.

**Traces to.** R-TAB-4, AC-TAB-6. UX research §B (entry screen pattern, email field states).

---

### Screen 3: Magic 6-box OTP screen (AUTH phase — Magic SDK renders)

**Purpose.** The buyer enters the 6-digit code they received by email. This screen is the de facto standard for embedded wallet authentication. (UX research §B: "6-box OTP with auto-submit is de facto standard") Tab does not build this screen.

**Entered from.** Screen 2 (email submitted successfully); OTP code dispatched to buyer's email.

**States.**

- `OTP_AWAITING_INPUT` — 6 boxes focused; blinking cursor in first empty box; auto-advance on each character. (UX research §B: "OTP awaiting input")
- `OTP_AUTO_SUBMITTING` — 6th digit entered; form submits automatically, no "Verify" button needed. Loading indicator shown. (R-TAB-4, UX research §B: "auto-submit on the 6th digit")
- `OTP_WRONG_CODE` — Magic SDK shows error state. Based on research patterns: boxes turn red and/or clear; optional error banner. Retry in place without navigating away. (UX research §B: wrong-code error; Privy = red + clear; Dynamic = red banner + red boxes)
- `OTP_EXPIRED` — Code has expired. Magic SDK shows expiry message. Best practice: "This code has expired. We've sent a new one." Resend should not count against rate limit. (UX research §B: OTP expiry)
- `OTP_RATE_LIMITED` — Too many attempts. Magic SDK shows rate-limit message. Copy pattern: "Too many attempts. Please wait [N] minutes before requesting a new code." (UX research §B: OTP rate-limited)
- `OTP_NOT_RECEIVED` — Resend link below the 6 boxes. After resend: link enters countdown state (~30s). (UX research §B: "Resend code" link)
- `RETURNING_USER_SKIP` — If the buyer has a valid Magic session (same device, session not expired), the OTP step is skipped entirely. Button transitions LOADING → AUTH → immediately resolves to checkout panel without showing Screens 2 or 3. (Story 2: "returning buyer" edge case — "AUTH / OTP step is skipped (session reused)")

**Exact on-screen data shown.**
- Back arrow (top-left): always present; exits the auth flow.
- Centered envelope icon: animation during "sending" state (UX research §B: "animated loading arc under envelope icon" — Dynamic pattern).
- Header: Magic's copy ("Enter confirmation code" or similar).
- Body sentence with buyer's email (either full email bolded, or masked/truncated — Magic's implementation choice).
- 6 separate single-character input boxes.
- "Resend code" accent link below boxes.
- Attribution footer (Magic SDK).

**No payment data on this screen.** Amount and merchant are not repeated here.

**DECIDED:** Structure, field count, and auto-submit behavior are fixed by industry convergence and the Magic SDK. (UX research §B: "structure is identical" across Privy + Dynamic independently converging)

**Traces to.** R-TAB-4, AC-TAB-6. UX research §B (OTP screen anatomy, wrong-code error, rate-limiting, resend pattern). Story 2 (returning-user edge case, wrong-code edge case).

---

### Screen 4: Checkout confirmation panel (post-auth — Tab builds)

**Purpose.** After the buyer authenticates, Tab reads their unified cross-chain balance and presents a single confirmation screen: here is what you owe, here is what you have, here is the button to pay. This is the moment just before money moves. The buyer's only action here is confirming the payment.

**Entered from.** Screen 3 OTP resolves (or Screen 2 in returning-user skip case). `<PayButton>` is in AUTH state. This panel is shown while the UA is initializing and `getPrimaryAssets()` is being fetched.

**States.**

- `BALANCE_LOADING` — Panel visible; balance field shows a loading indicator (skeleton or spinner) while `ua.getPrimaryAssets()` resolves. CTA disabled during load. (R-TAB-6; UX research §A: "LOADING — skeleton screens … layout preserved")
- `BALANCE_READY` — Balance loaded. CTA ("Pay $X.XX" or "Confirm") enabled. Buyer can proceed. (R-TAB-6)
- `INSUFFICIENT_BALANCE` — `totalAmountInUSD` from `getPrimaryAssets()` is less than the payment amount. CTA disabled or replaced with "insufficient funds" label. No chain breakdown shown. No mention of which chain has what. (Story 2 edge case: "balance shown is below the required amount / no chain or token breakdown shown to explain why")
- `CONFIRMING` — Buyer tapped CTA. Button in this panel disabled. `<PayButton>` transitions AUTH → PROCESSING. (R-TAB-10)

**Exact on-screen data shown.**

| Field | Value source | Notes |
|---|---|---|
| Payment amount | Intent endpoint `amount` field (server-set, immutable) | USD-formatted. e.g. "$12.00". Never changeable by buyer. |
| Merchant name | Intent endpoint (or merchant SDK config) | Plain string. |
| Merchant logo | Intent endpoint or SDK config (optional) | If not provided: merchant name only. |
| Unified balance | `ua.getPrimaryAssets().totalAmountInUSD` | Single USD number. e.g. "$847.32 available". No per-chain breakdown. No token names. No network names. (R-TAB-6) |
| CTA label | Spec-defined | "Pay $X.XX" (mirrors IDLE button label) or "Confirm". |

**What is NOT shown (hard rule, R-TAB-9, AC-TAB-1):**
- No chain names ("Base", "Polygon", "Arbitrum", "Ethereum")
- No token symbols beyond merchant-opted-in currency unit (if merchant did not opt in to showing "USDC", it does not appear)
- No gas or fee display
- No wallet address
- No "sign" / "authorize" language
- No network selector
- No bridge references

**Traces to.** R-TAB-5, R-TAB-6, R-TAB-9, R-TAB-10, AC-TAB-1, AC-TAB-6. Story 2 (happy path, insufficient-balance edge case). UX research §A (Google Pay rule: total price visible before payment sheet invoked; §B vocabulary pattern).

---

### Screen 5: Optimistic success panel (post-sendTransaction — Tab builds)

**Purpose.** The payment is complete from the buyer's perspective. This panel fires the instant `ua.sendTransaction` returns a `transactionId` — not after block finality, not after any polling. The buyer sees a resolved, celebratory state while the chain settles silently in the background. (R-TAB-8, AC-TAB-3)

**Entered from.** Screen 4 CONFIRMING state, when `sendTransaction` resolves with a non-null `transactionId`. `<PayButton>` enters SUCCESS state simultaneously.

**States.**

- `OPTIMISTIC_SUCCESS` — Animated checkmark displayed. Full success copy visible. This is the only state of this panel. There is no "waiting for confirmation" sub-state visible to the buyer. Settlement continues in the background while this state is shown. (R-TAB-8, AC-TAB-3, UX research §A crypto-specific 3-state model "fires immediately on tx detection, NOT after confirmations"; Daimo `payment_started` pattern; inference 2)

**Exact on-screen data shown.**

| Field | Value source | Notes |
|---|---|---|
| Animated checkmark | Tab-rendered animation | Required by R-TAB-8 and button-state spec. |
| Success heading | Tab copy | Examples: "Payment complete", "You're all set". No crypto vocabulary. (UX research §A success screen anatomy) |
| Amount paid | Intent endpoint `amount` | "$X.XX". Confirms what moved. |
| Merchant name | Intent endpoint / SDK config | Confirms who received it. |
| Transaction reference | `TransactionResult.transactionId` from `sendTransaction` | String. Shown as a reference number. NOT labeled "transaction hash", "txHash", or "blockchain ID". Human label: "Reference", "Confirmation #", or "Order reference". (AC-TAB-3, AC-TAB-5) |
| Confirmation note | Tab copy | Optional. "A confirmation has been sent to [email]" (above fold — Baymard: users will not close the success page until they see this). UX research §A success screen anatomy. |

**What is NOT shown:**
- No "waiting for block confirmations" message
- No countdown
- No chain/network name
- No raw transaction hash displayed as a hex string (the transactionId is a product reference — the label hides its technical nature)
- No link to a block explorer in the buyer-facing flow (this is for judges/developers, not the buyer)

**Traces to.** R-TAB-8, R-TAB-9, R-TAB-10, AC-TAB-1, AC-TAB-3, AC-TAB-5. Story 2 (happy path success). UX research §A (success screen anatomy, optimistic pattern, inference 2).

---

### Screen 6: Error / retry panel (Tab builds)

**Purpose.** Something went wrong between LOADING and SUCCESS. The buyer is not stranded: their entered email is preserved, the error is described in plain language, and a retry path is available in place (no page reload). (R-TAB-10, Story 2 error edge cases)

**Entered from.** Any of: LOADING (intent fetch failed), PROCESSING (sendTransaction threw or returned error), BALANCE_LOADING (getPrimaryAssets failed). `<PayButton>` enters ERROR state.

**States.**

- `INSUFFICIENT_BALANCE_ERROR` — Detected at Screen 4 (INSUFFICIENT_BALANCE state). Permanent until the buyer funds their account elsewhere and re-tries. No crypto vocabulary in the message. (Story 2 edge case)
- `TRANSACTION_FAILED` — `sendTransaction` rejected or threw. Buyer has not been charged. Retry available. (Story 2: "sendTransaction returns an error")
- `NETWORK_ERROR` — Network connectivity failure during any async call. Retry available.
- `MAGIC_AUTH_FAILED` — OTP validation failed permanently (rate limited, session expired) and Tab received an error from the Magic SDK. Retry the auth from the email step. (OTP wrong-code is handled by Magic's own screen; this state is for terminal auth failures passed back to Tab)

**Exact on-screen data shown.**

| Field | Notes |
|---|---|
| Error message | One sentence, human-friendly, no crypto vocab. Blame the situation, not the user. Pattern: "Payment didn't go through" / "Something went wrong — please try again" / "You don't have enough to complete this payment". (R-TAB-9; UX research §A: "The payment didn't go through, and you haven't been charged" — Stripe pattern) |
| Preserved email | Buyer's email shown or pre-filled so they do not need to re-enter it on retry. (R-TAB-10: "entered data preserved") |
| Retry CTA | Re-enables in place. Label: "Try again". No page reload. (R-TAB-10) |
| Support escape | Optional. "Need help? Contact us" link (subdued). UX research §A: "Still having trouble? Our team can help". |

**What is NOT shown:**
- No technical error codes
- No chain or gas vocabulary
- No blockchain error messages (e.g. "insufficient gas", "nonce too low", "revert") — these are translated to plain language before display
- No stack traces

**Traces to.** R-TAB-9, R-TAB-10, AC-TAB-1. Story 2 (wrong-code, sendTransaction-error, insufficient-balance edge cases). UX research §A (Stripe form failure pattern; "data preserved"; inline error).

---

## Artifacts / receipts generated by this surface

**What Tab emits after a successful payment that the buyer may see or that the merchant uses:**

| Artifact | Destination | Fields |
|---|---|---|
| Optimistic success panel (Screen 5) | Buyer, in-modal | amount, merchantName, transactionId (shown as reference #) |
| Webhook POST to merchant | Merchant's server | `transactionId`, `tokenChanges` (from `TransactionResult`) — NOT buyer-facing |
| `onSuccess(transactionId, tokenChanges)` callback | Merchant's JS | Merchant can use this to update their page (e.g. redirect to order confirmation) — NOT buyer-facing directly |

The buyer does NOT see `tokenChanges` — that is for the merchant's fulfillment logic. The buyer sees only the success panel's reference number.

---

## Copy and vocabulary rules — this surface only

**Absolutely banned words in any buyer-facing string (error messages, loading copy, tooltips, labels, modal headers, success copy):** (R-TAB-9, AC-TAB-1)

- chain
- gas
- bridge
- Arbitrum
- EOA
- wallet address (the word "wallet" should be avoided; the account is never surfaced as a "wallet" to the buyer)
- sign / signing / authorize / authorization
- EIP
- token (avoid in product copy; use "funds", "balance", or the currency unit)
- USDC / USDT — only if the merchant has explicitly opted in to showing the currency unit

**Permissible framings:**

| Concept | Permissible copy |
|---|---|
| The buyer's funds available | "Your balance", "$X.XX available" |
| The payment | "Pay $X.XX", "Confirm payment", "Payment complete" |
| Auth / login | Magic SDK handles this; no Tab copy needed |
| Success | "Payment complete", "You're all set", "Done" |
| Error (generic) | "Payment didn't go through", "Something went wrong — please try again" |
| Error (insufficient) | "You don't have enough to complete this payment" |
| Error (network) | "Couldn't connect — please try again" |
| Transaction reference | "Reference #", "Confirmation #" — not "txHash", "transaction ID", "blockchain reference" |
| Amount | USD-first, "$X.XX" format — never "X USDC" unless merchant opted in |

**Tone:** Stripe-analogous: clear, brief, never apologetic-plus-technical ("Your transaction was rejected due to an EIP-3009 signature failure" is a spec violation as much as a UX failure).

**Loading copy:** functional and calm. "Processing your payment" (not "Sending to blockchain", not "Bridging your assets"). Can omit label entirely and use a spinner if space is constrained.

---

## Decided vs. designer's call

### DECIDED — in spec, stories, or research (designer inherits, cannot override)

| Decision | Source |
|---|---|
| 6-box OTP with auto-submit on 6th digit is the auth UI | R-TAB-4, AC-TAB-6, UX research §B |
| Magic SDK renders the email + OTP screens; Tab does not build a custom OTP screen | R-TAB-4, AC-TAB-6 |
| Single unified USD balance — no per-chain breakdown, no token names | R-TAB-6 |
| Optimistic success fires on `sendTransaction` return, no block-confirmation wait | R-TAB-8, AC-TAB-3 |
| Zero crypto vocabulary in any buyer-facing string (full banned list above) | R-TAB-9, AC-TAB-1 |
| Button state machine: IDLE → LOADING → AUTH → PROCESSING → SUCCESS → ERROR (in that order) | R-TAB-10 |
| Button disabled in LOADING and PROCESSING (double-submit prevention) | R-TAB-10, Story 2 |
| IDLE button shows "Pay $X.XX" + lock icon | R-TAB-10, UX research §A |
| SUCCESS shows animated checkmark + label morph to "Done" or merchant-configured | R-TAB-10, UX research §A inference 3 |
| ERROR: inline message, data preserved, retry in place (no page reload) | R-TAB-10, Story 2 |
| Amount is set server-side by the merchant; the buyer cannot modify it | R-TAB-2 |
| No "your wallet is ready" screen after auth returns | AC-TAB-6, UX research §B wallet provision pattern |
| Returning buyer with valid session skips OTP entirely | Story 2 returning-buyer scenario |
| transactionId from `sendTransaction` is shown in success as a buyer-facing reference | AC-TAB-3, AC-TAB-5 |
| Error messages use no crypto or technical vocabulary | R-TAB-9, AC-TAB-1 |
| Modal is self-contained in merchant page — no redirect, no new tab | R-TAB-4, AC-TAB-6 |

### DESIGNER'S CALL — not constrained by spec

| Decision | Notes |
|---|---|
| Modal vs drawer vs inline overlay layout | The spec says "checkout modal"; the visual container type is not prescribed |
| Whether Magic SDK OTP modal shares the same modal container as Tab's checkout panel, or appears as a nested / sequential layer | Functionally they are different rendering authorities; how they are visually contained is a composition question |
| Exact position of the checkout panel relative to the `<PayButton>` (popover, centered overlay, bottom sheet on mobile) | |
| Merchant logo placement in the checkout panel header | |
| Visual treatment of the 6 OTP boxes (border style, spacing, focus ring) — within whatever degree Magic SDK allows CSS customization | |
| Animation timing and style of the animated checkmark | Direction: animated; exact duration, easing, and type (lottie, CSS, SVG) are designer choices |
| Whether the payment amount appears in the modal header as well as the CTA | |
| The exact label for the CTA in Screen 4: "Pay $X.XX" vs "Confirm" vs "Pay now" | Spec says CTA is "Pay $X.XX" or "Confirm"; exact verb is designer/PM call |
| Whether the success panel auto-dismisses after N seconds or requires explicit close | |
| Whether an email confirmation note ("A confirmation has been sent to your email") is shown in the success panel | Recommended by Baymard research; not required by spec |
| Merchant branding extent in the modal (how prominently the logo/name appears vs Tab branding) | |
| Color and iconography treatment of states (error red, success green, etc.) | |
| Mobile-responsive layout of the checkout panel and button | |
| Typography hierarchy within the modal | |
| Whether the "insufficient funds" state shows the shortfall amount in plain language ("$3.50 short") or just a general "not enough" message | Story 2 open question 2 |
| Whether a "close" or "cancel" escape from the checkout panel (post-auth) returns to IDLE or ERROR | |

---

## Open questions (designer must not resolve unilaterally)

1. **Exact copy for the insufficient-balance error message.** The spec prohibits crypto vocabulary but does not define the exact string or whether the modal shows the USD shortfall amount. (Story 2 open question 2)

2. **UA V1 migration interstitial — buyer-visible?** If the buyer's account is on UA V1 and must withdraw before proceeding, an interruption may be required. No copy, placement, or UX for this interstitial is defined anywhere. If this state occurs, it must be designed. (Story 2 open question 3, Spec Constraint 10)

3. **Exact settlement token shown to buyer.** OQ-4 from spec: USDC vs USDT on Arbitrum is unconfirmed. This affects whether "USDC" appears in the balance display (if merchant opted in to showing the currency unit). (Spec OQ-4)

4. **Returning user visual gap.** When a buyer has a valid Magic session, the OTP step is skipped and the button transitions LOADING → checkout panel directly. What the buyer sees during that LOADING → checkout panel transition is unspecified — there is no interstitial "Welcome back" per spec, but the empty frame between LOADING and the balance appearing needs a visual treatment. (Story 2 returning-buyer scenario; UX research §B returning-user same-device: "silent re-auth via refresh token; no modal shown")

5. **Modal dismissal during PROCESSING.** If the buyer closes the modal while `sendTransaction` is in flight, the payment may complete or fail off-screen. What state the `<PayButton>` should show on return to the merchant page is not defined.

6. **`onSuccess` callback vs. in-modal success.** When the merchant's `onSuccess` prop fires (after `sendTransaction` returns), the merchant may redirect the page or show their own confirmation. If the page navigates away, the Tab success panel never renders. Whether Tab's success panel is the canonical success moment or a fallback to the merchant's own handling is not resolved in the spec.
