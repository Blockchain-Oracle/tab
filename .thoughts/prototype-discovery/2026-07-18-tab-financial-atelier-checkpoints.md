# Prototype Discovery: Tab Financial Atelier Checkpoints

## Prototype Inspected

Three Abu-approved image-generation checkpoints were inspected as design evidence:

| Artifact | Dimensions | SHA-256 | Scope |
| --- | --- | --- | --- |
| `../design/checkpoints/2026-07-18/landing-financial-atelier.png` | 1536×1024 | `032430a29b494e5b7b7a66258602d7ab0fa86e2d4e307503f5c3346a93734da0` | landing desktop/mobile |
| `../design/checkpoints/2026-07-18/checkout-state-contract.png` | 1672×941 | `0124e344d83c68f857be6f16ea6d88232fe8474d809ddcca1d36681024a652be` | checkout state strip |
| `../design/checkpoints/2026-07-18/product-family-financial-atelier.png` | 1619×971 | `057fa3087cccf9819a1adc0239966fa009cbb2dd21931e225feacfc4a581b94c` | merchant, Leash, mobile |

All three say `PRODUCT ILLUSTRATION` and contain no claimed live financial record. Abu accepted each visual checkpoint by asking to continue; that acceptance does not approve the separate no-shipping reintegration gate, which requires its own recorded review. The earlier cool kinetic-ledger concept is superseded and is not an implementation input.

These boards are direction checkpoints, not an exhaustive product prototype. The complete inventory remains `../design/2026-07-18-tab-product-experience-surface-map.md`.

## Screen Map

| Prototype surface | Target surface | What it establishes | What it does not cover |
| --- | --- | --- | --- |
| Landing desktop/mobile | new `apps/site` `/` | thesis, two CTAs, responsive Flowline, one rail/two payers, test-funds boundary | full below-fold narrative, footer, dark mode, navigation states, SEO |
| Checkout 1–5 | packed `@tab/sdk` PayButton/sheet | stable trigger, Magic email/OTP, balance, insufficient/add-funds | merchant appearance variants, session recovery, rate-limit/provider failures |
| Checkout 6–11 | packed `@tab/sdk` PayButton/sheet | event-driven preparation/authorization/submission, transaction-ID-backed submitted success, independent verification, safe recovery | every provider error code, live proof, host-style collision matrix |
| Merchant overview | `apps/web` authenticated merchant workspace | new IA, real-state checklist, next action, honest empty evidence | payments, webhooks, settings, detail, pagination, dense/error states |
| Leash evidence | `apps/web/leash` | policy gates before signature, stopped Flowline, full evidence axes, Test Lab action | activity list, policy editor, funds details, Connect, notifications |
| Mobile overview/activity | `apps/web/mobile` | mobile-first status, compact evidence rail, stale marker, empty receipt state | complete feed/controller, notifications, push, install/offline journeys |
| Mobile emergency controls | `apps/web/mobile` | four consequence levels and server-confirmed Freeze sheet | Pause/Cancel/Nuclear confirmations, restart/auth-expiry/failure states |

The checkpoints intentionally omit auth/workspace entry, onboarding detail, docs, Test Lab claim forms, merchant operational routes, full Leash routes, and most mobile states. Those omissions do not remove them from scope.

## User Flows

### Stranger to product

`Thesis → inspect human/agent branches → understand test/live boundary → Build with Tab or Set up Leash`

### Human checkout

`Stable trigger → Magic identity → OTP/restored session → observed Tab balance → confirm or add funds → provider callbacks → real transactionId → submitted success → independent verification → verified evidence or safe reconciliation`

### Merchant first success

`Owned workspace → complete identity/appearance/key → configure and verify webhook → unlock real test checkout → inspect persisted payment and delivery evidence`

### Agent first success

`Owned agent → status/cap/key/float/signer gates → Test Lab readiness → signature → facilitator → settlement → protected delivery → independent verification`

### Mobile emergency action

`Observe server state → choose consequence → review exact effect → submit owner-authorized mutation → wait for independently refreshed server state`

