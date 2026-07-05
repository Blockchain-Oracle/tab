# UX Research — Seamless CHECKOUT / Pay-Flows (for "Tab", a Stripe-style pay button)

Reality-only catalog of how REAL shipping products do checkout UX. Facts verified from
source are marked [V]; my reading/synthesis is marked [INF]. Every product cited with URL.
Consumer of this doc = Abu's AI designer agent — it needs concrete, reproducible patterns
(exact button labels, screen sequences, state names, microcopy), not vibes.

Date: 2026-07-02

---

## 0. THE HEADLINE PATTERN (cross-product synthesis)

Every "seamless" pay button collapses the flow to: **one tap → authenticate/confirm →
optimistic "Processing…" → success screen with checkmark**. The winners HIDE settlement
reality. The laggards EXPOSE it (countdown timers, "confirmations remaining"). Tab should
copy the winners.

Two distinct "pending settlement" philosophies observed:
- **Optimistic / instant-success** (Apple Pay, Daimo Pay, Stripe): show success the moment
  the *user's* commitment is captured (card auth, or the single source transfer detected).
  Any downstream settlement (capture, bridge, swap) runs in the background, invisible.
- **Truthful / blockchain-exposed** (Coinbase Commerce hosted, generic crypto widgets):
  show a countdown + "waiting for payment / N confirmations" — feels slow, crypto-native.

---

## 1. STRIPE CHECKOUT (Stripe-hosted) — the reference "pay page"
URL: https://docs.stripe.com/payments/checkout/how-checkout-works
URL: https://docs.stripe.com/checkout/quickstart.md

[V] What it is: A prebuilt, Stripe-hosted payment page. You create a Checkout Session
server-side → redirect the customer to a stripe.com URL → they pay → Stripe redirects back.
Confirmation of completion arrives via webhook `checkout.session.completed`.

[V] Screen contents (single hosted page):
- Left/top: product name, product image, price. Example markup from the quickstart:
  `<h3>Stubborn Attachments</h3>` + `<h5>$20.00</h5>` with a cover image.
- Order summary: line items with quantities and amounts.
- Prebuilt payment form: 100+ payment methods, cards enabled by default; digital wallets
  (Apple Pay / Google Pay) and Link appear automatically when eligible.
- Optional shipping/billing address fields if configured.
- Responsive/mobile-optimized; card validation + error messaging built in.

[V] The Pay button label is set by `submit_type`:
- `pay` → "Pay" (default for payment mode)
- `donate` → "Donate"
- `book` → booking
- `subscribe` → subscription mode

[V] Success flow: after payment, Stripe redirects to `success_url` with
`?session_id={CHECKOUT_SESSION_ID}`. Quickstart's success page copy:
> "We appreciate your business! A confirmation email will be sent to {customerEmail}.
>  If you have any questions, please email orders@example.com."

[V] Cancel flow: redirect to `cancel_url`. Quickstart copy:
> "Forgot to add something to your cart? Shop around then come back to pay!"
> and JS-detected: "Order canceled -- continue to shop around and checkout when you're ready."

[V] Guest checkout by default (guest customers); `customer_creation:'always'` to persist.
Supports automatic tax, prefilled email (`customer_email`), returning customer prefill.

---

## 2. STRIPE PAYMENT ELEMENT (embedded, in-page) — the drop-in component
URL: https://docs.stripe.com/payments/payment-element
URL: https://stripe.com/payments/elements

[V] What it is: a single embeddable UI component that renders 100+ payment methods,
dynamically ordered by the customer's location, currency, and transaction amount.
Example: "if a customer in Germany is paying in EUR, they see all the active payment
methods that accept EUR, starting with ones that are widely used in Germany."

[V] Three layout options:
- `tabs` — payment methods laid out horizontally as tabs.
- accordion WITH radio buttons — vertical list with selection indicators.
- accordion WITHOUT radio buttons — vertical stack, extra spacing.

[V] Wallets: Apple Pay, Google Pay, and Link render inside the element (toggle via `wallets`).
Link's legal agreement cannot be removed (compliance).

