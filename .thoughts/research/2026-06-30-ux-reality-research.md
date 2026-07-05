# Reality Research: UX patterns for Tab + Leash

> Facts-only current-reality brief for Abu's AI designer. Reproducible: every pattern below
> is observable in a shipped product or a primary doc, and cited. This document does NOT
> propose our product's UI — it is the reference reality the designer draws from.
> Original: 2026-06-30. Expanded with 4-area structured audit: 2026-07-02.

## Scope

Cross-product audit of verified UX patterns across four surfaces relevant to building Tab
(user-facing spend UI) and Leash (agent-spend control): (1) checkout flows and payment UI,
(2) embedded wallet onboarding and seedless auth, (3) agentic-payment dashboards and
spend-monitoring controls, and (4) developer-tool DX including x402 protocol and facilitator
coverage. Research conducted against live products and primary documentation as of 2026-07-02;
no proposals for our own product are included.

---

## Sources Checked

### Checkout
- Stripe Checkout (hosted) — https://docs.stripe.com/payments/checkout/how-checkout-works
- Stripe Payment Element (embedded) — https://docs.stripe.com/payments/payment-element
- Stripe Express Checkout Element — https://docs.stripe.com/elements/express-checkout-element
- Stripe Link (one-click) — https://stripe.com/payments/link ; https://docs.stripe.com/payments/link/payment-element-link
- Stripe success/cancel UI + copy — https://stripe.com/resources/more/payment-successful-pages
- Stripe checkout best practices — https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions ; https://stripe.com/resources/more/checkout-screen-best-practices
- Stripe stablecoin / crypto — https://stripe.dev/blog/using-stripe-stablecoin-payments-no-crypto-knowledge ; https://docs.stripe.com/payments/accept-stablecoin-payments
- Apple Pay HIG — https://developer.apple.com/design/human-interface-guidelines/apple-pay/
- Apple Pay button types — https://developer.apple.com/documentation/passkit/pkpaymentbuttontype
- Apple Pay demo — https://applepaydemo.apple.com/
- Google Pay UX guide — https://developers.google.com/pay/api/web/guides/ux-best-practices
- Shop Pay design guidelines — https://shopify.dev/docs/api/commerce-components/pay/design-guidelines
- Shopify one-page checkout — https://shopify.com/enterprise/blog/one-page-checkout ; https://www.shopify.com/blog/1-click-checkout
- Coinbase Commerce (hosted) — https://commerce.coinbase.com/
- OnchainKit `<Checkout>` / `<CheckoutButton>` — https://docs.base.org/builderkits/onchainkit/checkout/checkout
- Daimo Pay — https://daimo.com/ ; https://docs.daimo.com/
- Generic embeddable crypto pay-buttons (SpacePay/Hel.io) — https://www.spacepay.co.uk/blog/crypto-payment-widget-embed ; https://docs.hel.io/docs/checkout-widget
- Baymard checkout-flow UX research — https://baymard.com/learn/checkout-flow-ux-optimization
- Crypto checkout UX guides — https://aurpay.net/aurspace/crypto-checkout-ux-reduce-cart-abandonment-2026/ ; https://www.pallapay.com/blog/designing-a-crypto-checkout-flow-the-2026-merchant-integration-guide/

### Wallet Onboarding
- Privy (VERIFIED-LIVE 2026-07-02) — https://demo.privy.io/ ; https://docs.privy.io/authentication/user-authentication/login-methods/email ; https://docs.privy.io/basics/react-native/advanced/automatic-wallet-creation
- Dynamic (VERIFIED-LIVE 2026-07-02) — https://demo.dynamic.xyz/ ; https://www.dynamic.xyz/features/wallet-creation
- Coinbase Smart Wallet / Base App (VERIFIED-LIVE 2026-07-02) — https://base.app/
- Magic (VERIFIED-LIVE 2026-07-02) — https://dashboard.magic.link/login ; https://docs.magic.link/embedded-wallets/authentication/login/email-otp
- MetaMask Embedded Wallets — https://metamask.io/news/metamask-embedded-wallets-frictionless-web3-onboarding-built-in ; https://docs.metamask.io/embedded-wallets/features/funding/
- Phantom Connect (seedless) — https://docs.phantom.com/phantom-connect ; https://phantom.com/learn/blog/deep-dive-log-in-to-phantom-with-email
- Immutable Passport — https://www.immutable.com/passport ; https://www.immutable.com/blog/under-the-hood-immutable-passport
- Rainbow — https://rainbow.me/en/support/app/get-started-with-the-rainbow-app
- MoonPay Widget (onramp) — https://dev.moonpay.com/widget/on-ramp/design-guide
- Stripe Embedded Onramp — https://docs.stripe.com/crypto/onramp/embedded
- Coinbase Onramp (Apple Pay path) — https://docs.cdp.coinbase.com/embedded-wallets/onramp/apple-pay
- Passkey UX references — https://eco.com/support/en/articles/15039720-passkey-wallets-explained ; https://www.corbado.com/blog/smart-wallets-passkeys ; https://www.theusefulapps.com/news/face-id-touch-id-passkeys-ux-patterns
- OTP best practices — https://arkesel.com/otp-expiration-rate-limiting-best-practices/ ; https://www.authgear.com/post/login-signup-ux-guide/
- 7Block fallback pattern — https://www.7blocklabs.com/blog/the-invisible-wallet-creating-frictionless-onboarding-for-gamers

### Agent Dashboard and Spend Controls
- Ramp Virtual Card Spend Controls — https://support.ramp.com/hc/en-us/articles/360051065813 ; https://support.ramp.com/hc/en-us/articles/5939293080083 ; https://support.ramp.com/hc/en-us/articles/4417662362259
- Brex Spend Limits and Budgets — https://www.brex.com/support/spend-limits-overview ; https://www.brex.com/support/manage-budgets-and-spend-limits ; https://www.brex.com/support/brex-notifications
- Vercel Spend Management — https://vercel.com/docs/spend-management ; https://vercel.com/blog/introducing-spend-management-realtime-usage-alerts-sms-notifications
- Stripe Issuing for Agents — https://docs.stripe.com/issuing/agents ; https://docs.stripe.com/issuing/controls/spending-controls
- Coinbase Agentic Wallets — https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- Skyfire AI Agent Payment Wallet — https://skyfire.xyz/product/ ; https://www.pymnts.com/artificial-intelligence-2/2025/skyfire-launches-ai-agent-checkout-to-enable-fully-autonomous-transactions/
- Payman AI (VERIFIED-LIVE) — https://paymanai.com/
- Nevermined AI Agent Payment Delegation — https://nevermined.ai/blog/nevermined-pay-give-your-ai-agent-a-credit-card-with-guardrails ; https://nevermined.ai/blog/three-ways-to-give-an-ai-agent-a-spending-limit
- Cloudflare AI Gateway Spend Limits — https://developers.cloudflare.com/ai-gateway/features/spend-limits/ ; https://blog.cloudflare.com/ai-gateway-spend-limits/
- ServiceNow AI Control Tower — https://www.servicenow.com/products/ai-control-tower.html ; https://www.theregister.com/software/2026/05/05/servicenow-adds-agent-kill-switches-to-ai-control-tower/5228579
- Mastercard Agent Pay — https://eco.com/support/en/articles/14845483-mastercard-agent-pay-explained ; https://eco.com/support/en/articles/14839409-ai-agent-spend-controls
- Agentic UX design references — https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/ ; https://mantlr.com/blog/designing-for-ai-agents-ux-patterns-2026
- Fintech push notification copy — https://messageflow.com/blog/transactional-push-notifications-examples/
- Other — https://killswitch.md/ ; https://catena.com/