## Revealed Product Requirements

- The Flowline is a semantic component with three modes: public branch, checkout progress, and Leash evidence rail.
- Checkout must keep merchant, amount, mode, and current real stage visible across every state.
- `Payment submitted` and `Payment verified` are different product states. Emerald belongs only to authoritative completion.
- Agent evidence must show where a payment stopped; a pre-signature block must not render a signature, facilitator call, transfer, or explorer link.
- Merchant onboarding is a projection of owned persisted state, not a manually decorated checklist.
- Mobile is an oversight product with its own navigation and controls, not a link farm into desktop pages.
- Stale/offline status requires the last successful observation time and must never look live.
- Test and live modes use explicit language in addition to color.
- Every official provider/chain mark is inserted from approved assets during implementation; generated approximations are forbidden.

## Revealed Technical Requirements

- Internal framework-neutral network profiles must supply full name, CAIP-2 ID, chain ID, explorer, native asset, Circle USDC, facilitator/access mode, and `testFunds` with fail-closed lookup.
- Shared UI tokens must encode the locked palette/type roles and provide dark/system/reduced-motion behavior.
- The SDK needs backward-compatible appearance, class, and stage-event contracts while remaining free of Motion.
- React applications may use Motion only for state/layout/exit transitions driven by real events.
- Checkout needs an explicit continuing-verification state after provider submission.
- Merchant and Leash onboarding need server-derived projection/read models.
- Mobile needs a real feed route/controller, owner-scoped polling, abort/timeout/auth-expiry handling, stale persistence, mobile notifications, and four mobile control journeys.
- Evidence links require shared network/hash/origin validation before rendering.

## Data Model Candidates

Existing PostgreSQL tables already cover users, merchants, API keys, quickstart progress, payments, settlements, webhook endpoints/deliveries, agents, provision attempts, Leash keys, caps/cycles, floats, events, receipts, notifications, push subscriptions, and x402 settlement evidence.

Additive persistence implied by the new program:

| Candidate | Required data |
| --- | --- |
| Merchant appearance | validated accent, light/dark/system preference, revision/update time |
| Onboarding projection | preferably derived; persist only user choices not inferable from existing rows |
| Test-fund claims | principal, agent, profile, address, requested legs, idempotency key, reservation/result, sanitized provider status, retry/cooldown timestamps |
| Readiness observations | agent/profile, observed USDC/native balances, signer recovery result, RPC chain ID, checked time, sanitized blocker |
| Mobile stale snapshot | client-side minimal sanitized read model plus last-success timestamp; never secrets or mutation results |

No new table should store generated checkpoint examples.

## API And Event Candidates

Existing APIs already supply Magic auth, merchant/key/mode/quickstart state, payment intent/create/report, webhooks, Leash caps/keys/floats/provisioning/receipts/notifications/revocation, agent connect/sign/result/reconcile, and Tab's Base Sepolia x402 test resource.

The checkpoint family additionally implies:

- `GET /api/test-funds/readiness?agentId=…` and `POST /api/test-funds/claims`.
- Base Sepolia native ETH is a separate informational/optional readiness leg; only observed Circle USDC plus recovered signer equality gate this facilitator-submitted EIP-3009 flow.
- Workspace and merchant/Leash onboarding projections derived from owned DB state.
- Checkout stage events for preparing, awaiting authorization, submitting, submitted, reconciling, verified, and failed.
- Mobile polling lifecycle events: fresh, retrying, stale, offline, unauthorized, and recovered.
- Emergency-control mutation lifecycle: requested, accepted, independently refreshed, rejected, timed out.

## Auth, Permissions, And Security Implications

- Restore Magic sessions before OTP; ordinary Tab logout never calls `magic.user.logout()`.
- Merchant and owner resources retain separate authorization boundaries even when identity persistence avoids redundant OTP.
- All merchant rows are tenant-scoped and all agent/readiness/receipt/control rows are owner-scoped.
- Money/signing progress derives from server/provider events, never timers.
- Test-fund claims require server-only Circle credentials, PostgreSQL reservation/idempotency, Turnstile verification, timeouts, cooldowns, circuit breaking, and secret-safe errors.
- Emergency actions require same-origin mutation protection, explicit consequences, idempotency, audit events, and server-confirmed rendering.
- The mobile package imports no wallet, signer, Particle, Magic, viem, or x402 execution capability.