[V] Validation & errors: validates input automatically; shows localized, customer-facing
error messages during confirmation for 17 decline codes, incl. `incorrect_cvc`,
`invalid_cvc`, `incorrect_number`, `incorrect_zip`, `expired_card`, `card_declined`,
`card_velocity_exceeded`, `insufficient_funds`, `fraudulent`, `stolen_card`, `lost_card`,
`processing_error`, `generic_decline`.

[V] Confirm: `checkout.confirm()` (Checkout Sessions, recommended) or `confirmPayment()`
with a `return_url` (Payment Intents / redirect flows, e.g. 3D Secure).

---

## 3. STRIPE'S OWN UX GUIDANCE (their resources / design articles)
URL: https://stripe.com/resources/more/payment-successful-pages
URL: https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions
URL: https://stripe.com/resources/more/credit-card-checkout-ui-design

[V] Multi-step progress: use a step tracker like "Shipping → Payment → Review" to make the
process feel finite; progress bar / numbered steps / page titles signal current stage.

[V] CTA hierarchy: primary button "Continue to Payment" or "Place Order" stands out in color
+ size; supporting links ("Return to Cart") visually subdued.

[V] Pay button: bold, action-forward "Pay now" or "Place order"; add a lock icon to signal
security. During payment: disable the button, show a spinner, OR switch label to "Processing…".
A spinner also prevents duplicate clicks / double-submits.

[V] Success page — Stripe's recommended anatomy:
- Heading: "Payment successful," "Thanks for your order," or "You're all set."
- Transaction details: order/transaction number, purchase date, product names, quantities,
  total amount — so customers can verify what was charged matches expectations.
- Payment-method confirmation: e.g. "Paid with Visa ending in 4242 — $129.00".
- Next steps microcopy: "You'll receive a shipping confirmation with tracking info in
  24–48 hours" / "A download link has been sent to your email" / "Your monthly subscription
  is now active and will renew on [date]".
- Optional engagement: "Share with a friend and get $10 off your next purchase" /
  "You earned 150 points with this purchase."
- Support access (contact / chat / FAQ).
- Visual cues: checkmark icons + small animations as "psychological cues that reinforce the
  validity of the transaction." Security/PCI DSS badges build trust.

[V] Error microcopy: flag inline right next to the field, be specific — "Please enter a
valid postal code" NOT "Invalid input". Self-contained labels: "Billing phone number" not
just "Phone". Never clear entered data on error.

---

## 4. APPLE PAY — the gold standard one-tap sheet
URL: https://developer.apple.com/design/human-interface-guidelines/apple-pay/
URL: https://developer.apple.com/apple-pay/planning/
URL: https://developer.apple.com/documentation/passkit/pkpaymentbuttontype
URL: https://www.checkout.com/docs/payments/add-payment-methods/apple-pay/web

[V] Button call-to-action labels (PKPaymentButtonType), pick the verb that matches the action:
Plain (mark only), Buy (default), Check Out, Book, Continue, Order, Pay, Subscribe, Donate,
Contribute, Reload, Rent, Set Up, Support, Tip, Add Money, Top Up.
- "Book" → trips/flights/experiences. "Check Out" → purchase flows alongside other
  "Check out" buttons. "Order" → meals/flowers. "Subscribe" → memberships. "Contribute" →
  causes/projects. "Donate" → approved nonprofits only.
[V] Styles: black, white, white-with-outline; corner radius customizable. Localized labels.

[V] Sheet timing rule: "The payment sheet must be presented immediately after the user taps
the Apple Pay button, without any interim screens or pop-ups except to prompt for necessary
product details, such as size or quantity." → NO intermediate config/loading screens.

[V] Sheet contents: user's name, billing address, shipping address, shipping method, phone,
email; configurable line items (shipping cost, taxes, discount). Guidance: "show only what's
necessary to process and service the transaction."

[V] States / motion:
- Authenticate: Face ID / Touch ID / passcode confirms purchase intent (merchant never sees
  card numbers).
- On result, merchant calls `complete(success)` → sheet shows a CHECKMARK, then auto-dismisses.
  Users see "Done" + checkmark = immediate visual confirmation.
- `complete(fail)` → sheet shows an EXCLAMATION POINT; customer is prompted to try again, or
  the sheet can be dismissed.
[INF] This is the archetypal "instant" moment: the checkmark animation IS the success state;
settlement/capture is entirely backgrounded and never surfaced to the user.

---