### Developer-Tool DX and x402
- Stripe developer hub — https://docs.stripe.com/development ; https://docs.stripe.com/keys ; https://docs.stripe.com/sandboxes ; https://docs.stripe.com/quickstarts
- Stripe Workbench — https://docs.stripe.com/workbench/overview
- Clerk Next.js quickstart — https://clerk.com/docs/nextjs/getting-started/quickstart
- Resend Node.js quickstart — https://resend.com/docs/send-with-nodejs ; https://resend.com/docs/create-an-api-key
- LemonSqueezy developer guide — https://docs.lemonsqueezy.com/guides/developer-guide/getting-started ; https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- x402 protocol spec — https://docs.x402.org/core-concepts/network-and-token-support ; https://www.x402.org ; https://www.x402.org/writing/x402-v2-launch
- Coinbase CDP x402 facilitator — https://docs.cdp.coinbase.com/x402/welcome ; https://docs.cdp.coinbase.com/x402/network-support ; https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
- OpenZeppelin Stellar x402 facilitator — https://developers.stellar.org/docs/build/agentic-payments/x402 ; https://docs.openzeppelin.com/relayer/guides/stellar-x402-facilitator-guide
- x402 GitHub reference implementation — https://github.com/coinbase/x402
- Cloudflare Agents x402 — https://developers.cloudflare.com/agents/agentic-payments/x402
- Vercel x402-mcp — https://vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools
- Coinbase AgentKit — https://github.com/coinbase/agentkit
- Particle Universal Accounts SDK — live docs https://developers.particle.network/universal-accounts/ua-reference/web/transactions/transfer ; internal repo `.thoughts/research/x402-payer-mechanics.md`, `rat-and-mobile-verification.md`, `tab-architecture.md`
- Press coverage — https://www.theblock.co/post/382284/coinbase-incubated-x402-payments-protocol-built-for-ais-rolls-out-v2

---

## Verified Facts

### A. Checkout

#### Products and what they are

- **Stripe Checkout (hosted):** server creates a Checkout Session → redirect to `stripe.com` URL → payment → redirect back. Sidebar: sticky order summary. Payment form: Express Checkout buttons (Apple Pay, Google Pay, Link, PayPal, Klarna) auto-appear at top when eligible, then "Or" divider, then card form. 100+ payment methods. Confirmation via `checkout.session.completed` webhook.
- **Stripe Payment Element (embedded):** single embeddable React/JS component rendering 100+ payment methods, dynamically ordered by location/currency/amount. Three layout modes: tabs (horizontal), accordion with radios, accordion without radios. Validates input, shows localized decline messages. Confirm via `checkout.confirm()` or `confirmPayment()` with `return_url` for 3DS redirects.
- **Stripe Link (one-click):** Stripe's saved-payment-info network. First visit: inline prompt "Save my info for secure 1-click checkout" (phone number opt-in). Returning users: email recognized → OTP sent → auto-fill → primary button becomes "Pay with •••• 9328". Claimed stats: checkout in 6 seconds, 3x faster than non-Link, 14% higher returning-user conversion.
- **Apple Pay:** native iOS/macOS/Safari sheet. Sheet opens IMMEDIATELY on button tap — Apple guideline is zero interim loading screens; all config (amount, item details) must be resolved before the button renders. Before auth: redacted address (postal code + city only). Auth: Face ID / Touch ID / passcode. Success: animated checkmark → auto-dismiss. Button has 17 verb types (Buy, Check Out, Order, Subscribe, Pay, etc.) and 3 themes (black, white, white-outline). Zero typing required.
- **Google Pay:** browser/Android sheet. Shows saved cards with rich card art + last 4 digits. `COMPLETE_IMMEDIATE_PURCHASE` mode shows "Pay" (single-click); otherwise "Continue". Rule: total price must be visible BEFORE the sheet is invoked. Dark mode supported. No account creation required.
- **Shop Pay (Shopify):** dark-overlay popup over the merchant page. Layout top-to-bottom: brand logo (centered, 21px padding) → vaulted address (expandable) → vaulted payment (expandable) → shipping selector → discount field → order summary → "Pay now" button → "Checkout as guest" escape link. Processing: spinner + "Your order's being processed". Completion: popup closes, merchant redirects to thank-you. Winter 2026 update: button shows last 4 digits before tap.
- **Coinbase Commerce (hosted) — documented anti-pattern:** customer selects currency → QR code + wallet address + 15-minute rate-lock countdown shown explicitly. States: Awaiting Payment → Pending → Confirmed. Settlement up to 30 minutes. Webhooks: `charge:created`, `charge:confirmed`, `charge:failed`. Status lag can reach 1 hour. This is the anti-pattern for "instant" crypto checkout.
- **OnchainKit Checkout / CheckoutButton (Coinbase embedded):** React component. Default button text: "Pay". During pending/fetchingData: spinner with aria-label "Transaction in progress". Success: button becomes "View payment details". LifecycleStatus: `init → pending → fetchingData → success → error`. Hides all blockchain internals.
- **Daimo Pay:** React SDK, `<DaimoPayButton />`. Accepts 1,000+ tokens on 20+ chains. Handles chain selection, wallet connection, swap, bridge, gas — all hidden. Single transfer transaction from source (no approval loops). Completes in <5 seconds. Lifecycle: `payment_started` (source tx detected) → `payment_completed` (destination confirmed). NOTE: event ordering not guaranteed — `payment_completed` can arrive before `payment_started`. Merchant can show success on `payment_started` while backend settles silently. Intent verb (Pay/Deposit/Add Money) is merchant-configured.
- **Stripe stablecoin / crypto (crypto.stripe.com):** stablecoin is just another payment method inside Stripe's Payment Element. Customer selects "Pay with Crypto" → redirect to `crypto.stripe.com` → picks currency + network (Ethereum/Solana/Polygon/Base) → connects wallet OR scans QR → signs USDC transfer → Stripe credits merchant after on-chain confirmations → customer sees standard order confirmation identical to card payments.
- **Generic embeddable crypto widgets (SpacePay, NOWPayments, Hel.io):** JS/HTML button opens a hosted widget (modal/inline/slide-in) handling wallet-connect + token select (300+ coins) + QR/address + themeable (color, radius, font, dark/light). Embedded widgets self-report ~34% higher completion than redirect (vendor-reported, not independently audited).

#### Layout and flow patterns

- Express Checkout (Apple Pay / Google Pay / Link) renders ABOVE the card form, separated by an "Or" divider. Users who can one-tap never interact with the card form.
- Apple Pay hard rule: native sheet opens on button tap with zero interim loading screens.
- Google Pay rule: total price must be visible to the user before the payment sheet is invoked.
- Shop Pay (Winter 2026) and Stripe Link both show last 4 digits of saved card on the button itself before any modal opens.
- Stripe Link returning-user button: "Pay with •••• 9328" (includes last-4 before tap).
- Shop Pay always shows "Checkout as guest" escape link (subdued, but present). No modal traps the user.
- One-tap returning-user pattern: email recognized → OTP (Stripe Link) or session cookie (Shop Pay) → auto-populate → single tap → done.
- Embedded in-page widget achieves ~34% higher completion vs redirect-based flows (SpacePay / generic widget data; vendor-reported).

#### Button-state sequence (verified across Stripe, OnchainKit, Apple Pay)

