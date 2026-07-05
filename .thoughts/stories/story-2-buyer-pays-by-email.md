# Story: Buyer pays by email (invisible crypto)
> Traces to: R-TAB-4, R-TAB-5, R-TAB-6, R-TAB-7, R-TAB-8, R-TAB-9, R-TAB-10; AC-TAB-1, AC-TAB-2, AC-TAB-3, AC-TAB-5, AC-TAB-6. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As a buyer with no crypto knowledge,
I want to complete a purchase by entering my email address and a 6-digit code,
so that I can pay a merchant from whatever funds I already hold across any chain — without knowing any of those details.

---

## Acceptance Criteria

- **[AC-TAB-1 / R-TAB-9]** From `<PayButton>` click to success screen, none of the following words appear in any buyer-facing string, copy, or tooltip: "chain", "gas", "bridge", "Arbitrum", "EOA", "wallet address", "sign", "EIP". The buyer's only required inputs are an email address and a 6-digit OTP code.

- **[AC-TAB-6 / R-TAB-4]** A new buyer completes authentication via Magic's 6-box OTP screen — auto-advancing on each digit and auto-submitting on the 6th — without installing MetaMask, being shown a seed phrase, or navigating away from the merchant page. No "your wallet is ready" screen is shown after auth returns.

- **[AC-TAB-5(a) / R-TAB-5]** After the OTP screen resolves, the Particle Universal Account is initialized using the nested `smartAccountOptions: { useEIP7702: true }` form (not the flat quickstart form), with the buyer's Magic EOA set as `ownerAddress`.

- **[R-TAB-6]** The checkout modal reads `ua.getPrimaryAssets()` and displays a single USD total balance to the buyer. No per-chain breakdown, no individual token amounts, and no network names are shown.

- **[AC-TAB-2 / R-TAB-7]** A buyer whose funds are held entirely on chains other than Arbitrum (e.g., ETH on Base, USDC on Polygon — zero Arbitrum balance) successfully pays the merchant. The merchant's Arbitrum One address shows an increased configured-token balance, as reflected in `tokenChanges` of the `TransactionResult`. The buyer holds nothing on Arbitrum before or after.

- **[AC-TAB-3 / R-TAB-8]** The checkout modal transitions to an animated success state the instant `ua.sendTransaction` returns a `transactionId`. No polling interval, no block-confirmation wait, and no additional delay is introduced between the call resolving and the success state appearing.

- **[AC-TAB-5(b)(c) / R-TAB-7]** `sendTransaction` is called with the `authorizations` array (3rd argument) built from `transaction.userOps`. The transaction record on universalx.app confirms a successful cross-chain transfer originating from the buyer's Magic-email EOA.

- **[R-TAB-10]** The `<PayButton>` transitions through exactly these states in order: IDLE ("Pay $X.XX" + lock icon) → LOADING (disabled + spinner) → AUTH (Magic OTP modal — separate from button) → PROCESSING (disabled, prevents double-submit) → SUCCESS (animated checkmark, label morphs to "Done" or merchant-configured label) → ERROR (inline message, entered data preserved, retry in place). The button is disabled in LOADING and PROCESSING states to prevent double-submit.

---

## Scenarios

### Happy path — buyer with zero Arbitrum balance pays from Base ETH

```gherkin
Given a merchant page with a <PayButton> showing "Pay $12.00"
  And the buyer holds ETH on Base and has no Arbitrum balance
  And the buyer has never visited this merchant before

When the buyer clicks "Pay $12.00"
Then the button enters LOADING state (disabled, spinner visible)
  And the Magic email-OTP modal opens without leaving the merchant page

When the buyer enters their email address into the Magic modal
  And receives a 6-digit code by email
  And types all 6 digits (auto-submitting on the 6th)
Then the OTP modal closes
  And the button enters AUTH → PROCESSING state
  And a single USD balance is shown in the checkout modal (no chain names, no token symbols beyond the merchant's configured currency)
  And none of the following appear: "chain", "gas", "bridge", "Arbitrum", "EOA", "wallet address", "sign", "EIP"

When the cross-chain transfer settles
Then the button transitions to SUCCESS state immediately on sendTransaction resolving (no block-confirmation wait)
  And an animated checkmark is shown
  And the merchant's Arbitrum One address holds an increased configured-token balance
  And the buyer has not been asked to choose a network, approve gas, or install a wallet
```

### Edge case — buyer has already authenticated (returning buyer, wallet provisioned)