## 5. DAIMO PAY — one-click "any coin, any chain" crypto checkout (closest to Tab)
URL: https://paydocs.daimo.com/how-it-works  (redirects to https://docs.daimo.com/)
URL: https://github.com/daimo-eth/pay
URL: https://minipay.to/blog/minipay-daimo-crosschain-deposit
URL: https://paydocs.daimo.com/webhooks
URL: https://daimo.com/

[V] What it is: an SDK for instant transactions "from any coin, any chain, any wallet."
A single `DaimoPayButton` React component lets a user pay / deposit / make an arbitrary
contract call in ONE click from any chain. Accepts 1000+ tokens across 20+ chains; sources
include Solana, Tron, major EVMs, and centralized exchanges (Coinbase, Binance, etc.).
Everything settles as USDC on the merchant's single target chain.

[V] Complexity hiding — the core of the pitch:
- "Users never see fees while swaps, bridges, and gas are hidden for a clean checkout
  experience on both web and mobile."
- "Customers pay with a single transfer transaction, no more wallet round-trips to make
  approval, swap, or bridging transactions."
- The modal "handles chain selection, wallet connection, and transaction signing." One
  integration for web + mobile; embedded and overlay modes.
- Merchant only maintains a single chain + one currency; Daimo does the swap/bridge.

[V] Speed claims: "Payments complete in less than 5 seconds." Deposits: "Confirm — and your
funds arrive in seconds." "Most deposits arrive instantly, depending on network congestion."

[V] Deposit/checkout modal step sequence (from MiniPay walkthrough):
1. Open the flow / tap "Deposit" (or the pay button).
2. "Select whether you're adding from a wallet, exchange, or by paying to an address."
3. "Enter the amount, choose your source wallet and token."
4. "Confirm — and your funds arrive in seconds."
5. Notification confirmation once funds land.
   Source options shown as logos: Coinbase, Binance, Trust Wallet, Rainbow, MiniPay, Lemon, etc.

[V] Payment lifecycle states (webhook events) — the mechanism behind "instant":
- `payment_started` — fires when the user makes a VALID payment on the source. AFTER this,
  Daimo triggers the necessary bridging/swapping on-chain to fulfill the intent. Includes
  payer address, source tx hash, chain ID, amount, token symbol/address.
- `payment_completed` — fires when the DESTINATION-chain transaction is confirmed.
- `payment_bounced` — fires on error in the final destination tx; funds are refunded to the
  refund address set at payment creation.
- Note: event ordering is NOT guaranteed (payment_completed can arrive before payment_started).
[INF] KEY "instant" trick: the user's obligation ends at ONE signed source transfer
(payment_started). The modal can flip to success on source detection while bridge/swap/settle
(payment_completed) completes in the background — the "pending blockchain settlement" moment
is compressed to the sub-5s source-tx confirmation, and the multi-chain settlement is hidden.
[INF] The `DaimoPayButton` exposes an intent/CTA and destination props (toChain, toToken,
toAddress, appId) — but exact prop names/labels not fully verified from source here.

---

## 6. COINBASE COMMERCE (hosted) + ONCHAINKIT <Checkout> (embedded)
URL: https://commerce.coinbase.com/docs
URL: https://support.americommerce.com/hc/en-us/articles/4403054534555-Coinbase-Integration
URL: https://rossbulat.medium.com/accept-crypto-with-coinbase-commerce-intro-integration-guide-8fc4dc7df10f
URL: https://docs.base.org/builderkits/onchainkit/checkout/checkout

### 6a. Coinbase Commerce hosted page (the "truthful/blockchain-exposed" pattern)
[V] After checkout the customer is redirected to a Coinbase-hosted page
(commerce.coinbase.com/checkout/{id}); the payment process is then fully handled by Coinbase.
[V] Customer selects a payment currency → sees a wallet address OR a QR code.
[V] A 15-minute countdown: "After selecting your payment currency, you have 15 minutes to
complete the transaction" (locks the exchange rate window).
[V] States:
- Order = "Awaiting Payment", transaction = "Pending". A Transaction Code is generated but is
  NOT confirmation of payment — only that Coinbase received the request.