| State | What the button/UI shows |
|---|---|
| IDLE/READY | Verb + amount: "Pay $20.00", "Pay now", "Buy with [Apple Pay]". Lock icon = trust signal. |
| LOADING (page/element) | Skeleton screens (Stripe Payment Element) or shimmer while element initializes. Layout preserved. Not a full-page spinner. |
| SELECT SOURCE (crypto) | Token/wallet/exchange picker. Daimo: hides this screen via auto-routing. |
| AUTH/CONFIRM | Apple Pay: native Face ID/Touch ID prompt. Stripe Link: OTP code field "Enter the code sent to (•••) ••• ••35". Shop Pay: passkey or SMS OTP. 3DS: redirect with return_url. |
| PROCESSING/PENDING | Button disabled + spinner OR label → "Processing…" (Stripe) / spinner with aria "Transaction in progress" (OnchainKit). Prevents double-submit. |
| SUCCESS | Animated checkmark. Apple Pay: native sheet checkmark → auto-dismiss. Stripe: green (#00D924) checkmark on success page. OnchainKit button → "View payment details". |
| FAILURE | Stripe form shakes (combined error signal + tension-release). Inline error adjacent to field. Entered data preserved. Alternative payment method offered immediately. |
| CANCELED | Soft copy, not an error. Cart preserved. |

#### Crypto-specific 3-state confirmation model

1. **"Waiting for payment"** — QR code (min 200×200px desktop), wallet address, exact crypto+fiat amount, "Copy address" full-width button (min 48px height), deep-link wallet buttons ("Pay with MetaMask" / "Open in Trust Wallet").
2. **"Payment received — confirming..."** — fires immediately on tx detection, NOT after confirmations. Spinner/progress indicator. User can close the page safely at this point. This is the critical anxiety-relief moment.
3. **"Payment confirmed"** — success screen + redirect.

L2 products (Base, Polygon, Solana) skip the "N of 3 confirmations" progress bar — confirmation is fast enough to show success directly. The progress bar is only for slow chains (Ethereum, Bitcoin).

#### Rate-lock timer pattern

- Corner element shows: "This rate is locked for 20 minutes"
- Color shifts: neutral → yellow at 5 min → red at 2 min
- On expiry: "Refresh payment" one-click button. Does NOT restart cart or require re-entering items.

#### Success screen anatomy (Stripe guidance)

Heading ("Payment successful" / "Thanks for your order" / "You're all set") + exact amount + "Paid with Visa ending in 4242 — $129.00" + order/tx number + date + next-steps line + "A confirmation email has been sent to [email]" (explicitly above fold — per Baymard, users will not close the success page until they see this) + support link.

Personalized variant: "Thanks, Maya. Your order is confirmed." Payment line: "Payment successful $42.08. The payment will appear on your statement as P Skincare."

#### Additional edge cases

- Underpayment (crypto): show exact shortfall + option to top-up. Do not silently fail.
- Network mismatch: "You're sending on the wrong network — please use [network]" inline, adjacent to the address/QR display.
- Daimo `payment_bounced` webhook: funds refunded to refund address. UI shows refund notice, not just an error.
- Time-sensitive cart: "We're saving your items for 10 minutes while you complete payment." (Creates urgency but removes pressure of losing the cart.)
- Cancel copy (Stripe): "Forgot to add something to your cart? Shop around then come back to pay!" — session preserved, cart items not lost.
- Baymard finding: 18% of US adults abandon carts due to forced registration. Guest checkout button must be highest-contrast, topmost option — not a link, not below a sign-in form.
- NEVER clear entered payment fields on validation failure. Inline error appears next to the field after the user leaves it (not while typing). Auto-scroll to first error on submit.

#### Real checkout microcopy

- "Pay $42.08" — Stripe Checkout primary button
- "Pay now" — generic primary button, Stripe + Google Pay
- "Pay with •••• 9328" — Stripe Link returning-user button
- "Buy with [Apple Pay logo]" — Apple Pay default button
- "Check Out with Apple Pay" — Apple Pay 'check-out' verb type
- "Save my info for secure 1-click checkout" — Stripe Link enrollment prompt
- "Enter the code sent to (•••) ••• ••35 to securely use your saved information" — Stripe Link OTP screen
- "Payment successful $42.08. The payment will appear on your statement as 'P Skincare'." — Stripe Link success
- "Paid with Visa ending in 4242 — $129.00" — Stripe success page
- "Thanks, Maya. Your order is confirmed" — Stripe success with customer name
- "You'll receive a shipping confirmation with tracking info in 24–48 hours" — Stripe next-steps
- "Your payment has been securely processed" — Stripe trust signal
- "Need help? Contact us here" — Stripe support link
- "Pay now" — Shop Pay primary button inside popup
- "Checkout as guest" — Shop Pay escape hatch link (subdued)
- "Your order's being processed" — Shop Pay processing spinner text
- "Waiting for payment" — crypto checkout state 1
- "Payment received — confirming..." — crypto state 2 (fires on tx detection)
- "Payment confirmed" — crypto state 3
- "This rate is locked for 20 minutes" — crypto rate-lock timer
- "Your card's security code is incorrect" — Stripe inline error (specific)
- "Your card number is incomplete" — Stripe inline error (specific)
- "The payment didn't go through, and you haven't been charged" — Stripe payment failure
- "Still having trouble? Our team can help" — Stripe payment failure fallback
- "We're saving your items for 10 minutes while you complete payment" — Stripe time-sensitive cart
- "Forgot to add something to your cart? Shop around then come back to pay!" — Stripe cancel URL
- "Continue to Payment" — Baymard-recommended multi-step button (vs generic "Continue")
- "Pay $64.99 and place order" — Baymard-recommended final button (vs generic "Place Order")
- "View payment details" — OnchainKit Checkout success state button
- "Transaction in progress" — OnchainKit spinner aria-label
- "funds arrive in seconds" — Daimo Pay speed copy
- "0.00342 BTC ($285.00 USD)" — dual-currency display format (fiat first, larger; crypto secondary)

---

### B. Wallet Onboarding

#### Products and what they are (all VERIFIED-LIVE or VERIFIED-DOC as noted)

- **Privy (VERIFIED-LIVE 2026-07-02):** combined "Log in or sign up" modal. Email field with inline "Submit" button on right edge, greyed until input. Social buttons below. 6-box OTP. Wallet provisioned silently after auth. 75M+ accounts. Acquired by Stripe June 2025.
- **Dynamic (VERIFIED-LIVE 2026-07-02):** "Log in or sign up" widget. Email placeholder "Enter your email", separate disabled "Continue" button below. Social row. "Continue with a wallet" for external wallets. "Confirm verification code" 6-box OTP with masked email + animated loading arc under envelope icon. MPC wallet created invisibly. A Fireblocks company.
- **Coinbase Smart Wallet / Base App (VERIFIED-LIVE 2026-07-02):** entry is "Welcome to Base App" + single "Continue" pill. Passkey-only smart wallet (ERC-4337). "Create a smart wallet" → "Sign up" → device biometric → ~15s, no seed. Copy: "This passkey will only be saved on this device." Recovery: "Never lose access." keys.coinbase.com now redirects to base.app.
- **Magic (VERIFIED-LIVE 2026-07-02):** own auth shows "Welcome back" / "Work email" / "Log in" / "Sign up for free" / consent checkbox / "Get started". Consumer SDK `loginWithEmailOTP` with `showUI:true` renders a pre-built OTP modal. Claims 3x higher conversion vs magic-link clicks.
- **MetaMask Embedded Wallets (ex-Web3Auth):** Google/Apple/X/email OTP embedded wallet. Funding entry: "Add Funds" → card (credit/debit, Apple/Google Pay) OR QR code with wallet address.
- **Phantom Connect (seedless):** Google or Apple login → 4-digit PIN → approve permissions/spending limits → wallet generated on-device, never exported. $1,000/day per-app spending cap set at PIN step.
- **Immutable Passport:** Google/Apple/Facebook/email login for gaming embedded wallets. Dashboard-first, gaming UX framing. Entry: "store and add funds".
- **Rainbow (self-custody, contrast case):** "Get a new wallet" → cloud Backup (default) or optional manual paper seed. Does not force a seed screen at onboarding.
- **MoonPay Widget (onramp):** embeddable fiat-to-crypto widget. 5-step flow: amount → MFA → payment method (Apple Pay is DEFAULT on iOS — highest success rate) → KYC → confirm. Pre-filling the amount field skips amount screen (+6% conversion per MoonPay). Pre-filling email skips MFA/login screen. Custom widget theme → +20% OTP completion rate.
- **Stripe Embedded Onramp:** fiat-to-crypto widget. Session-state model: `initialized → requires_payment → fulfillment_processing → fulfillment_complete → rejected`. KYC cannot be pre-populated (SSN field blocked).
- **Coinbase Onramp (Apple Pay path):** inline Apple Pay purchase of USDC inside apps. Flow: "Amount in USD" numeric input → "Buy USDC with Apple Pay" → loading "Creating order…" → native Apple Pay sheet → "Purchase complete!" + "Done". Supports guest checkout (no Coinbase account required for eligible US users).

#### Entry screen (both Privy and Dynamic VERIFIED-LIVE)

- Single combined screen handles new and returning users. Header is always "Log in or sign up". No "do you have an account?" branch. Email field + social buttons only. No password.
- Privy: submit button INLINE inside the email field on right edge, labeled "Submit", greyed until email typed.
- Dynamic: separate full-width "Continue" button BELOW the field, disabled until email typed. Separate option: "Prefer phone number sign up? Use phone".
- Social button layout: full-width primary ("Continue with Google" with G icon) + icon-only row for secondary socials (Apple, Coinbase, Phantom, GitHub, "..." overflow) + "Continue with a wallet" for external wallet users.
- Email field placeholder: "your@email.com" (Privy) / "Enter your email" (Dynamic).
- Primary button stays disabled until valid input is entered. No premature submission.

#### OTP screen (both Privy and Dynamic VERIFIED-LIVE — structure is identical)

Back arrow top-left → centered envelope icon → header sentence → body sentence echoing user's email → 6 separate single-character boxes → auto-advance character by character → AUTO-SUBMIT on the 6th digit (no "Verify" button needed) → "Resend code" accent link → attribution footer.

- Privy header: "Enter confirmation code". Body: shows FULL email address, bolded inline in sentence.
- Dynamic header: "Confirm verification code". Body: shows MASKED/TRUNCATED email (e.g. "demo...arch@example.com").
- Privy resend: "Didn't get an email? Resend code"
- Dynamic resend: "Did not receive a code? Check spam or Re-send code" (adds spam-folder nudge)
- Attribution footers: "Protected by ● privy" / "Powered by ● dynamic"

#### Wrong-code error (both VERIFIED-LIVE)

- Privy: 6 boxes turn red/pink AND CLEAR. NO error text sentence — the color IS the entire signal.
- Dynamic: pink/red banner at TOP of card "The code you entered is incorrect. Please try again." PLUS red-outlined boxes.
- Both: retry in place without navigating away.

#### Wallet provision (universal pattern, verified across all products)

After OTP or social auth, there is NO wallet-creation screen, no seed phrase, no "your wallet is ready" celebration in the default embedded-wallet flow (Privy, Dynamic, Magic, Coinbase, Phantom). User is simply "logged in". Wallet provisioned server/enclave-side invisibly.

Contrast: FUNDING completion IS explicitly celebrated. Coinbase Onramp: "Purchase complete!" with "Done" button. This celebration asymmetry appears intentional — wallet creation is infrastructure, the money-in moment is the first real user milestone.

#### Passkey flow (Coinbase / Base App)

- OS-native prompt only — never a custom modal. System text: "Save a passkey for [domain]?".
- App-side CTA: "Continue with Face ID". Secondary options hidden under "Other options".
- Post-creation: "Great—your Passkey is now stored". Coinbase-reported stat: ~15 seconds total.
- Transaction signing: tap action button → biometric prompt → 0.5–1s latency → done. User's mental model per eco.com: "tap, look at camera, done". No popups, no redirects.
- Passkey failure pattern: shake animation + haptic + fallback button (PIN or password). Error copy blames system, not user: "Face ID unavailable" — never "You failed".
- Fallback chain (7Block pattern): passkey → "Continue with Google/Apple" → magic link as last resort.

#### Phantom-specific: PIN step after social auth

- Only product in this study to insert a PIN creation step after Google/Apple login.
- Framed as "a simple 4-digit PIN that is easily memorable".
- $1,000/day per-app spending limit set at this step.
- On limit hit: transaction rejected (exact microcopy not confirmed in primary docs).

#### Returning user states

- **Same device/browser:** silent re-auth via refresh token; no modal shown. Some apps show "Welcome back" header (Magic).
- **New device:** heavier path. Privy: device share is localStorage-bound; recovery required. Passkey products: must sync via iCloud Keychain / Google Password Manager or re-create from scratch. This state is under-documented but real and can be a dead end.

#### OTP expiry and rate-limit edge cases (best practices, not all directly observed in demos)

- Expired code: must show a DIFFERENT error than wrong code. Best practice: "This code has expired. We've sent a new one." Auto-resend should NOT count against attempt limits.
- Rate-limited: "Too many attempts. Please wait 15 minutes before requesting a new code."
- Resend cooldown: link enters a countdown state (~30s). "Didn't receive your code? Wait 30 seconds and we'll send another."
- OTP expiry times (verified): Privy email OTP: 10 min. Coinbase email OTP: 10 min. Coinbase SMS OTP: 5 min.

#### Full state list (wallet onboarding)

1. **FIRST-RUN NEW USER:** combined "Log in or sign up" → email OTP or social → silent wallet provision → optional fund prompt. 2–3 screens total.
2. **RETURNING USER SAME DEVICE/BROWSER:** silent re-auth via refresh token. No modal shown. Some apps show "Welcome back".
3. **RETURNING USER NEW DEVICE:** heavier — Privy requires recovery (device share is localStorage-bound). Passkey: must sync via iCloud/Google or re-create. Potentially a dead end.
4. **OTP SENDING STATE:** primary button disabled, spinner shown, email field locked. Dynamic shows animated arc under envelope icon.
5. **OTP AWAITING INPUT:** 6 boxes focused, blinking cursor in first empty box. Auto-advance. Auto-submit on 6th digit.
6. **OTP WRONG CODE:** Privy = boxes turn red + clear, no text. Dynamic = red banner + red boxes. Both: retry in place.
7. **OTP EXPIRED:** "This code has expired. We've sent a new one." (best practice). Auto-resend should not count against attempt limit.
8. **OTP RATE LIMITED:** "Too many attempts. Please wait 15 minutes before requesting a new code."
9. **OTP NOT RECEIVED:** "Resend code" link below the 6 boxes. Dynamic adds "Check spam" nudge. After resend: link enters cooldown (~30s countdown).
10. **SOCIAL OAUTH REDIRECT:** clicking "Continue with Google" opens OAuth tab/popup. Returns to callback URL. If popup blocked: error state (requires fallback link).
11. **PASSKEY NOT AVAILABLE:** fallback to email OTP or social.
12. **PASSKEY FACE ID UNAVAILABLE:** shake + haptic + "Face ID unavailable" + PIN fallback.
13. **WALLET PROVISION SILENT:** user is simply "in" after auth.
14. **FUNDING SCREEN (empty balance):** "$0.00", "Add Funds" or "Receive" CTA prominent.
15. **FUNDING VIA APPLE PAY:** native Apple Pay sheet. On success: "Purchase complete!" + "Done".
16. **FUNDING COMPLETE/SUCCESS:** explicit celebration screen. Unlike wallet creation (silent), this IS celebrated.
17. **ONRAMP KYC REQUIRED:** camera access, document upload, selfie. Can take several minutes — major drop-off if not warned.
18. **ONRAMP REJECTED (KYC fail):** Stripe session state = "rejected". Needs human-readable explanation + support path.
19. **SESSION EXPIRY:** login modal reappears. Same "Log in or sign up" entry. No data loss for returning user on same device.

#### Vocabulary pattern (verified across all products)

Login verbs are web2: "Log in or sign up", "Continue", "Get started", "Welcome back". The account is never called "wallet" at the login screen. "Gas" and "chain" are absent from onboarding. Funding is framed in "$" (fiat-first). "Seed phrase" is not surfaced in default embedded wallet flows.

#### Real onboarding microcopy

"Log in or sign up" · "your@email.com" · "Enter your email" · "Submit" · "Continue" · "Get started" · "Welcome back" · "Enter confirmation code" · "Please check {fullEmail} for an email from privy.io and enter your code below." · "Confirm verification code" · "We've sent a verification code to {maskedEmail}" · "Didn't get an email? Resend code" · "Did not receive a code? Check spam or Re-send code" · "The code you entered is incorrect. Please try again." · "Protected by ● privy" · "Powered by ● dynamic" · "Welcome to Base App" · "The best place to trade on web and mobile" · "Create a smart wallet" · "Sign up" · "This passkey will only be saved on this device." · "Never lose access" · "Continue with Face ID" · "Great—your Passkey is now stored" · "Face ID unavailable" · "Add Funds" · "store and add funds" · "Amount in USD" · "Buy USDC with Apple Pay" · "Creating order…" · "Purchase complete!" · "Done" · "Cancel" · "Continue with Google" · "Continue with a wallet" · "Prefer phone number sign up? Use phone" · "Work email" · "Copy address" · "a simple 4-digit PIN that is easily memorable" · "tap Send, look at camera, done" (eco.com passkey description) · "Send 50 USDC" (eco.com example action button)

---

### C. Agent Dashboard and Spend Controls

> This is the most nascent surface. Many products are very new (2024–2026). The patterns below
> are verified from primary docs and live products; agentic-UX design patterns from Smashing
> Magazine and Mantlr are documented patterns (not live product code).

#### Products and what they are

- **Ramp:** B2B expense management with per-card spend controls. Slack-based three-button approval: "Approve & Issue" / "Approve w/ Temporary Limit" / "Reject". Out-of-policy flag appears in dashboard 15–30 seconds after transaction. Flag location: bottom-left of transaction detail view.
- **Brex:** corporate card + spend management. Hierarchical budget/spend-limit model with request-and-approve flow, multi-channel notifications (push/SMS/WhatsApp/Slack). 6-second undo window post-approval decision. "Archive spend limit" (can be reopened) / "Reopen" lifecycle.
- **Vercel Spend Management:** three escalating actions at thresholds: notify (50%/75%/100%), webhook, pause all projects. Hard pause requires typing team name to confirm. Paused projects show 503 `DEPLOYMENT_PAUSED` to visitors. CRITICAL: paused projects do NOT auto-resume when limit is raised (documented footgun). `endOfBillingCycle` webhook fired but projects stay paused.
- **Stripe Issuing for Agents:** per-agent virtual cards with programmable spend controls, merchant allowlists, single-use auto-cancel (`cancel_after[payment_count]=1`). Freeze = `status=inactive` (resumable). Cancel = `status=cancelled` (permanent). 2-second human-override window via webhook during real-time authorization. Metadata fields: `agent_id`, `customer_order_id`, `supplier` for reconciliation.
- **Coinbase Agentic Wallets:** MPC-secured crypto wallet for AI agents. Session keys scope authority to max-spend + allowed counterparties + expiry. CDP Portal: usage telemetry and audit trail (timestamp, signer, counterparty per tx). Revocation via EIP-7702 delegation to zero address.
- **Skyfire:** stablecoin rail for AI agents. Dashboard: per-agent spend + where funds went. Per-transaction and time-based limits. "Just-in-time decisioning" routes high-value transactions to human approval queue in real time before transaction proceeds.
- **Payman AI (VERIFIED-LIVE):** dashboard-first agentic platform. Features Execution Trace (timeline per action: customer words verbatim → AI reasoning → policy checks → auth flow → timestamp → "Completed" status badge). Policy engine enforces per-tx and daily limits, recipient whitelist, geo restrictions.
- **Nevermined:** delegation model. User creates a delegation (cap + expiry + tx count limit). Agent gets an API key scoped to that delegation, never the card number. Revocation: "stops on the next request, no waiting period." One card can back multiple simultaneous delegations.
- **Cloudflare AI Gateway:** dollar-denominated spend limits on LLM API calls, scoped by model/provider/custom attribute (user, team, application). At limit: hard 429 block OR fallback to cheaper model via Dynamic Routes. IMPORTANT: no notification system as of July 2026. Spend checks are not continuous — "notifications, webhooks, and project pausing can trigger several minutes after you cross your spend amount."
- **ServiceNow AI Control Tower:** enterprise agent governance. Single-action kill switch: "pause, redirect, or stop any agent, anywhere in the enterprise, in a single action." Severs active sessions, revokes temporary tokens, blocks re-invocation until admin reinstates.
- **Mastercard Agent Pay:** network-level agentic token. Consumer sets spend ceiling + allowed merchants + session lifetime in their issuer bank app. Revocation invalidates the Agentic Token at the Mastercard network — next transaction fails at authorization without card reissuance. Intent Artifact: signed audit trail of original user instructions referenced in each downstream transaction.

#### Spend bar and limit configuration

- Vercel thresholds: web+email at 50%, web+email at 75%, web+email+SMS at 100%.
- Brex notification label (confirmed live): "Notifications when you're approaching or have exceeded the limit amount".
- Brex toggles (confirmed live): "Allow users to see limit amount" (On/Off) / "Allow limit increase requests" / "How much can users exceed this limit?"
- Cloudflare: real-time tracking, 429 block at limit. No percentage thresholds documented.
- Spend limit config fields (Ramp/Brex/Stripe combined): Amount, Reset frequency (Daily/Weekly/Monthly/Quarterly/Annually/Does not repeat), Max per transaction, Allowed/Blocked merchants, Allowed/Blocked categories, Start date, Lock date, Temporary increase toggle, Visibility toggle.
- IMPORTANT LATENCY CAVEAT: both Cloudflare and Vercel explicitly document that notifications, webhooks, and project pausing "can trigger several minutes after you cross your spend amount." Hard caps must be set BELOW true maximum tolerated spend to account for this lag.

#### Revocation spectrum (four verified levels)

1. **Soft pause — resumable, credential intact:** ServiceNow single-click. Vercel: requires typing team name confirmation. Agent halted but re-invocable after admin reinstates.
2. **Freeze — temporarily inactive, resumable:** Stripe `status=inactive`. Nevermined: delegation paused. Agent cannot transact but credential exists.
3. **Cancel/Archive — permanent deactivation, new provisioning needed:** Stripe `status=cancelled`. Brex: "Archive spend limit" (can be reopened). Ramp: "Terminate" (permanent, cannot reopen). Coinbase Agentic Wallets: session key expired.
4. **Nuclear revoke — blockchain/network-level, no recovery without re-provisioning:** Coinbase EIP-7702 delegation to zero address. Mastercard: Agentic Token invalidated at network level — next tx fails at authorization. Permit2: `lockdown()`.

#### Kill-switch confirmation patterns

- Vercel: requires typing team name before confirming project pause.
- Brex: 6-second undo window after approving/denying limit requests.
- ServiceNow: single-click "pause, redirect, or stop any agent, anywhere in the enterprise, in a single action." (confirmed product copy).
- Payman: "Emergency kill switch for instant agent shutdown" is a marketed feature.
- Skyfire: pings human when agent tries to overspend — approval required before transaction proceeds.

#### Autonomy dial / trust levels (documented patterns)

- Smashing Magazine (2026): four-level dial per task type: "Observe & Suggest" (notify only) / "Plan & Propose" (full plan needs review) / "Act with Confirmation" (prepare + final go/no-go) / "Act Autonomously" (independent + post-action notification). Described as a primary UI element, adjustable in real-time, not buried in settings.
- Mantlr: three-position slider: "Suggest" / "Co-pilot" / "Autopilot".

#### Pre-action intent preview (documented pattern, Smashing Magazine 2026)

Header: "Proposed Plan for [Context]". Numbered steps with bold action verbs + description. Three buttons: "Proceed with this Plan" / "Edit Plan" / "Handle it Myself". For high-stakes or financial actions: "Edit Plan" allows step-by-step modification without abandoning the whole plan.

#### Post-action rationale format (documented pattern + Payman production)

Template: "I've [action]." then "Why I took this action:" bullet list, then "[View Details]" link and "[Undo this Action]" with "Undo available for 15 minutes".

Payman Execution Trace (confirmed live): per-entry fields: customer's exact words → AI reasoning → policy checks applied → auth flow → timestamp → "Completed" status badge. Full audit trail available for dispute resolution.

Smashing Magazine error recovery pattern: "We made a mistake on your recent transfer. I apologize. I transferred $250 to the wrong account. ✔ Corrective Action: transfer reversed, $250 refunded. ✔ Next Steps: incident flagged for internal review." [Contact Support]

#### Approval request flow

- Ramp Slack integration (confirmed live): three-button notification: "Approve & Issue" / "Approve w/ Temporary Limit" / "Reject".
- Brex: request visible in "Tasks > Spend request" with approval chain shown. User cannot edit request post-submission — must wait for decision then re-submit.
- Skyfire: high-value transactions routed to real-time human queue. Approval required before transaction proceeds.

#### Risk-tier gating (documented pattern, Mantlr)

- Low-risk: auto-execute + log silently.
- Medium-risk: quick preview + one-click approve.
- High-risk: full preview + explicit confirmation + undo window.
- Escalation prompt (Smashing Magazine): "This transaction seems unusual. Flag for human review? [Yes] [No]"

#### Notification tiering (anti-cry-wolf rule)

- **Tier 1 (ambient/silent):** routine transactions logged only, badge count updates.
- **Tier 2 (banner):** approaching limit, unusual merchant, mid-task update.
- **Tier 3 (interrupt + require action):** over budget, suspicious activity, approval needed.
- Rule (Smashing Magazine, Mantlr): never use the loud tier for routine events or users learn to ignore all alerts.

#### Transaction notification microcopy (MessageFlow fintech patterns, confirmed)

- Declined: "A payment of $349.00 at Online Electronics Store was declined on 03/02/2026 at 6:04 PM."
- Suspicious: "We detected an unusual payment attempt from abroad. View details in the app and confirm whether you recognize this transaction."
- New credential: "A new Visa card ending in 4821 was added to your account. If you didn't authorize this, block the card in the app."

Format rule: title 6-8 words, body ~10 words, mask card to last 4 digits.

#### Single-use / auto-expiring credentials

- Stripe Issuing: `lifecycle_controls[cancel_after][payment_count]=1` auto-cancels after one payment.
- Nevermined: delegations expire by time ("one hour, a day, a week, a month, or a custom window").
- Mastercard Agentic Tokens: expire by session lifetime.
- Pattern: credential lives only as long as the task scope — removes need for manual revocation.

#### Audit trail fields (verified across products)

- Coinbase Agentic Wallets: timestamp + signer + counterparty per tx.
- Payman: customer's exact words + AI reasoning + policy checks + auth flow + timestamp + status.
- Mastercard Intent Artifact: signed record of user's original instructions, referenced in each downstream tx.
- Stripe metadata for agent cards: `agent_id`, `customer_order_id`, `supplier` — enables reconciliation and dispute filing.

#### Full state list (agent spend view)

1. **ACTIVE:** agent operating within budget. Activity feed shows timestamped entries. Spend bar shows X% used. No alerts.
2. **NEAR-LIMIT (approaching):** Vercel: web+email at 50%/75%. Brex: push+email+SMS. Ramp: "automatic reminder gives them a chance to adjust before a violation." Skyfire: human pinged when agent tries to overspend.
3. **AT-LIMIT (100%):** Vercel: web+email+SMS notification. Cloudflare: 429 block or fallback model. Brex: "exceeded the limit amount" notification.
4. **OVER-LIMIT (exceeded without hard block):** OpenAI's billing limits are soft — "API requests will continue to be processed without interruption" even when monthly budget exceeded. Only notifications sent. This is the dangerous state for operators who expect a hard cap.
5. **PAUSED (soft stop, resumable):** Vercel: production deployment shows 503 `DEPLOYMENT_PAUSED`. ServiceNow: agent activity suspended, all active sessions severed. Stripe: `status=inactive`, can be re-activated. Not automatic — operator must manually resume.
6. **REVOKED (hard stop, new provisioning needed):** Stripe `status=cancelled`. Nevermined: delegation revoked. Mastercard: Agentic Token invalidated. Coinbase EIP-7702: zero address. Ramp: "Terminate" (permanent).
7. **FLAGGED / OUT-OF-POLICY:** Ramp creates "Out of Policy" transaction state. Appears in dashboard 15–30 seconds after transaction. Email to cardholder + manager. Three sub-types: out-of-policy, accidental charge, fraudulent.
8. **APPROVAL PENDING:** Brex: visible in "Tasks > Spend request" with approval chain. Ramp: visible in "Funds and Cards > Requests". Slack 3-button notification. User cannot edit post-submission.
9. **TEMPORARY LIMIT ACTIVE:** Ramp shows "one-time increase" indicator. Auto-reverts at start of next spend cycle. "Approve w/ Temporary Limit" option differentiates from permanent approval.
10. **DISPUTED TRANSACTION:** Stripe: agent monitors auth vs settlement amounts; files dispute via POST `/issuing/disputes`; tracked via `issuing_dispute.updated` webhook. Ramp: "three-dot kebab > dispute options".
11. **BILLING CYCLE RESET:** Vercel sends `endOfBillingCycle` webhook. Paused projects do NOT auto-resume.
12. **WEBHOOK NOTIFICATION FAILURE:** Cloudflare and Vercel both document that spend alerts can lag "several minutes." Design implication: set spend cap below true maximum to absorb lag.
13. **BALANCE/FLOAT (crypto agents):** current USDC available. USD-denominated display.
14. **PENDING PAYMENT (crypto):** a `402` answered, awaiting facilitator `/settle`. Spinner / "Processing".
15. **SETTLED RECEIPT ROW:** amount, asset, network, `payTo`, `txHash` (links to block explorer), timestamp, which tool/URL triggered it, `success=true`.
16. **FAILED/BOUNCED (crypto):** settlement failed / funds refunded to refund address. Retryable.

#### Agent dashboard microcopy (confirmed live products)

- Payman: "Done. $142.50 to ConEd. Confirmation sent."
- Payman: "Done. I've moved $500 from savings to checking. Your rent payment is covered."
- Payman: "$847 across 12 transactions this month. Up 15% from last month."
- Payman: "Message passed all safety checks"
- Payman: "Broke down request into 3 tasks. Used 3 tools to complete task."
- Payman tagline: "Your rules. Enforced automatically."
- Catena taglines: "Agent Action, Human Control." / "Your team sets the rules. Agents execute within them."
- Smashing Magazine pattern: "Proceed with this Plan" / "Edit Plan" / "Handle it Myself"
- Smashing Magazine pattern: "I've rebooked your canceled flight. Why I took this action: your original flight was canceled, and you pre-approved autonomous rebooking for same-day non-stop flights."
- Smashing Magazine pattern: "Undo available for 15 minutes"
- Smashing Magazine pattern: "This transaction seems unusual. Flag for human review? [Yes] [No]"
- Ramp Slack buttons (confirmed live): "Approve & Issue" / "Approve w/ Temporary Limit" / "Reject"
- Brex config labels (confirmed live): "Notifications when you're approaching or have exceeded the limit amount" / "Allow users to see limit amount" / "Allow limit increase requests" / "How much can users exceed this limit?"
- Brex lifecycle labels (confirmed live): "Archive spend limit" / "Reopen"
- Vercel (confirmed live): "Pause production deployment" switch + team-name confirmation field. Paused state shown to visitors: "503 DEPLOYMENT_PAUSED"
- Nevermined (confirmed): "Revoke it by hand and it stops on the next request, no waiting period." / "Every charge is checked server-side against the cap, the clock, and the transaction count — cross any line and the delegation is spent."
- OpenAI soft-limit caveat (confirmed): "API requests will continue to be processed without interruption" even when budget exceeded — alerts only, not a hard cap.
- Smashing Magazine autonomy levels: "Observe & Suggest" / "Plan & Propose" / "Act with Confirmation" / "Act Autonomously"
- Mantlr autonomy slider: "Suggest" / "Co-pilot" / "Autopilot"
- ServiceNow kill switch copy: "the ability to pause, redirect, or stop any agent, anywhere in the enterprise, in a single action"

---

### D. Developer-Tool DX

#### Quickstart structure across reference products

| Product | Steps | CLI-first? | Test mode default? |
|---|---|---|---|
| Resend | 4 | No | N/A (API key scoped) |
| Clerk (Next.js) | 7 | Yes (`clerk init`) | Yes |
| Stripe (Node.js) | 10 | Yes (Stripe CLI) | Yes |

Each step contains exactly one action and one code block. Steps do not branch. Short imperative titles only — "Install", "Set your API key", "Send email using HTML", "Try it yourself" (Resend).

- **Stripe:** install CLI → authenticate (`stripe login`) → create product → create price → check Node → `npm init` → `npm install stripe` → run first request. CLI authenticates and scaffolds so the SDK installs into an already-configured environment. 15 total quickstarts across Payments, Platforms, Developer resources categories. Each quickstart: "full end-to-end interactive code samples" with "step-by-step instructions that highlight lines of code as you scroll down the page". Option to download or launch with Stripe's AI assistant in VS Code.
- **Clerk:** 11 official framework quickstarts (Next.js, React, Vue, Nuxt, Astro, React Router, Expo, Android, iOS, Chrome Extension, JavaScript). Before step 1, CLI presents a 4-item checklist and asks "Shall I proceed?" before scaffolding. `clerk doctor` is the health check command. Manual fallback at step 4 if CLI is not used.
- **Resend:** 4 steps. Step subtitles: "Get the Resend Node.js SDK." / "Store your API key in an environment variable in your .env file." / "The easiest way to send an email is by using the html parameter." / (try it). TypeScript-first with `{ data, error }` destructuring. React Email support for JSX templates. Key format prefix: `re_`.

#### Test/live mode (universal pattern)

- All products start developers in test mode by default.
- Stripe key prefix encodes mode visually: `pk_test_` / `sk_test_` vs `pk_live_` / `sk_live_`. A developer can verify mode by reading their `.env` key prefix.
- LemonSqueezy: test mode toggle at bottom-left of admin panel. Separate test/live environments with separate products/customers/purchases. Going live requires creating a new API key in live mode. Per-subscription "Simulate event" option in test mode side panel.
- Stripe distinguishes simple test mode (same account, different key prefix) from Sandboxes (fully separate isolated environments with own user access, API keys, and settings). Dashboard pages notify and disable live settings while in sandbox. Changing settings in sandbox can also change live mode settings — documented risk.

#### API key one-time-view flow (universal pattern)

Flow: create → view/copy in modal → confirm saved → modal closes. After close, key is no longer retrievable in plaintext.

- Resend modal warning: "For security reasons, you can only view the API Key once."
- Stripe: "Save the key value. You can't retrieve it later." Clicking the key value itself copies it — no separate copy button. Expiration status shown as countdown below key name.
- Live-mode restriction: Stripe live-mode developer-created RAKs cannot be re-revealed after first view. "You can reveal only live-mode RAKs that we created for you. If you create a RAK yourself, you can't reveal it after you've seen it once." Reveal flow: "Reveal live key" → click value to copy → "Hide live key."
- If developer misses the copy step: delete and create a new key. No recovery path.

#### API key permission scoping

- Resend: "Sending access" (email only) vs "Full access" (create, delete, get, and update any resource) — "can be updated at any time".
- Stripe Restricted API Keys (RAKs): granular per-resource permissions + optional IP restriction. Overflow/kebab menu per key: Edit key / Manage IP restrictions / Expire key / Rotate key / Restore access / View request logs.
- Both frame scoped keys as security best practice.
- Stripe security warnings on key page: "Store sensitive keys in a secrets vault" / "Don't put keys in source code or configuration files checked into version control" / "Don't share keys over email, chat, or other unencrypted channels".
- Stripe publishable key callout: "It's safe to embed this key in your code or apps."

#### Stripe Workbench (8 tabs, confirmed)

Tabs: Overview / Errors / Inspector / Logs / Health / Events / Webhooks / Shell. Inspector: JSON view of any API object + related Logs and Events sub-tabs. Health: 30-day history. Shell: browser command-line. "Edit in API Explorer" button appears in sandbox mode only (not in live mode).

Controls: "Maximize" / "Minimize" / "Expand" / "Collapse Workbench" / "Copy link" / "Send feedback" / "Refresh logs" / "Refresh events" / "Add destination" / "Manage" / "Run" / "API Explorer" / "Auto-inspect".

Feature gating: v2 API request logs, thin events, and event destinations are Workbench-only — not in older Developers Dashboard. New Stripe accounts get Workbench by default; older accounts may still be on the Developers Dashboard.

#### x402 payer SDK shape (the agent integration path)

The canonical x402 integration is an SDK middleware wrapped ONCE around `fetch`/`axios` — NOT a CLI, not (by default) an MCP server. Two generations coexist:

**V2 (current):** `@x402/fetch` (`wrapFetchWithPayment`) or `@x402/axios` (`wrapAxiosWithPayment`) + a mechanism package `@x402/evm` (EVM) / `@x402/svm` (Solana). Build an `x402Client`, register a scheme, then wrap fetch.

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPay = wrapFetchWithPayment(fetch, client);
const res = await fetchWithPay("https://api.example.com/paid-endpoint"); // 402 handled inside
```

**V1 (still widely shown):** `x402-fetch` (`wrapFetchWithPayment(fetch, walletClient)`) or `x402-axios` (`withPaymentInterceptor(axios.create(...), walletClient)`) taking a viem `walletClient` directly.

Other payer shapes (situational): MCP-tool agents → `x402-mcp` (wrap MCP client with `withPayment({ account })`). CLI exists for humans/scripts, not the inner agent loop. AgentKit / CDP plug in as the signer/wallet behind the same wrappers.

TypeScript packages (GitHub): `@x402/core`, `@x402/evm`, `@x402/svm`, `@x402/stellar`, `@x402/axios`, `@x402/fastify`, `@x402/fetch`, `@x402/express`, `@x402/hono`, `@x402/next`, `@x402/paywall`, `@x402/extensions`. Python and Go also available.

The protocol loop the SDK hides: request → `402` with payment requirements (`scheme:"exact"`, `network`, `maxAmountRequired`, `asset`, `payTo`, `resource`, `maxTimeoutSeconds`, `extra`) → client signs a gasless EIP-3009 `transferWithAuthorization` over USDC (off-chain, no gas) → retry with payment header → facilitator `/verify` then `/settle` (facilitator broadcasts, not the agent) → `200` + settlement receipt header.

Header naming is version-dependent: V1 uses `X-PAYMENT` (request) / `X-PAYMENT-RESPONSE` (settlement). V2 introduces `PAYMENT-REQUIRED` / signed offers. Verify against the exact version at build.

#### DX microcopy (confirmed)

- Stripe API key creation flow: "Create secret key" → "Key name" → "Create" → "Click the key value to copy it" → "Save the key value. You can't retrieve it later." → "Add a note" → "Done"
- Resend step titles: "Install" / "Set your API key" / "Send email using HTML" / "Try it yourself"
- Resend step 2 subtitle: "Store your API key in an environment variable in your .env file."
- Resend API key modal: "For security reasons, you can only view the API Key once."
- Resend permissions: "Sending access" / "Full access"
- Clerk CLI dialog: "Here's what I'll do to get you set up with Clerk. 1. Install or update the Clerk CLI 2. Sign in to Clerk (opens your browser) 3. Set up Clerk in this project, or scaffold a new Next.js app with Clerk if this directory is empty 4. Start your app with Clerk installed. Shall I proceed?"
- Clerk health check: `clerk doctor`
- x402 homepage headline: "x402 — Payment Required | Internet-Native Payments Standard"
- x402 subheadline: "An open standard for internet-native payments that empowers agentic payments at scale"
- x402 integration claim: "a single line of code" for merchants; "1 line for the server, 1 function for the client" (GitHub README). Note: actual quickstart is multi-step — this is marketing framing.
- x402 agent flow (homepage): 3 steps — "receive the response, pay with stablecoins, and gain access"
- Stripe developer resources subtitle: "Learn how to use SDKs, API keys, and integration tools."

---

### E. x402 Network and Asset Coverage (Corrected Facts)

> Explicitly correcting the earlier "Base-only" mental model. Source: CDP x402 docs, GitHub
> coinbase/x402, internal `x402-payer-mechanics.md`. Time-sensitive — re-check at build.

#### Protocol scope vs. facilitator scope — these are different things

The x402 spec registers networks via CAIP-2 identifiers. Any EVM chain is supported via `eip155:<chainId>` without modifying source files ("dynamic network registration"). New EVM chains added via runtime config. What the spec supports and what a specific facilitator has deployed are separate concerns. A merchant can run their own facilitator for any supported chain.

#### Coinbase CDP Facilitator (free, public, production)

- **Active (V1 + V2):** Base (eip155:8453), Polygon (eip155:137), Arbitrum One (eip155:42161), World (eip155:480), Solana Mainnet.
- **"Reference only" — NOT active in CDP facilitator as of mid-2026:** Ethereum Mainnet (eip155:1), Optimism (eip155:10), Avalanche C-Chain (eip155:43114). Developers targeting these chains must run a custom facilitator.
- **Testnet:** Base Sepolia, World Sepolia, Solana Devnet. Coinbase CDP also covers Stellar Testnet.
- CDP hosted facilitator endpoint: `https://api.cdp.coinbase.com/platform/v2/x402`

#### OpenZeppelin / Stellar Facilitator (production, launched March 2026)

- Mainnet endpoint: `https://channels.openzeppelin.com/x402`
- Testnet endpoint: `https://channels.openzeppelin.com/x402/testnet`
- Built as OpenZeppelin Relayer plugin. Supports any SEP-41 compliant token; default is USDC.

#### Token standard mapping per ecosystem

| Network/Ecosystem | Default asset | Token standard | Notes |
|---|---|---|---|
| EVM (all) | USDC / EURC | EIP-3009 (`transferWithAuthorization`) or Permit2 (generic ERC-20) | Gasless for payer |
| Solana V1 | USDC | SPL | |
| Solana V2 | USDC | SPL or Token-2022 | Token-2022 is V2-only |
| TON | **USDT (not USDC)** | TEP-74 jettons | Only major network where default is USDT |
| Stellar | USDC | SEP-41 | **7 decimal places** (vs 6 on EVM/Solana) — facilitators must handle explicitly |
| Algorand | USDC | ASA | |
| Aptos / Hedera / Keeta | Native fungible tokens | Chain-specific | |
| Hedera | **HBAR (native volatile token)** alongside USDC | Chain-specific | Only non-stablecoin default in the spec |
| Concordium | None configured | — | Protocol-level support only; no facilitator listed |

#### Signer requirement — x402 does NOT compose with chain-abstracted unified balances

x402 settles atomically against an on-chain `balanceOf(from)` on the EXACT network. USDC must already sit at the agent's address on the chosen network. In 7702 mode the UA address IS the EOA (same key), so it CAN sign the EIP-3009 authorization. A 4337 / smart-account signer CANNOT (EIP-3009 needs `ecrecover`, not EIP-1271). Right pattern: the agent holds a small USDC float on the settlement network for x402, and a chain-abstraction SDK is used separately to top up that float. The two do not compose into "x402 pays directly from the unified balance."

#### V2-only features

- Token-2022 on Solana (V1 supports SPL only)
- Wallet-based session reuse
- Automatic service discovery via `@x402/extensions`
- Dynamic payTo routing
- Sign-In-With-X (SIWx) wallet identity: flagged as "immediate fast-follow" at V2 launch — NOT in initial V2 release.

---

## Inferences

These cross-product patterns are inferred from convergence across multiple sources. They are not confirmed facts from a single source.

1. **One-tap is the dominant win pattern.** Apple Pay (Face ID), Daimo (single source transfer), Shop Pay (one-tap saved card), Stripe Link (email recognized → OTP → tap) all collapse the flow to one authenticate/confirm and treat that action as complete. Recurs across 4+ shipped products.

2. **Optimistic instant-success beats truthful blockchain-exposed waiting.** Winners (Apple Pay, Daimo, Stripe) flip to success the moment the user's obligation is captured and background all settlement. Laggards (Coinbase Commerce hosted, generic crypto widgets) expose a countdown + "waiting for confirmations" and feel slow. The anti-pattern has a name: Coinbase Commerce hosted is its own documented anti-pattern.

3. **The pay button IS the state machine.** idle (CTA + amount) → processing (disabled + spinner / "Processing…") → success (label morphs to "View payment details" / "Done"). Recurs identically in Stripe, OnchainKit, Apple Pay, Shop Pay.

4. **Silent wallet creation + celebrated funding completion is deliberate asymmetry.** Wallet provisioning is silent across all embedded wallet products; the money-in moment always gets an explicit confirmation screen. Consistent across 5+ products. Inference: creation is infrastructure, funding is the first meaningful user moment.

5. **Hide all chain/gas/bridge/fee language in user-facing flows.** Explicit in Daimo ("swaps, bridges, and gas are hidden"); consistent with Stripe crypto hiding signing mechanics; consistent with onboarding vocabulary avoidance. Strong cross-product convergence.

6. **Revocation architecture determines UX options.** The distinction between soft-pause / freeze / cancel / nuclear-revoke maps directly to what the underlying credential supports. Smart-account delegation (EIP-7702, Permit2, Mastercard Agentic Token, session keys) is what enables the full revocation spectrum. EOA private key → only cancel.

7. **Notification fatigue design is converging on a three-tier model.** Ramp, Brex, Vercel, Smashing Magazine agentic-UX, and Mantlr all describe the same silent/banner/interrupt structure with the same explicit rule: never use the loud tier for routine events.

8. **Embedded in-page widget out-converts redirect.** Self-reported across SpacePay and implied by Stripe pushing embedded Payment Element. ~34% figure is vendor-reported; not independently audited. Directionally consistent across multiple products.

9. **An agent-spend dashboard has no incumbent template.** No shipped first-party "agent spend screen" was found as a consumer product. The composition is assembled from: per-payment receipt data + read-only balance + app-layer control (pause/revoke). The pattern space is being established in real time by Payman, Skyfire, Coinbase CDP Portal.

10. **SDK DX converges on "single component + server intent + webhook."** Stripe, Daimo, OnchainKit, and generic widgets all present this shape. The x402 payer path is the agent-side analog (wrap-fetch-once). The "one line of code" marketing framing is a pattern, not literal — actual quickstarts are 4–10 steps.

11. **The 6-box OTP screen with auto-submit is the de facto standard for embedded wallet auth.** Privy and Dynamic converged on identical structure independently. Consistent with banking mobile OTP patterns. Treat as the settled convention.

12. **Motion carries semantic meaning.** Animated checkmark = finality. Spinner = progress. Morphing button label = work-in-progress. Shake animation = validation failure. Recurs across Stripe, Apple Pay, Dynamic (envelope animation), OnchainKit. This is a design language, not decoration.

---

## Unknowns and Questions

- **Exact crypto-checkout success/receipt microcopy is under-specified.** Most concrete success copy above is Stripe/Apple Pay (fiat). Daimo/OnchainKit expose states and button labels but not a full standardized success-screen copy deck. Treat crypto success copy as bespoke, not an industry standard.
- **No standardized first-party agent-spend dashboard UI or copy.** Whether CDP/AgentKit ships a turnkey hosted payer "spend dashboard" was NOT confirmed. The receipt data and on-chain `txHash` exist; a consumer ledger screen is unverified. Assemble from receipts.
- **Exact microcopy for OnchainKit error state.** Lifecycle statuses documented (init/pending/fetchingData/success/error) but the visible copy for the error state was not confirmed in primary docs.
- **Stripe stablecoin exact wallet-connection modal copy.** Flow documented at the step level but specific inline label copy for wallet connection and network selection was not captured.
- **Skyfire spend-threshold specifics.** No specific percentage threshold documented for when the human-ping fires — only "when agent tries to overspend."
- **Cloudflare AI Gateway notification system.** Explicitly documented as not yet available as of July 2026. No microcopy to cite.
- **Daimo Pay merchant-configured intent verb set.** "Pay/Deposit/Add Money" mentioned in docs but no canonical list of all supported values confirmed.
- **Phantom $1k/day limit hit microcopy.** The limit exists and is set during PIN creation, but copy shown when the limit is hit was not confirmed in primary docs.
- **x402 SIWx (Sign-In-With-X).** Flagged as "immediate fast-follow" at V2 launch. As of mid-2026, no public implementation or UX documentation available.
- **Brex 6-second undo window — exact UI copy.** Confirmed as a feature but the exact banner copy was not captured from primary docs.
- **Dynamic vs Privy returning-user new-device experience.** New-device recovery path documented conceptually but not stepped through live. May be a dead end — unconfirmed.
- **x402 header/version specifics in flux.** V1 `X-PAYMENT` / `X-PAYMENT-RESPONSE` vs V2 `PAYMENT-REQUIRED` / signed offers. Which the target tooling expects is unverified — verify against the exact version at build.
- **CDP facilitator Arbitrum support at build time.** Listed as active as of mid-2026 but this is time-sensitive; re-check.
- **No native cryptographic "leash" on a Particle UA.** Particle session keys (Biconomy v2.0.0) do NOT compose with a UA in 7702 mode. A spend cap / allowlist / revoke is an APP-LAYER policy around a server-held key, not an on-chain session key. Whether an app-layer leash reads as sufficient (for judges/users) is unverified.
- **No documented native mobile UA-7702 signing path.** A phone-side on-chain signature (e.g. human-signed on-chain revoke) is undocumented for Particle UA. Architecture: mobile monitor/notify/revoke needs no on-device signing (verified), but human-signed on-chain revoke from phone remains unverified.
- **Vendor-reported conversion deltas** (34% embedded>redirect; Shop Pay ~4x; Magic 3x; MoonPay +6%/+20%) are self-reported, not independently audited.

---

## Not Included

- **NO design proposals for our (Tab/Leash) product.** This brief excludes any "Tab does X" / "Leash screen looks like Y" recommendation. The `tab-architecture.md` source contains design synthesis of OUR concept; only its factual primitives were extracted here.
- **NO architecture** for our product (component tree, data flow, service boundaries).
- **NO implementation** (no code beyond quoting real SDK signatures/loops as reference facts).
- **NO wedge/positioning/novelty judgment** — that lives in the idea-research artifacts.
- **NO UX proposals** derived from the patterns above. The designer draws from these facts; the brief does not draw conclusions about what Tab or Leash should look like.
- Those are later gates: spec → stories → designer brief → plan → build.
