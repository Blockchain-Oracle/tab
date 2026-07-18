# Tab Current UI Baseline

Captured on 2026-07-18 before the product-experience rebuild. This is a source-backed and locally rendered baseline, not a statement that blocked live integrations are complete.

## Evidence Boundary

- Source baseline: branch `codex/tab-experience-rebuild`, after governance commit `aff860b`.
- Browser target: local Next.js development server at `http://localhost:3000`.
- Browser session: signed out; authenticated dashboard behavior below is therefore sourced from routes, components, and tests rather than claimed as a live browser result.
- Rendered checks: `/`, `/demo`, `/leash/login`, and `/mobile`.
- No OTP, credential, wallet mutation, faucet call, or money-moving action was performed.
- The Base Sepolia payer/signature/settlement lane and the Particle mainnet lane remain governed by their recorded blockers; this baseline invents no address, balance, receipt, or transaction.

## Rendered Stranger Test

### Public root

`/` renders only the literal text `Tab — Phase 1 scaffold` using browser-default layout. The page has no product thesis, navigation, calls to action, responsive composition, evidence, test/live boundary, or explanation of the human and agent rails.

Source: `apps/web/app/page.tsx`.

### Merchant entry and demo

With no current merchant session, `/demo` resolves to the merchant login experience. The rendered page has:

- a letter-tile `T` mark and `Tab` word;
- `Log in to Tab` heading;
- persistent-session explanation;
- one email field and disabled login button;
- signup link and `Test mode by default` footer.

The screen is functional and restrained but visually generic: a centered white card, warm-gray page, serif-heavy type, hardcoded blue tile, and no merchant/test-workspace context before authentication.

### Leash entry

`/leash/login` renders the parallel owner login experience with `Tab · Leash`, the persistent-session explanation, email field, disabled `Continue`, and `No wallet extension required` footer. It is honest about Magic email login but shares the same generic centered-card composition and letter tile.

### Mobile entry

Without an owner session, `/mobile` redirects to `/leash/login`. The auth boundary is correct. No unauthenticated monitor state or fabricated receipt is exposed.

## Surface Inventory

### Public and documentation

| Surface | Current source/render state | State coverage | Baseline debt |
| --- | --- | --- | --- |
| `/` | literal Phase 1 scaffold | default only | no marketing product |
| Marketing application | no `apps/site` workspace | absent | must be created |
| Documentation application | no `apps/docs` workspace | absent | must be created |
| Merchant `/demo` | real tenant/signed-intent test workspace behind auth | idle, saving, error, confirmed order in source/tests | visually basic storefront; signed-out route loses demo orientation |

### Shared authentication

Merchant `/signup` and `/login`, plus Leash `/leash/login`, already cover configured/unavailable provider state, email validation/sending, OTP entry/verification, session reuse, and errors. The current contract correctly attempts Magic session restoration before OTP and ordinary Tab logout does not forget the Magic device.

Debt:

- merchant and Leash duplicate much of the shell language and styling;
- session-check, resend, invalid, expired, rate-limit, and provider states do not yet read as one branded state system;
- workspace choice and resumable onboarding are not first-class journeys;
- no shared visual token/component package exists.

### Merchant product

Current routes cover:

- Overview/dashboard;
- Quickstart/integration;
- Transactions and payment detail;
- API keys;
- Webhooks and delivery log;
- Settings;
- Go Live.

The APIs and tenant boundaries are real-data-first. Source tests cover empty, loaded, error, key, transaction, delivery, and settings behavior. Navigation is a functional text sidebar with the same letter-tile identity.

Debt:

- information architecture mirrors implementation history rather than the shortest merchant job;
- CSS-module islands repeat hardcoded neutral/status values;
- onboarding progress is not projected as a resumable real-state task path;
- relational evidence competes with interchangeable cards;
- no coherent appearance preview/test/live transition exists across the product.

### Checkout SDK

`packages/sdk` already contains a fourteen-stage state machine:

1. intent loading;
2. idle;
3. opening;
4. email;
5. email sending;
6. OTP;
7. OTP verification;
8. balance loading;
9. balance ready;
10. insufficient funds;
11. add funds;
12. confirming;
13. submitted success;
14. error/recovery.

Cancel/reset behavior is handled by reducer events around those stages rather than a separate stage.

The shell is accessible and tested, but `CheckoutShell.tsx` and `styles.ts` rely on inline style objects, hardcoded colors, and a fixed-width sheet. There is no backward-compatible merchant appearance contract, shared transaction-stage vocabulary, or product-family visual connection.