## State And Edge Cases

- Session restoration pending, OTP resend cooldown, invalid/expired/rate-limited OTP, and provider unavailable.
- Balance read timeout, unsupported network, insufficient balance, funds sent but not observed, stale recheck.
- Submission response lost after possible broadcast, duplicate click, duplicate transaction ID, verification lag, and safe reconcile-before-retry.
- Simulated checkout with an insufficient observed live balance: the balance may remain read-only evidence, but it must not gate the labeled simulation or expose an Add funds path.
- Webhook missing, verification pending, retrying, exhausted, and resend failure.
- Agent unprovisioned, unfunded, no cap, paused, frozen, cancelled, nuked, signer unavailable/rejected, facilitator unavailable, expired/duplicate authorization.
- Mobile offline at launch, stale cached read, owner session expiry, mutation timeout, restart persistence, and unsupported push actions.
- Pause, Freeze, Cancel, and Nuclear are unavailable offline and are never queued or replayed after reconnection.
- Dense and filtered-empty tables, reduced motion, 200% zoom, keyboard-only, and dark/system modes are not shown but remain required.

## Target-stack Translation

- Build the visuals as Next.js/React routes and internal packages, not as raster UI or copied static markup.
- `apps/site`, `apps/web`, and `apps/docs` consume shared tokens/brand/network profiles but deploy independently.
- `@tab/sdk` uses scoped `--tab-*` CSS/SVG transitions and package-export tests.
- `apps/agent` stays headless and is represented through the Connect/evidence surfaces.
- PostgreSQL/Drizzle remains the source of persisted product state; server components/API routes project it into UI-safe models.
- Tests use Vitest for model/component/API contracts and Playwright/axe for browser, responsive, reduced-motion, offline, and accessibility behavior.

## Mocked Prototype Surfaces

| Illustration | Required fate |
| --- | --- |
| `Example merchant`, greeting, initials | runtime tenant/identity data or neutral copy |
| `[amount]`, `[balance]`, `[shortfall]` | signed intent and observed balance arithmetic |
| `you@example.com`, OTP boxes/cooldown | buyer input and real Magic events/client throttle |
| `Base`, QR, `0x1234…ABCD` | checkout-context network and real authenticated deposit address; the pictured Base value is not authority |
| `[provider value]` transaction ID | exact provider return, never checkpoint copy |
| verification/webhook rows | persisted backend observations, otherwise pending/unavailable |
| merchant step completion | DB-derived state; day-zero remains incomplete |
| gate pass/block states | one server gate evaluation for the exact challenge |
| payer/payee/amount/nonce placeholders | exact challenge/provider/agent data |
| `Leash Agent`, device time/chrome | owned agent data or visual furniture |
| stale/last-checked placeholders | last successful observed timestamp |
| all logo slots | official asset files only |

## Required Prototype Reintegration

Every row above is resolved in `../prototype-reintegration/2026-07-18-tab-financial-atelier-checkpoints.md`. The critical decisions are the checkout submission boundary, hardcoded Base funding label, Leash pre-signature stop, mobile server-confirmation rule, and the difference between real Base Sepolia test funds and simulated merchant test payments.

Prototype copy requiring correction during code-native implementation:

- The eleven checkout frames describe a branch graph, not a linear wizard: balance-ready/add-funds and verified/recovery are mutually exclusive branches.
- A merchant simulated test may persist a simulated reference and verification result, but it must not solicit real funds, display a provider transaction ID, or claim on-chain settlement evidence. Live Particle checkout must not carry the `no real funds moved` label.
- A simulated merchant test may show an observed live balance as read-only context, but insufficient live funds do not block its independent labeled simulation path. Add funds remains exclusive to live Particle checkout.
- `Base` is not a sufficient full network identity and cannot be copied from the board into checkout context.
- The pictured QR/address and `This address is for this payment only` are unsupported; show only the real provider address and lifecycle actually returned.
- `Use a different payment method` introduces an unaccepted path and must be removed unless a real method exists.
- Buyer authorization copy should preserve the invisible-payment model; do not introduce extension-wallet ceremony.
- Freeze guarantees that no new signatures are produced. It cannot claim that an already signed/in-flight settlement will fail.
- Nuclear must expose its real remaining-float/withdraw-first prerequisite rather than appearing immediately consequence-free.
- `Test payment — no real funds moved` and `Test funds — not real money` are separate categories: persisted buyer simulation versus real Base Sepolia on-chain test-token movement.
- Receipt detail must restore expiry, full asset/address, recovered signer, facilitator, transaction, protected delivery, and independent-verification fields even though the concept board compresses them.
- Buyer `Check payment status`/safe-close behavior requires an idempotent server status/reconcile contract and durable transaction-report retry; the raster CTA is not proof that recovery exists.
- Landing `Verified` endpoints are neutral anatomy until live proof exists. Published capability evidence must be gated by captured provider/chain artifacts.
- `One rail / two payers` means one merchant integration and normalized evidence, not one literal payer wallet or one x402 hot-path balance. Human unified balance and agent pre-positioned floats must be explained separately.
- Pause blocks new payment signing, not the external agent's requests. Nuclear destroys Tab signing credentials; it does not shut down the external agent and may strand unswept funds.
- Destructive mobile controls are disabled while offline. They must never be queued for automatic replay when connectivity returns.

## Spec Deltas

No canonical money-state change is justified. Proposed additive clarification only: name `submitted` as transaction-ID-backed but not settled/verified, and name Flowline progress as event-driven presentation rather than payment authority.

## Story Deltas

- Add visual/accessibility scenarios for the public Flowline, test/live labels, and reduced motion.
- Add checkout scenarios for transaction-ID-backed submission, continuing verification, and unknown-after-broadcast recovery.
- Add mobile scenarios for stale/offline reads and server-confirmed emergency mutations.
- Add Test Lab claim/readiness abuse and provider-unavailable scenarios.

## Plan Deltas

The approved rebuild workflow already includes these additions. No existing build-plan phase is deleted or relabeled complete. Before reusable state components, define one typed semantic event/evidence model that distinguishes `simulated_test_persisted`, `live_transaction_submitted`, `live_settlement_verified`, `verification_unavailable`, and the x402 gate/settlement axes. The R1 network/UI foundation must precede screen migration; the live integration lane remains parallel and independently gated.

## Quality Profile Deltas

- Lock the exact palette/type roles and Flowline reduced-motion semantics in tests.
- Add deterministic screenshot coverage for each checkpoint's critical state, not pixel-copy of the raster board.
- Add route existence and full browser journey checks so isolated component tests cannot conceal missing routes.
- Add shared explorer validation, contrast, one-main-landmark, and offline-truthfulness checks.
- Keep packed-artifact and no-showcase gates mandatory.

## Open Questions

No design question blocks implementation. Magic issuer trust, Circle faucet API eligibility, final domains, and Particle funding remain external proof prerequisites and must render as unavailable/blocked until observed.

## Evidence

- `../design/2026-07-18-tab-product-experience-designer-brief.md`
- `../design/2026-07-18-tab-product-experience-surface-map.md`
- `../design/2026-07-18-tab-current-ui-baseline.md`
- `../plans/2026-07-18-tab-product-experience-rebuild.md`
- `../plans/2026-07-06-tab-build-plan.md`
- `../specs/2026-07-02-tab-leash.md`
- `../decisions/DECISIONS.md`
- `../quality/2026-07-02-project-quality-profile.md`
- `../prototype-reintegration/2026-07-06-tab-v1.md`
- Current route, schema, SDK state-machine, and mobile implementation sources on `codex/tab-experience-rebuild`.