```gherkin
Given the buyer previously completed OTP auth and their Magic session is still valid
  And they click "Pay $8.50" on a different merchant page

When the button is clicked
Then the AUTH / OTP step is skipped (session reused)
  And the button moves directly from LOADING to PROCESSING
  And the same invisible-crypto success flow completes
```

### Edge case — OTP code entered incorrectly

```gherkin
Given the buyer has opened the Magic OTP modal
  And enters an incorrect 6-digit code

When the Magic OTP screen rejects the code
Then the OTP screen remains open with an error state (per Magic SDK's built-in UI)
  And the <PayButton> stays in AUTH state (not PROCESSING, not ERROR)
  And the buyer can re-enter the correct code without leaving the merchant page
```

### Edge case — sendTransaction returns an error

```gherkin
Given the buyer has authenticated and confirmed payment
  And ua.sendTransaction throws or returns an error (e.g., insufficient unified balance)

When the error is received
Then the <PayButton> transitions to ERROR state
  And an inline error message appears below or inside the button area
  And the buyer's entered email is preserved (no data loss)
  And a retry path is available in place (no page reload required)
  And no crypto-vocabulary words appear in the error message shown to the buyer
```

### Edge case — buyer's unified balance is below the payment amount

```gherkin
Given the buyer's total unified balance across all chains is less than the payment amount

When the checkout modal reads ua.getPrimaryAssets() and displays the single USD balance
Then the balance shown is below the required amount
  And the <PayButton> is disabled or shows an "insufficient funds" message
  And no chain or token breakdown is shown to explain why
```

---

## Notes

- **Invisible-crypto vocabulary rule is absolute.** "Chain", "gas", "bridge", "Arbitrum", "EOA", "wallet address", "sign", and "EIP" must not appear in any buyer-facing string. "USDC" as a currency unit is permissible only if the merchant has opted into showing it. This rule applies equally to error messages, tooltips, and loading copy. (R-TAB-9, AC-TAB-1)

- **No wallet-creation screen.** Magic provisions the buyer's EOA silently. The buyer never sees a "your wallet is ready" interstitial. Wallet provisioning is a silent implementation detail, not a user-facing event. (AC-TAB-6; UX research inference 4)

- **Optimistic success is not approximate.** The success state fires the moment `sendTransaction` resolves with a `transactionId` — not on polling, not after a confirmation count. Any additional wait is a spec violation. (R-TAB-8, AC-TAB-3)

- **Button disabled during LOADING and PROCESSING.** Double-submit prevention is part of the button state machine spec. A click in either of these states must be a no-op. (R-TAB-10)

- **The buyer holds nothing on Arbitrum.** The cross-chain abstraction means the buyer's source funds on any supported chain (Base, Polygon, etc.) settle as the configured token on Arbitrum at the merchant's address. The buyer's Arbitrum balance before and after is irrelevant to the happy path. (AC-TAB-2)

- **EIP-7702 mode is mandatory; the nested init form is not optional.** The flat quickstart init form does not satisfy the judge requirement for proving 7702 mode. `smartAccountOptions: { useEIP7702: true }` in the nested form is the only valid shape. (R-TAB-5, AC-TAB-5)

- **No on-device signing on mobile.** If a buyer is on a mobile browser, the Magic embedded wallet SDK handles signing; no native wallet app or React Native signing path exists. The mobile surface holds no private key. This story covers the browser (desktop or mobile web) surface only.

- **6-box auto-submit OTP is de facto standard shape.** The Magic SDK renders this UI via `loginWithEmailOTP({ showUI: true })`; the buyer-facing modal is Magic's pre-built component. Tab does not build a custom OTP screen. (R-TAB-4; UX research §B)

---

## Open Questions

1. **What token address is used on Arbitrum One?** The Particle quickstart uses USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`); the product description says USDC. The exact token address must be confirmed against live Particle UA liquidity availability and CDP facilitator asset support at build time. Until confirmed, AC-TAB-2's "configured token" is intentionally token-agnostic. (Spec OQ-4)

2. **What buyer-facing copy is shown for an insufficient-balance error?** The spec prohibits crypto vocabulary but does not define the exact error string or whether the modal shows the USD shortfall. The error scenario above marks this as "insufficient funds" — the specific label is unspecified.

3. **Does the UA version check (UNIVERSAL_ACCOUNT_VERSION) produce any buyer-visible state?** If the buyer's account is on UA V1 and must withdraw before proceeding, that interruption is not described in the buyer-facing spec. If a migration interstitial is required, its copy and placement are unspecified. (Spec Constraint 10)