- Page updates in real time to show whether the tx is confirmed or still processing.
- Webhook events: `charge:created`, `charge:confirmed`, `charge:failed`.
[V] Slow reality exposed: some transactions can take up to 30 minutes to complete after
checkout; status updates can lag up to an hour depending on the coin/network.
[INF] This is the anti-pattern for "feels instant": it shows the raw blockchain wait.

### 6b. OnchainKit <Checkout> / <CheckoutButton> (embedded React component)
[V] Default button text: "Pay". During PENDING/FETCHING_DATA the button shows a loading
spinner (aria-label "Transaction in progress"). On SUCCESS the button becomes
"View payment details".
[V] LifecycleStatus states: `init`, `pending`, `fetchingData`, `success`, `error`. The
`onStatus` callback receives `{ statusName, statusData }`; on success `statusData` includes a
`chargeId` (verifiable against the Coinbase Commerce API).
[INF] So the embedded Coinbase button hides the countdown/QR reality behind a single
button that goes Pay → spinner → "View payment details".

---

## 7. SHOPIFY CHECKOUT + SHOP PAY (accelerated one-tap)
URL: https://www.shopify.com/blog/one-page-checkout
URL: https://help.shopify.com/en/manual/payments/accelerated-checkouts
URL: https://www.swipesum.com/insights/what-is-shop-pay-a-quick-guide-to-this-fast-checkout-solution

[V] One-page checkout: consolidates cart contents, contact, shipping address, delivery
options, payment, and order review onto ONE scrollable screen. Pre-filled sections for known
buyers are auto-collapsed to accelerate them through.

[V] Shop Pay accelerated flow (returning shopper):
1. Shop Pay button appears at checkout AND on product pages (express one-click).
2. Shopper enters email or phone number.
3. A one-time verification code is sent via SMS.
4. Order completes: shipping address, billing, and payment auto-fill.
[V] Reported ~4x faster than standard guest checkout; conversion lift ~50% vs guest.
[V] Winter 2026 update: "The Shop Pay button now displays the last four digits of the
customer's saved card, so shoppers can confirm which card is being charged before they tap."
[V] Post-purchase: option to track the order in the Shop app.

---

## 8. GENERIC EMBEDDABLE CRYPTO PAY-BUTTONS / WIDGETS (SpacePay, NOWPayments, Cryptonix, Hel.io)
URL: https://www.spacepay.co.uk/blog/crypto-payment-widget-embed
URL: https://coinremitter.com/payment-button-widget
URL: https://cryptobriefing.com/crypto-payment-widget-easy-integration/
URL: https://docs.hel.io/docs/checkout-widget

[V] Embeddable pattern: a JS/HTML button that opens a hosted widget — as a modal overlay,
inline in the checkout form, or a slide-in panel. The widget "handles wallet connection,
token selection, and transaction confirmation" so merchants don't build crypto checkout.
[V] Token breadth: NOWPayments supports 300+ cryptos (BTC, ETH, LTC, USDT, XMR…). Users
select the token inside the hosted modal; QR + address generated for self-custody wallets.
[V] Theming: e.g. SpacePay's widget takes a theme object — primary color, background color,
text color, border radius, font family, dark/light mode — "so the widget feels like a native
part of your checkout rather than a bolted-on third-party element."
[V] Conversion claim: embedded widgets achieve 34% higher completion rates than
redirect-based flows. → argues for in-page modal over hosted redirect.
[V] Cryptonix pattern: on activation "opens a secure modal or redirects to multi-currency
selection and QR code generation."

---

## 9. BAYMARD — cross-industry checkout-flow UX best practices (research-backed)
URL: https://baymard.com/learn/checkout-flow-ux-optimization

[V] Linear, predictable flow, no repeating pages. Progress indicators must map 1:1 to actual
steps (never hide/group). Optimized flows average ~12 form elements vs 19.9 industry average.
[V] Guest checkout must be the MOST prominent option (high-contrast button at top, not a
link): "62% of ecommerce sites don't make the guest checkout option the most prominent";
18% of US adults abandoned an order due to forced registration.
[V] Descriptive buttons: use "Continue to Payment" / "Pay & Place Order" instead of generic
"Continue" so the button signals what happens next.
[V] Errors: never clear entered data (esp. payment fields); adaptive messages state exactly
what's wrong ("ZIP code is too short" not "Invalid input"); autoscroll to the first error.
[V] Trust signals: SSL badges + payment logos near the payment form; keep order summary
visible throughout.