Canonical correction retained for the rebuild: submitted success appears immediately only after Particle returns a real `transactionId`; settlement verification and merchant webhook state continue as separate authoritative axes.

### Leash web

Current routes cover:

- Overview;
- Payments feed and receipt detail;
- Notifications;
- Cap/cycle policy;
- Funds;
- Provisioning;
- Revocation;
- Connect.

The UI already contains honest empty and blocked states. A day-zero owner is told that no agent/receipt was fabricated. Receipt storage, cap state, notifications, and chain reads are backed by real APIs/DB projections.

Debt:

- the core `policy before signature` sequence is not the dominant visual hierarchy;
- status, cap, key, float, signer, facilitator, settlement, delivery, and verification axes are scattered across routes;
- Pause, Freeze, Cancel, and Nuclear consequences need a single exact control model;
- blocked top-up/rebalance/withdraw states are truthful but not assembled into a clear prerequisite journey;
- network/evidence styling is inconsistent with checkout and merchant surfaces.

### Agent package

`apps/agent` is correctly headless. It exposes the packaged `leash-mcp` CLI and paid-fetch surface rather than a visual application. Its source test inventory covers routing, signer behavior, settlement guards, persistence/restarts, correlation, receipt handling, and integration boundaries. The rebuild must improve install/connect/evidence presentation around it without adding a GUI or model picker to the agent package.

### Mobile PWA

The legacy `apps/mobile` remains a Phase 1 service-worker shell. The newer owner monitor lives under `apps/web/app/mobile` and is still an unfinished, uncommitted Phase 9 lane.

At initial baseline, the preserved files were:

```text
apps/web/app/mobile/feed/receipt-feed.test.tsx
apps/web/app/mobile/layout.tsx
apps/web/app/mobile/mobile-import-boundary.test.ts
apps/web/app/mobile/mobile-shell.module.css
apps/web/app/mobile/mobile-shell.test.tsx
apps/web/app/mobile/mobile-shell.tsx
apps/web/app/mobile/page.tsx
apps/web/app/mobile/pwa-registration.test.ts
apps/web/app/mobile/pwa-registration.tsx
apps/web/app/mobile/receipts/[id]/page.test.tsx
apps/web/app/mobile/receipts/[id]/receipt-detail.test.tsx
apps/web/lib/mobile/pwa-assets.test.ts
```

The pre-commit quality gate exposed the missing implementation imports rather than allowing them to be ignored. The bounded TDD repair added real-state feed/detail and public PWA asset contracts; the focused mobile/PWA suite now reports 7 files and 33 passing tests, and `@tab/web` typecheck passes.

The Phase 9 lane is still not complete:

- `/mobile` redirects to `/mobile/feed`; no first-class mobile Overview is implemented;
- the feed model/view exists, but the `/mobile/feed` page/controller is absent;
- notifications and emergency actions still link to desktop Leash routes;
- no mobile-specific Pause/Freeze/Cancel/Nuclear journey is complete;
- the current service worker intentionally caches only anonymous versioned shell assets, not authenticated API data;
- offline/stale real-state projection, install review, push behavior, and full browser verification remain pending;
- all Phase 9 files remain uncommitted and must be reviewed/staged deliberately, never swept into a docs commit.

## Visual-System Baseline

Structural debt observed across the source and rendered pages:

- no marketing or docs application;
- no shared UI/network-brand package;
- minimal global tokens and repeated hardcoded neutrals/status colors;
- letter-tile marks instead of a durable Tab identity system;
- separate CSS-module islands for merchant, Leash, and mobile;
- SDK inline styling and fixed checkout geometry;
- no premium motion policy or reduced-motion transaction trace;
- no coherent workspace/onboarding/Test Lab path;
- no visual language that makes one rail/two payers legible;
- no dark/system family contract.

## Existing Strengths To Preserve

- real multi-tenant and owner boundaries;
- honest empty/blocked/unavailable states;
- persistent Magic session behavior;
- complete checkout state coverage;
- server-authoritative payment/receipt/webhook records;
- policy gates before signing;
- headless MCP/CLI distribution boundary;
- permanent Base Sepolia test-funds labeling;
- mobile import boundary excluding wallet/signing/Particle/Magic/viem/x402 capability.

## Rebuild Constraint

The rebuild may replace appearance, composition, navigation, and interaction hierarchy. It may not replace real DB/API/chain state with showcase fixtures, collapse submitted and verified payment evidence, weaken owner/tenant boundaries, move Particle into the x402 hot path, or claim a provider/funded proof before reproducible live evidence exists.
