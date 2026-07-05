# UX Research — Embedded-Wallet / Email-Login Onboarding

Reality research for Abu's AI designer agent. Scope: buyer login + Leash funding flow.
Discipline: CURRENT REALITY ONLY. No proposals for "our" design. UX/flow facts only.

Legend:
- **[VERIFIED-LIVE]** = I loaded the real product in a browser on 2026-07-02 and read the actual screen. Highest confidence.
- **[VERIFIED-DOC]** = quoted from the product's own docs/help/marketing.
- **[INFERENCE]** = reasoning or third-party teardown, not confirmed at source.

Products studied: Privy, Dynamic (a Fireblocks company), Coinbase Smart Wallet / Base Account (Base App), Magic (MagicLabs), MetaMask Embedded Wallets (ex-Web3Auth), Coinbase Onramp, Phantom embedded, Rainbow.

---

## 1. PRIVY — email OTP login modal  [VERIFIED-LIVE at demo.privy.io]

### Screen A — Login/signup entry (single combined screen)
- Modal is a centered rounded card. Product logo at top (app's own branding; demo shows "privy" wordmark).
- Header (large, centered): **"Log in or sign up"**
- Row 1 = email field: envelope icon + placeholder **"your@email.com"**, with an inline **"Submit"** button on the right edge of the same field (button is greyed/disabled until a valid-looking email is typed).
- Below the email field, stacked full-width social buttons, each = icon + label:
  - **"Google"**, **"Discord"**, **"Other socials"** (opens more), **"Continue with a wallet"** (external wallet path).
- No password field anywhere. No "wallet", "seed", "gas", or "chain" words on this screen.
- Note: "Log in" and "sign up" are merged into ONE verb — the same flow handles new + returning users; the UI never asks "do you have an account?".

### Screen B — OTP / confirmation code (after Submit)
- Back arrow (top-left) to return to Screen A.
- Centered circular envelope icon (grey).
- Header: **"Enter confirmation code"**
- Body copy (exact): **"Please check demo-test-uxresearch@example.com for an email from privy.io and enter your code below."** (the user's email is echoed inline, bolded).
- **6 separate single-character input boxes** (not one text field). Auto-advances between boxes as you type; auto-submits when the 6th digit is entered (no explicit "Verify" button).
- Below boxes: **"Didn't get an email? Resend code"** — "Resend code" is the accent-colored link.
- Footer: **"Protected by ● privy"** (Privy attribution lockup).

### Screen B — ERROR state  [VERIFIED-LIVE]
- On a wrong code, the **6 boxes turn red/pink-tinted and clear themselves** for re-entry.
- NOTABLE: Privy shows **NO error text sentence** — the color change on the boxes IS the entire error signal. (Contrast Dynamic below, which shows a text banner.)

### Wallet creation (what user sees vs not)
- **[VERIFIED-DOC]** After the code verifies, the user is simply "logged in." The embedded wallet is "generated and linked to the user object upon authentication" — there is NO separate wallet-creation screen, no seed-phrase screen, no "your wallet is ready" celebration in the default flow. (docs.privy.io quickstart)
- **[VERIFIED-DOC]** Privy's SDK exposes the flow as a state machine the app can render against: states are `'initial' | 'sending-code' | 'awaiting-code-input' | 'submitting-code' | 'done' | 'error'` (useLoginWithEmail). This maps 1:1 to: enter email → loading → OTP entry → loading → success/error.

### Session / returning user  [VERIFIED-DOC]
- Sessions persist; refresh tokens managed by SDK. Returning user on the SAME device/browser is silently re-authenticated (no modal).
- **CRITICAL REALITY:** "Embedded wallets do NOT persist across browsers or devices — the device share is stored in browser local storage. A user logging in on a new device must complete recovery (or re-create a wallet)." So "returning user on a NEW device" is a distinct, heavier state (recovery), not a silent login.

Sources: https://demo.privy.io/ ; https://docs.privy.io/basics/react/quickstart ; https://docs.privy.io/guide/expo/authentication/email ; https://docs.privy.io/basics/react-native/advanced/automatic-wallet-creation

---

## 2. DYNAMIC — email OTP login widget  [VERIFIED-LIVE at demo.dynamic.xyz]

### Screen A — Login/signup entry
- Card, right-aligned in demo. Header: **"Log in or sign up"**
- Email field, full width, placeholder **"Enter your email"**.
- Primary button **"Continue"** directly under the field — greyed/**disabled until email entered** (does not sit inside the field like Privy; it's a separate full-width button).
- Secondary line: **"Prefer phone number sign up?"** with an accent link **"Use phone"** on the right.
- Divider text: **"OR"**
- **"Continue with Google"** (full-width, Google "G" logo).
- Row of icon-only social buttons: Apple, Coinbase, Phantom, GitHub, and a **"..."** (more) overflow button.
- Divider **"OR"**, then **"Continue with a wallet"** (external wallet).

### Screen B — OTP entry (after Continue)
- Back arrow (top-left).
- Header: **"Confirm verification code"**
- Centered blue envelope icon **with an animated loading arc** sweeping under it (motion: subtle spinner while it's waiting for input/verifying).
- Body: **"We've sent a verification code to demo...arch@example.com"** — NOTE Dynamic **masks/truncates the email** (middle elided to `demo...arch@example.com`), unlike Privy which shows the full address.
- **6 separate input boxes**. Auto-advance; verifies automatically on 6th digit.
- Below: **"Did not receive a code? Check spam or Re-send code"** ("Re-send code" is the accent link; note the extra "Check spam" nudge vs Privy).
- Footer: **"Powered by ● dynamic"**.

### Screen B — ERROR state  [VERIFIED-LIVE]
- A **pink/red banner appears at the top of the card** with exact text: **"The code you entered is incorrect. Please try again."**
- Simultaneously the **6 boxes turn red-outlined**.
- Footer swaps to legal row: "Terms of service · Privacy policy · Made with ♥ by dynamic".

### Wallet creation / passkey  [VERIFIED-DOC]
- After email/social auth, Dynamic can prompt: "users are prompted to create a passkey with their device (e.g., biometrics). This grants them a wallet and enables transaction signing." So Dynamic optionally inserts a passkey step; the wallet itself is "invisibly created" (their words) with TSS-MPC (no full private key ever exists).

Sources: https://demo.dynamic.xyz/ ; https://www.dynamic.xyz/features/wallet-creation ; https://www.dynamic.xyz/blog/embedded-wallets-with-social-login-the-standard-for-web3-onboarding

### PRIVY vs DYNAMIC — the concrete diffs a designer must notice
- Submit button placement: Privy = inline inside email field ("Submit"); Dynamic = separate full-width button under field ("Continue").
- Email echo on OTP screen: Privy = full address, bold; Dynamic = masked (`demo...arch@…`).
- OTP error: Privy = red boxes only, NO text; Dynamic = red text banner ("The code you entered is incorrect. Please try again.") + red boxes.
- Resend copy: Privy "Didn't get an email? Resend code"; Dynamic "Did not receive a code? Check spam or Re-send code".
- Both: identical shell = "Log in or sign up" header, 6-box auto-advancing/auto-submitting OTP, back arrow, "Powered by/Protected by" attribution footer, disabled primary until input, no password, no seed phrase.

---

## 3. COINBASE SMART WALLET → now "Base Account" / Base App

### keys.coinbase.com now 302-redirects to base.app  [VERIFIED-LIVE]
- The standalone Coinbase Smart Wallet onboarding page has been folded into **Base App**.

### Base App welcome screen  [VERIFIED-LIVE at base.app]
- Full-screen, split layout. Left: Base logo mark (blue tilted-square).
- Header: **"Welcome to Base App"**
- Subtitle: **"The best place to trade on web and mobile"**
- Single primary CTA: pill-shaped full-width blue button **"Continue"**. (On click it enters a lighter-purple loading/pending state before the next step — the passkey/auth handoff.)
- Right panel: auto-advancing marketing carousel (paginated dots) — slide "Search & Swap In Seconds" / "Find any token and trade it with the [fewest?] taps", plus a **"Scan to download"** QR to get the mobile app.
- Footer links: **Terms of Service · Affiliate Program · Get support · Privacy Policy**.
- NOTE: entry screen has NO email field visible and NO "wallet" word — it's a single "Continue" that leads into the passkey flow.

### Passkey creation / sign-in flow  [VERIFIED-DOC + INFERENCE]
- Historical Coinbase Smart Wallet popup sequence: button **"Create a smart wallet"** → popup → **"Sign up"** → choose passkey save location (this device / phone) → OS biometric prompt (Face ID / Touch ID / Android biometrics).
- Passkey creation warning copy quoted in teardown: **"This passkey will only be saved on this device."**
- Recovery screen heading quoted: **"Never lose access"** (offers a backup recovery key).
- Coinbase claims passkey signup completes in **~15 seconds** vs "several minutes" traditional; **one biometric prompt, no app install**; wallet deployed on Base.
- Returning user: sees a "Sign in with Base"/"Coinbase Smart Wallet" popup that still requires the biometric/passkey tap to authorize; the app never sees the key.
- After creation: user lands on wallet.coinbase.com/assets (historically), signed in, with a **"Receive"** button to deposit and a wallet icon to connect more wallets.

Sources: https://keys.coinbase.com/ (redirects base.app) ; https://help.coinbase.com/en/wallet/getting-started/smart-wallet ; https://help.coinbase.com/en/wallet/getting-started/smart-wallet-passkeys ; https://splits.org/help/coinbase-smart-wallet-passkeys/ ; https://github.com/coinbase/smart-wallet

---

## 4. MAGIC (MagicLabs) — email OTP

### Magic's OWN dashboard auth (built on Magic)  [VERIFIED-LIVE at dashboard.magic.link]
- Returning-user framing: header **"Welcome back"**.
- Field label **"Work email"**, placeholder **"hiro@magic.link"**.
- Primary button **"Log in"** (greyed/disabled until email typed).
- Divider + **"No account?"** … **"Sign up"** (link, right-aligned).
- Support bubble bottom-right: **"Need help? The team typically replies in a few hours."**
- If email has no account, routes to signup: header **"Sign up for free"**, same **"Work Email"** field prefilled, a **consent checkbox** "I agree to the Terms of Service, Privacy Statement, and API & SDK License Agreement.", primary **"Get started"** (disabled until checkbox), **"Have an account? Log in"**, and reCAPTCHA legal footer.
- (This is MagicLabs' B2B dashboard, not the consumer embedded-wallet OTP modal — but it demonstrates Magic's own microcopy voice: "Welcome back", "Log in", "Sign up for free", single email field, no password.)

### Consumer embedded-wallet email-OTP modal  [VERIFIED-DOC + INFERENCE]
- Developer calls `loginWithEmailOTP({ email, showUI })`.
  - `showUI: true` → Magic renders its **pre-built modal/overlay** that directs the user to enter the one-time passcode. No custom code needed.
  - `showUI: false` → no Magic UI; app builds its own OTP screen and drives the flow via events.
- `connectWithUI()` shows Magic's full **Login UI**; Magic "will handle authentication using Email OTP with no additional code."
- Magic explicitly = **passwordless, no seed phrases**; wallet + key management happen behind the scenes across 20+ chains.
- Magic's stance: **Email OTP > magic link** — cites up to **3x higher conversion** and **~10s faster** than clicking a magic link. (So the dominant real pattern is a code, not a clickable link.)
- Magic's modal is describable as: a Magic-branded popup after the app submits the email, containing the code-entry field; it is "hide-able" (can be suppressed with showUI:false).

Sources: https://dashboard.magic.link/login ; https://docs.magic.link/embedded-wallets/authentication/login/email-otp ; https://magic.link/posts/magic-evm-nextjs-guide ; https://docs.fortmatic.com/faq

---

## 5. FUNDING / DEPOSIT screens (directly relevant to Leash funding)

### Coinbase Onramp — Apple Pay (React Native)  [VERIFIED-DOC]
Concrete screen sequence + microcopy from CDP docs:
1. **Order form**: amount text input labeled **"Amount in USD"** (`keyboardType="decimal-pad"` → numeric keypad).
2. **Action button**: **"Buy USDC with Apple Pay"** → shows **"Creating order..."** while processing.
3. **Payment**: native **Apple Pay sheet** renders automatically (ApplePayButton).
4. **Completion**: **"Purchase complete!"** with a **"Done"** button.
- **"Cancel"** button available to reset flow at payment stage.
- Verification error codes surface `requires_email` / `requires_sms` → app shows a verification sub-UI.
- **Guest checkout** for eligible US users: buy crypto with Apple Pay **without creating a Coinbase account**. "getting onchain only takes seconds."
- Design ethos quoted: "Every extra screen in onboarding is just an opportunity for users to bail." → funding is embedded inline, minimal screens.

### MetaMask Embedded Wallets (ex-Web3Auth) — funding  [VERIFIED-DOC]
- Entry button: **"Add Funds"** on the Wallet Services UI.
- Options presented: **Fund by card** ("purchase crypto using a credit or debit card") or **Fund by QR code** ("fund their wallet by scanning a QR code with another wallet").
- Fiat on-ramp aggregator: "Buy crypto with card, bank transfer, or local payment methods" — 100+ payment methods; supports debit card, Apple Pay, Google Pay.
- Transfer-from-wallet path = 3 steps: (1) display embedded wallet address (or QR), (2) user sends from external wallet, (3) "Confirm the deposit and update balances in your app."

### Privy — funding  [VERIFIED-DOC]
- One-click funding from **cards, ACH, and exchanges**; plus "transfer from wallets."
- If user won't connect an external wallet, Privy shows **the embedded wallet address + a QR code** for manual transfer (classic Receive screen).
- Framing quoted: "Sending or receiving crypto inside an app feels like a standard checkout or transfer flow, with clear confirmations and no context switching."

### Receive/deposit screen conventions (cross-product)  [VERIFIED-DOC + INFERENCE]
- Standard "Receive" screen = **QR code + wallet address string + "Copy address" button**; often a network/asset selector and a "Only send X on Y network" caution line. (Coinbase/Base send-receive help; Ledger deposit screens.)
- Balance display trend: apps surface **fiat balance first** (e.g., "$0.00"), with token amounts secondary; "range from full transaction histories to simpler concepts such as balances or rewards" (Privy).

Sources: https://docs.cdp.coinbase.com/embedded-wallets/onramp/apple-pay ; https://docs.metamask.io/embedded-wallets/features/funding/ ; https://docs.privy.io/wallets/funding/methods/wallet ; https://www.coinbase.com/blog/Fiat-to-crypto-in-seconds-with-Apple-Pay ; https://help.coinbase.com/en-au/wallet/sending-and-receiving/how-do-i-send-and-receive-crypto-through-wallet

---

## 6. PHANTOM embedded / seedless  [VERIFIED-DOC]
- Entry offers **two options**: (1) "create a wallet with Google or Apple" and (2) "recover a previously created wallet."
- Flow (Phantom Connect): authenticate with **Google or Apple** → set a **4-digit PIN** ("a simple 4-digit PIN that is easily memorable") → approve required permissions / spending limits → connected embedded wallet returned.
- Wallet creation is invisible: "On the user's device, a new seed is generated… neither the seed nor symmetric key [is] sent off device."
- New social user → brand-new embedded wallet; existing seedless user → existing wallet "securely converted into an embedded wallet."
- Recovery: forgot PIN is recoverable as long as one device still has the wallet.
- Vocabulary: Phantom calls these **"seedless wallet"** / **"email wallet"** publicly (avoids "seed phrase").

Sources: https://docs.phantom.com/phantom-connect ; https://phantom.com/learn/blog/deep-dive-log-in-to-phantom-with-email ; https://phantom.com/learn/crypto-101/embedded-wallets

---

## 7. RAINBOW (contrast: self-custody, seed-optional)  [VERIFIED-DOC]
- First run: tap **"Get a new wallet"** → choose backup method.
- Rainbow does NOT force manual seed-phrase handling at onboarding: offers **instant cloud "Backup" feature** (default), OR optional manual paper backup.
- Recently shipped a "completely redesigned Backup flow."
- Backup framed as the safety step, not a scary seed screen up front.

Sources: https://rainbow.me/en/support/app/get-started-with-the-rainbow-app ; https://rainbow.me/support/app/the-importance-of-backups

---

## 8. CROSS-PRODUCT PATTERN SYNTHESIS (facts, not proposals)

### The canonical email-OTP embedded-wallet flow (what everyone actually ships)
1. **One combined "Log in or sign up" screen** — single email field + social buttons + (optional) "Continue with a wallet". No password. Primary button disabled until input. (Privy, Dynamic both verified.)
2. **6-box OTP screen** — back arrow, envelope icon, "check your email" sentence echoing the address, 6 auto-advancing single-char boxes, auto-submit on last digit, "Resend code" link, attribution footer. (Privy + Dynamic verified identical structure.)
3. **Loading** between steps (spinner / envelope-with-arc motion in Dynamic).
4. **Success = silent** — user is just "in." NO wallet-creation screen, NO seed phrase, NO "your wallet address is 0x…" celebration by default.
5. **Funding is a separate, later, optional step** — "Add Funds" → card (Apple Pay / debit) or Receive (QR + address). Amount entry uses a numeric keypad, fiat-denominated ("Amount in USD").

### How they avoid the words wallet / seed / gas / chain
- Login verbs are web2: "Log in or sign up", "Continue", "Get started", "Welcome back".
- The account artifact is implied, never named "wallet" at login. (Base App entry: just "Continue".)
- No product shows a seed phrase at onboarding; alternatives = passkey (Coinbase/Dynamic), 4-digit PIN (Phantom), cloud backup (Rainbow), or fully invisible key mgmt (Privy/Magic/MPC).
- "Gas" and "chain" are absent from onboarding entirely; funding is framed in fiat ("$", "Add Funds", "Buy USDC").
- Passkey copy stays device-framed: "This passkey will only be saved on this device", "Never lose access".

### State inventory a designer must build
- **First-run / new user:** combined login screen → OTP → silent wallet provision → (optional) fund prompt.
- **Returning user, same device:** silent re-auth, no modal (session/refresh token). Some apps: "Welcome back".
- **Returning user, NEW device:** heavier — recovery required (Privy: device share is local-storage-bound; must recover or recreate). Passkey products: passkey must sync (iCloud/Google) or re-create.
- **OTP not received:** "Resend code" (Privy) / "Check spam or Re-send code" (Dynamic).
- **OTP wrong:** Privy = red boxes, no text; Dynamic = red banner "The code you entered is incorrect. Please try again." + red boxes.
- **Loading:** disabled primary → spinner; button label morphs (e.g., "Creating order…").
- **Session expiry:** re-shows the login modal / requires re-auth (SDK-managed refresh tokens; expiry → back to step 1).
- **Funding success:** explicit confirmation ("Purchase complete!" + "Done") — this IS celebrated, unlike wallet creation which is silent.
- **Cancel/abort:** back arrow on OTP screen returns to email; "Cancel" on payment resets.

### Microcopy bank (all real, sourced above)
- "Log in or sign up" · "your@email.com" · "Enter your email" · "Submit" · "Continue" · "Get started" · "Welcome back"
- "Enter confirmation code" · "Please check {email} for an email from {domain} and enter your code below." · "Confirm verification code" · "We've sent a verification code to {maskedEmail}"
- "Didn't get an email? Resend code" · "Did not receive a code? Check spam or Re-send code"
- "The code you entered is incorrect. Please try again."
- "Protected by privy" · "Powered by dynamic"
- "Welcome to Base App" · "The best place to trade on web and mobile" · "Continue" · "Scan to download"
- "Create a smart wallet" · "Sign up" · "This passkey will only be saved on this device." · "Never lose access"
- "Add Funds" · "Amount in USD" · "Buy USDC with Apple Pay" · "Creating order..." · "Purchase complete!" · "Done" · "Cancel"
- "Continue with Google" · "Continue with a wallet" · "Prefer phone number sign up? Use phone"

---

## 9. SUPPLEMENTARY FINDINGS — added 2026-07-02 by second research pass

### OTP expiry times  [VERIFIED-DOC]
- Privy email OTP: **10 minutes** (docs.privy.io/authentication/user-authentication/login-methods/email)
- Coinbase CDP email OTP: **10 minutes** (docs.cdp.coinbase.com/embedded-wallets/authentication-methods)
- Coinbase CDP SMS OTP: **5 minutes** (same source)
- Standard fintech best practice: 2–5 min for active login session (arkesel.com OTP guide)
- Key UX implication: an expired OTP must show a DIFFERENT error than a wrong OTP; auto-resend on expiry is best practice.

### OTP error microcopy — specific states  [VERIFIED-DOC from arkesel.com + authgear.com]
Three distinct states should be communicated differently:
- **Wrong code**: "That code doesn't match. You have 2 attempts remaining."
- **Expired code**: "This code has expired. We've sent a new one to your phone."
- **Rate limited**: "Too many attempts. Please wait 15 minutes before requesting a new code."

Resend flow copy (best practice): "Didn't receive your code? Wait 30 seconds and we'll send another"

Success/confirm (authgear): "Check your inbox to verify your email"

Smashing Magazine (verified): Prefer "Send a code" over "Get a code" — more honest about what can be guaranteed. Prefer "6-digit code" over "OTP" — most users don't know what OTP means.

### Passkey biometric UX — specific patterns  [VERIFIED-DOC from theusefulapps.com + eco.com]
- OS-level creation prompt text (system, iOS/Android): **"Save a passkey for [domain]?"**
- App-side primary CTA: **"Continue with Face ID"** (one decision, secondary hidden under "Other options")
- Error state: "Face ID unavailable" (not "You failed") — shift blame to system, not user
- Error response: shake animation + haptic feedback + fallback button (PIN fallback)
- Post-creation: **"Great—your Passkey is now stored"** (progressive disclosure)
- Transaction signing UX: "Send 50 USDC" button → Face ID/Touch ID → 0.5–1s → done
- User description of passkey signing: "tap 'Send,' look at the camera, done" (eco.com)
- VoiceOver label: "Double-tap to use Face ID"
- Cross-device: iOS = iCloud Keychain; Android = Google Password Manager; Desktop = 1Password/browser profile
- Onboarding sequence: Splash → Onboarding → Optional "Enable biometric login" → OS prompt → Success → passkey generated

### MoonPay widget screen sequence  [VERIFIED-DOC from dev.moonpay.com/widget/on-ramp/design-guide]
5-step flow (can be shortened by pre-filling):
1. **Currency + Amount** — list of cryptos (icon, abbreviation, name, network); fiat/crypto amount entry; minimum/maximum limits shown; can skip if pre-filled (6% conversion improvement)
2. **Login / MFA** — skipped entirely if email pre-populated; else: email entry → 6-digit code (sandbox: `000000`)
3. **Payment Method** — shown with logos + "estimated transaction completion times"; **Apple Pay is the default on iOS** (higher success rate); 150+ payment methods; 160+ countries
4. **KYC** — only for new MoonPay users; camera + document upload + selfie
5. **Confirm** — purchase confirmation before submission

Design guide notes:
- Show a "Loading Screen" with both the app logo AND MoonPay logo before widget loads
- Custom theme = +20% OTP verification completion rate
- Error on invalid amount: "Widget errors caused by invalid amounts will require the user to re-enter the amount"

### Stripe embedded onramp session states  [VERIFIED-DOC from docs.stripe.com/crypto/onramp/embedded]
Stripe models the entire onramp as a session with these states (surfaced to developers, maps to screen states):
- `initialized` — before customer starts
- `requires_payment` — payment screen shown
- `fulfillment_processing` — crypto delivery in progress
- `fulfillment_complete` — transaction done
- `rejected` — failed KYC or fraud check

KYC data collected: email, first/last name, date of birth, SSN (cannot be pre-populated), home address, card number.

### Immutable Passport — post-login dashboard text  [VERIFIED-DOC]
Dashboard copy (Immutable marketing): "find new games with ease, store and add funds, link 3rd party wallets, and manage all your in-game items within one familiar experience"
Funding CTA in dashboard: **"store and add funds"**

### Phantom — 4-digit PIN after social auth  [VERIFIED-DOC from phantom.com]
- After Google/Apple login, Phantom requires: **set a 4-digit PIN** ("a simple 4-digit PIN that is easily memorable")
- Then: approve required permissions / spending limits
- Default spending limit: **$1,000 USD per app per day**
- No seed phrase shown; key described as "generated on device, never leaves device"
- Recovery framing: "forgot PIN is recoverable as long as one device still has the wallet"

### Cross-product jargon replacement table (verified)
| Crypto concept | What real products show | Verified from |
|---|---|---|
| wallet | "account" or implied only | Privy, Magic, Base App |
| seed phrase | never shown at onboarding | All products above |
| gas / gas fees | invisible (sponsored) or absent | MetaMask, Dynamic, Privy |
| network / chain | auto-selected, never surfaced | 7Block, MetaMask, Base |
| private key | never mentioned | Privy (TEE), Dynamic (MPC), Coinbase |
| connect wallet | "sign in" or "continue" | Dynamic, Phantom, Base |
| OTP | "6-digit code" | Smashing Magazine best practice |
| on-chain | absent from login UI | All products |
| transaction | "send / receive" | eco.com, Coinbase |
| wallet address | shown only on "Receive" screen, labeled "Your address" | Coinbase/Base, MetaMask |