---

## 10. STATE MACHINE — canonical pay-button states to reproduce (synthesis)
[INF, grounded in the products above]
1. IDLE / READY — button shows the CTA + amount. Labels seen: "Pay", "Pay now",
   "Pay & Place Order", "Buy with  Pay", "Place order". Include amount when known
   ("Pay $20.00"). Lock icon = trust.
2. (crypto only) SELECT SOURCE — token/wallet/exchange picker inside the modal (Daimo:
   wallet vs exchange vs address; generic widgets: token dropdown + QR). Winners default to a
   sensible source and hide chain/gas entirely.
3. AUTH / CONFIRM — Apple Pay: Face ID/Touch ID; crypto: single wallet signature; cards:
   3DS challenge (redirect via return_url).
4. PROCESSING / PENDING — button disabled + spinner OR label → "Processing…" (Stripe) /
   spinner with aria "Transaction in progress" (OnchainKit). Prevents double-submit.
   For crypto, this is the ONLY blockchain wait the user should feel — keep it <5s and
   framed as "confirming your payment", never "waiting for N block confirmations".
5. SUCCESS — checkmark icon + brief animation (Apple Pay checkmark→dismiss; Stripe checkmark
   + success page). Heading: "Payment successful" / "Thanks for your order" / "You're all
   set." Show: amount, payment method ("Paid with Visa ending in 4242 — $129.00" or token),
   order/tx id, date, next-steps line, receipt/email note, support link. Button flips to
   "View payment details" / "Done".
6. FAILURE — Apple Pay exclamation + retry prompt; Stripe inline decline message
   (card_declined, insufficient_funds…) with entered data preserved; crypto: bounced/refund
   messaging. Always offer retry.
7. CANCELED — return to cart with soft copy ("Forgot to add something to your cart? Shop
   around then come back to pay!").

---

## 11. "MAKE PENDING SETTLEMENT FEEL INSTANT" — the specific techniques observed
[INF, grounded]
- Collapse the user's commitment to ONE action (one tap / one signature / one Face ID) and
  treat that as done. (Apple Pay, Daimo single-transfer, Shop Pay one-tap.)
- Flip to success the moment the user's side is captured, not when settlement finalizes:
  Apple Pay checkmark on complete(); Daimo shows success on `payment_started` (source tx
  detected) while bridge/swap runs on `payment_completed` in the background.
- Never name chains, gas, bridges, confirmations, or fees in the UI. Daimo explicitly:
  "swaps, bridges, and gas are hidden."
- Keep any real wait short and reassuring ("Processing…", spinner, "funds arrive in
  seconds") rather than a countdown of blockchain confirmations (the Coinbase Commerce
  hosted anti-pattern: 15-min timer, up-to-30-min settle).
- Use motion as the reward: an animated checkmark reads as finality; a spinner reads as
  progress. (Stripe + Apple Pay both lean on this.)
- Confirm what was charged immediately on the success screen (amount + method last-4 / token)
  to close the feedback loop and pre-empt "did it work?" support questions.

---

---

## 12. SUPPLEMENTAL FINDINGS — second research pass (2026-07-02)

### 12a. Stripe Link — one-click returning user: exact UX
URL: https://stripe.com/payments/link
URL: https://docs.stripe.com/payments/link/payment-element-link

[V] First-time enrollment: inline prompt in the card form — "Save my info for secure
1-click checkout" — user enters phone number; all info on the current page is remembered.
Prefilled data NOT stored unless user completes sign-up (consent-based by jurisdiction).

[V] Returning user step sequence:
1. Customer enters/has pre-filled email → Stripe recognises Link account → shows auth prompt
   instead of sign-up form.
2. OTP sent. Exact screen copy: "Enter the code sent to (•••) ••• ••35 to securely use
   your saved information." Resend link available.
3. Payment info auto-populates.
4. Primary button becomes: "Pay with •••• 9328" (last 4 digits of saved card visible).
   Secondary "Change" link next to it to swap card or address.
5. Single tap → done.

[V] Success screen exact copy observed: "Payment successful $42.08. The payment will appear
on your statement as 'P Skincare'."

[V] Speed claims from stripe.com/payments/link:
- "3× faster than non-Link customers"
- "customers can pay for goods and services in just six seconds"
- "40% faster" (OpenAI case study)
- "average returning user conversion increase of 14%"

---

### 12b. Stripe animations — exact details (from Stripe's own design article)
URL: https://medium.com/bridge-collection/improve-the-payment-experience-with-animations-3d1b0a9b810e
(Written by a Stripe designer, describes Stripe's internal checkout design decisions)

[V] Card brand logo animation: animates in as you type the card number, within 1-2 digits —
brand is identified and the logo slides into the card field in real time.

[V] Button label morphs: "Payment Info" → "Pay $25.00" via a slide transition as the user
moves through the form.

[V] SMS verification animation (admitted illusion): during Link enrollment an animation plays
while the OTP sends. Quote: "this animation is entirely an illusion — we don't actually know
when you receive the SMS." Purpose: makes the wait feel snappier. Lesson: animations can be
deliberate perception tricks, not literal progress signals.

[V] Checkmark on success: the checkmark animation on the success state — Stripe designers
noted this was the detail they were "most satisfied with — it really encourages you to feel
like you easily did the purchase."

[V] Shake on validation failure: when submission fails validation, the form shakes. Dual
purpose: "alleviates the frustration users might feel with its quirkiness while also
highlighting that something went wrong" — described as "the form basically shaking its head
at you."

[V] Page-load skeleton screens (not spinners): Stripe uses skeleton screens during element
load, not generic spinners — preserves layout continuity.

---

### 12c. Google Pay — COMPLETE_IMMEDIATE_PURCHASE button mode
URL: https://developers.google.com/pay/api/web/guides/ux-best-practices

[V] The Google Pay payment sheet has two primary button modes:
- `COMPLETE_IMMEDIATE_PURCHASE` → shows a "Pay" button inside the sheet (single-click
  checkout; no further steps after sheet).
- Default → shows "Continue" button (used for multi-step flows where more config follows
  the sheet).
[V] New card art feature: richer card art and card name in the payment sheet "helps users
select their preferred card faster." Dark mode supported.
[V] Optional: merchant can display the consumer's card brand + last 4 on the Google Pay
button itself (before the sheet opens) — matches Winter 2026 Shop Pay behaviour.
[V] Rule: "Ensure a final and total associated price is shown to the customer before you
invoke Google Pay" — amount must be visible before the sheet, not inside it for the first
time.

---

### 12d. Apple Pay — payment sheet timing rule (critical)
URL: https://applepaydemo.apple.com/

[V] Authoritative rule from Apple HIG: "The payment sheet must be presented IMMEDIATELY
after the user taps the Apple Pay button, without any interim screens or pop-ups except to
prompt for necessary product details, such as size or quantity."
→ Any loading/config screen between button tap and sheet open is an Apple Pay guideline
violation. Design implication: all config (amount, product) must be resolved BEFORE
the button is tapped.

[V] Before biometric auth, sheet shows REDACTED address: postal code + locality +
administrative area only — NOT the full street address. Sufficient for shipping cost / tax
calculation. Full address revealed to merchant only after successful auth.

[V] Post-success (iOS 16+): merchant can pass `ApplePayPaymentCompleteDetails` to show
order info on the user's device after the sheet dismisses.

---

### 12e. Shop Pay popup — exact anatomy
URL: https://shopify.dev/docs/api/commerce-components/pay/design-guidelines

[V] Popup renders OVER the merchant page with a dark overlay behind it.
[V] Internal layout (top → bottom):
  1. Brand logo (merchant's) — centered, 21px padding
  2. Vaulted shipping address (expandable, editable)
  3. Vaulted payment method (expandable, editable)
  4. Shipping method selector
  5. Discount code field
  6. Order summary (line items + subtotal)
  7. "Pay now" primary button (full-width)
  8. "Checkout as guest" link (escape hatch, visually subdued)
[V] Processing state (exact): popup shows spinner + "Your order's being processed"
[V] Completion: popup CLOSES automatically; merchant's page is responsible for redirecting
to thank-you page. Recommended: surface installment info + account management link via the
`paymentComplete` event's `.processingStatus` field.
[V] Step for unrecognised user: email/SMS OTP or passkey login before vaulted info loads.
[V] Winter 2026 button update: "The Shop Pay button now displays the last four digits of
the customer's saved card, so shoppers can confirm which card is being charged before they
tap." (Added to the button itself, before the popup opens.)

---

### 12f. Stripe stablecoin / crypto checkout flow
URL: https://stripe.dev/blog/using-stripe-stablecoin-payments-no-crypto-knowledge
URL: https://docs.stripe.com/payments/accept-stablecoin-payments

[V] User-facing flow when "Pay with Crypto" is selected in Stripe Checkout:
1. Customer selects "Pay with Crypto" as payment method (appears in Payment Element like any
   other method — no separate crypto page).
2. Redirect to crypto.stripe.com (Stripe-hosted crypto checkout page).
3. Customer selects currency (USDC etc.) and payment network (Ethereum / Solana / Polygon /
   Base).
4. Customer connects wallet (MetaMask, Coinbase Wallet, Phantom, etc.) OR scans QR code.
5. Signs USDC transfer from wallet.
6. Stripe credits merchant after on-chain confirmations.
7. Customer is returned to merchant site — sees "same confirmation flow as card payments"
   (no blockchain-specific success screen; normal order confirmation).

[V] Networks at launch: Ethereum, Solana, Polygon. Base added during 2025 expansion.
[V] Key abstraction: from the customer's perspective after the "Pay with Crypto" selection,
the experience is: pick currency/network → connect wallet → sign once → done. No gas token
selection, no wallet approval loops, no bridge steps.

---

### 12g. Crypto checkout: canonical 3-state pattern & anxiety-moment patterns
URL: https://aurpay.net/aurspace/crypto-checkout-ux-reduce-cart-abandonment-2026/
URL: https://www.startdesigns.com/blog/crypto-checkout-web3-shopping-website/
URL: https://www.pallapay.com/blog/designing-a-crypto-checkout-flow-the-2026-merchant-integration-guide/

[V] Three canonical label states used across multiple products:
  1. "Waiting for payment" — wallet address + QR code + exact amount shown
  2. "Payment received — confirming..." — spinner/progress indicator; fires IMMEDIATELY on
     transaction detection (before any block confirmations). This is the state that transforms
     the experience — user can close the page / go back to the store.
  3. "Payment confirmed" — success message + redirect trigger

[V] Rate-lock timer pattern (for products exposing exchange rates):
  - "This rate is locked for 20 minutes" displayed in a subtle corner element
  - Color shift: neutral → yellow at 5 min remaining → red at 2 min remaining
  - One-click "refresh payment" if timer expires (does NOT restart the cart)

[V] Dual-currency display: "0.00342 BTC ($285.00 USD)" — fiat amount is LARGER and
positioned first; crypto amount is secondary. Allows instant verification without conversion.

[V] Network selection (when exposed, not hidden):
  - Polygon — Fee: ~$0.01 · Confirms in ~2 sec
  - Tron (TRC-20) — Fee: ~$0.30 · Confirms in ~3 sec
  - Ethereum — Fee: ~$2.50 · Confirms in ~15 min
  - Best practice: pre-select lowest-cost option automatically (eliminates hesitation).
  - Products like Daimo skip this screen entirely by auto-routing.

[V] The critical anxiety moment: "Waiting → detected" transition. Systems that detect
and update to 'Payment received' within seconds prevent duplicate payments and build trust.
"Never leave the user guessing after they approve a transaction."

[V] Confirmation page extras (crypto-specific):
  - Transaction hash + block explorer link (Etherscan, Tronscan)
  - Email receipt including tx hash
  - "1 of 3 confirmations received" progress bar (only needed for Ethereum/Bitcoin — L2-first
    products skip this because confirms arrive in <5s)

---

### 12h. Baymard checkout-length research
URL: https://baymard.com/learn/checkout-flow-ux-optimization

[V] Average checkout step count (top 60 US+EU retailers):
  - 2012 Baymard benchmark: 5.1 steps average (including cart)
  - 2016: 5.42 steps
  - 2019: back to 5.1 steps
[V] "The number of steps isn't the most important aspect — it is what the user has to DO at
each step that matters." (Up to ~8 steps, usability degrades noticeably above that.)
[V] One-page checkout vs multi-step: Shopify data shows one-page converts ~7.5% better.
[V] Most impactful single fix: making guest checkout the most prominent option (high-contrast
button, top position, above keyboard on mobile). 18% of US adults abandoned due to forced
registration.

---

### 12i. Complexity-hiding spectrum — expanded table
[INF, grounded in products above]

| Product              | What user sees at checkout         | What is hidden from user                      |
|----------------------|------------------------------------|-----------------------------------------------|
| Apple Pay            | Biometric + total amount           | Card number, all payment rails, network        |
| Shop Pay (returning) | Last 4 digits + amount + spinner   | All payment rails, settlement                  |
| Stripe Link          | Last 4 digits + amount + OTP       | Card network, all rails, settlement            |
| OnchainKit Checkout  | "Pay" → spinner → "View details"   | Gas, chain, contract execution                 |
| Stripe stablecoin    | Currency picker + wallet connect   | Gas, signing mechanics, network routing        |
| Daimo Pay            | Wallet/exchange logos + amount     | Bridge, swap, gas, chain routing (all hidden)  |
| Coinbase Commerce    | 15-min timer + QR + address        | Nothing — raw blockchain wait exposed          |
| Generic QR widget    | Address + QR + amount + network    | Block explorer (revealed only on success)      |
| Raw MetaMask tx      | Gas, nonce, hex calldata, fee      | Nothing — everything exposed                   |

---

## SOURCES (all URLs)
- https://docs.stripe.com/payments/checkout/how-checkout-works
- https://docs.stripe.com/checkout/quickstart.md
- https://docs.stripe.com/payments/payment-element
- https://stripe.com/payments/elements
- https://stripe.com/resources/more/payment-successful-pages
- https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions
- https://stripe.com/resources/more/credit-card-checkout-ui-design
- https://developer.apple.com/design/human-interface-guidelines/apple-pay/
- https://developer.apple.com/apple-pay/planning/
- https://developer.apple.com/documentation/passkit/pkpaymentbuttontype
- https://www.checkout.com/docs/payments/add-payment-methods/apple-pay/web
- https://paydocs.daimo.com/how-it-works
- https://github.com/daimo-eth/pay
- https://paydocs.daimo.com/webhooks
- https://minipay.to/blog/minipay-daimo-crosschain-deposit
- https://daimo.com/
- https://commerce.coinbase.com/docs
- https://rossbulat.medium.com/accept-crypto-with-coinbase-commerce-intro-integration-guide-8fc4dc7df10f
- https://docs.base.org/builderkits/onchainkit/checkout/checkout
- https://www.shopify.com/blog/one-page-checkout
- https://help.shopify.com/en/manual/payments/accelerated-checkouts
- https://www.swipesum.com/insights/what-is-shop-pay-a-quick-guide-to-this-fast-checkout-solution
- https://www.spacepay.co.uk/blog/crypto-payment-widget-embed
- https://cryptobriefing.com/crypto-payment-widget-easy-integration/
- https://docs.hel.io/docs/checkout-widget
- https://baymard.com/learn/checkout-flow-ux-optimization
- https://stripe.com/payments/link
- https://docs.stripe.com/payments/link/payment-element-link
- https://docs.stripe.com/elements/express-checkout-element
- https://medium.com/bridge-collection/improve-the-payment-experience-with-animations-3d1b0a9b810e
- https://developers.google.com/pay/api/web/guides/ux-best-practices
- https://applepaydemo.apple.com/
- https://shopify.dev/docs/api/commerce-components/pay/design-guidelines
- https://stripe.dev/blog/using-stripe-stablecoin-payments-no-crypto-knowledge
- https://docs.stripe.com/payments/accept-stablecoin-payments
- https://aurpay.net/aurspace/crypto-checkout-ux-reduce-cart-abandonment-2026/
- https://www.startdesigns.com/blog/crypto-checkout-web3-shopping-website/
- https://www.pallapay.com/blog/designing-a-crypto-checkout-flow-the-2026-merchant-integration-guide/
- https://www.swipesum.com/insights/what-is-shop-pay-a-quick-guide-to-this-fast-checkout-solution
- https://stripe.com/resources/more/checkout-screen-best-practices
- https://stripe.com/resources/more/payment-successful-pages
