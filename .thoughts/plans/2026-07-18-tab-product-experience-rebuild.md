# Plan: Tab Product Experience Rebuild

## Inputs

- Approved product-experience direction from Abu on 2026-07-18.
- `.thoughts/wiki/index.md` and the sponsor, judging, wallet, chain-abstraction, and x402 pages linked from it.
- `.thoughts/specs/2026-07-02-tab-leash.md` and the accepted buyer, agent, cap, notification, revocation, cross-chain, and two-payer stories.
- `.thoughts/plans/2026-07-06-tab-build-plan.md`, which remains authoritative for the original phase order and real-integration gates.
- `.thoughts/prototype-reintegration/2026-07-06-tab-v1.md`, especially the no-shipping-mock matrix.
- `.thoughts/quality/2026-07-02-project-quality-profile.md` and `.thoughts/decisions/DECISIONS.md`.
- Current repository state at `d408c99`, including completed Phases 1-8, unfinished Phase 9 mobile files/tests, and the Phase-0 spike branch evidence.
- Read-only audits of `/Users/abu/dev/hackathon/monad` and the intended Stellar reference `/Users/abu/dev/hackathon/stellar-zk-wallet` (`stellar-zk` itself is empty).
- Current official primary documentation for Base, Circle, Motion, W3C accessibility, Playwright, Next.js, Cloudflare Turnstile, and PWA behavior. Context7 was quota-blocked during planning; installed types remain authoritative during implementation.

## Assumptions

1. This program is additive to the canonical build plan. It does not erase completed work or relabel blocked integrations as complete.
2. Abu's “Thanks let's continue” is approval of the product direction and permission to execute it in order.
3. The active execution branch is `codex/tab-experience-rebuild`. Existing user-owned `.thoughts` changes and unfinished mobile work remain in place and must not be broadly staged.
4. Marketing, authenticated application/API, and documentation will deploy as `<domain>`, `app.<domain>`, and `docs.<domain>` respectively. The final registered domain is a deployment input, not a reason to hardcode placeholders.
5. Authenticated APIs and OIDC stay same-origin with the application. The current Vercel issuer remains stable through the live Magic spike; final-domain migration happens only after parallel provider acceptance.
6. The Circle faucet API is the preferred in-product test-funding provider. It cannot be claimed available until a server credential with access to `/v1/faucet/drips` works live. The official external faucet remains an honest fallback.
7. Base Sepolia x402 readiness requires real Circle USDC and a verified Magic signer. Payer ETH is shown separately and does not block the facilitator-submitted EIP-3009 payment.
8. Particle UA 2.0.3 remains mainnet-only. The approximately 20 USDC Base-mainnet spike is separate from Base Sepolia x402 testing.
9. Prototype-only sample values may appear in design artifacts when labeled. Production/judged paths use real API/chain/DB state, honest empty state, or explicit BLOCKED/test labels.

## Open Questions

No design decision remains open. The following are execution prerequisites whose unavailable state must be represented honestly:

- Magic must accept the self-hosted issuer in its Express enclave trust store, or Abu must explicitly approve a supported third-party IdP migration.
- A Circle developer credential must prove access to the test-token API before the in-app claim control is enabled.
- Abu will provide the final root domain before DNS cutover.
- The Particle EOA/UA `0x895792c87f4A3D0aAFf9604CEab10169F3194Cc0` needs approximately 20 real USDC on Base mainnet before the funded Particle proof.

## Prototype Reintegration Gate

- The existing prototype remains evidence and visual history, not automatic implementation truth.
- New image-generated and code-native design checkpoints are prototype-only until discovery/reintegration maps every mocked value, transition, and integration boundary.
- No prototype screen may introduce a seeded tenant, fabricated transaction, fake signature, fake facilitator result, or invented chain balance into a judged path.
- The new visual system may replace the old prototype's appearance, but it may not weaken its accepted functional, accessibility, or no-shipping-mock requirements.

## Phase R0: Preserve Work And Lock The Design

### Goal

Create a durable, reviewable handoff before changing product components.

### Work

- Preserve the unfinished mobile shell and RED tests without deleting, stashing, or broadly staging unrelated files.
- Add the new product surface map, designer brief, research-backed plan, and executable HOTL workflow.
- Capture baseline route/state inventory and screenshots.
- Generate three visual checkpoints: landing desktop/mobile, checkout state strip, and merchant/Leash/mobile family.
- Run prototype discovery and reintegration on the accepted checkpoints before Phase R1 code.

### Real Integration Path

Design artifacts describe the actual Magic/Particle/x402 boundaries and current blockers. They do not call live money services.

### Mock/Simulation Policy

Illustrative values are allowed only inside explicitly labeled design prototypes. No prototype output is copied into production data paths.

### Checks

- Artifact files exist and link to authoritative sources.
- Surface map includes every buyer, merchant, Leash, and mobile state.
- Designer brief includes the handback contract and no-shipping-mock boundary.
- Workflow passes HOTL document lint.
- Abu reviews the three visual checkpoints.

### Acceptance Criteria Covered

Complete design handoff, pending-work preservation, and explicit real-vs-prototype boundary.

### Stop Condition

The visual direction and reintegration matrix are accepted, and no product implementation has started from an unreviewed mock.

## Phase R1: Shared Design And Network Foundations

### Goal

Create one coherent system for web, site, docs, and mobile while keeping the distributable SDK lightweight.

### Work

- Add internal `@tab/ui` tokens and primitives for typography, brand, actions, fields, dialogs, sheets, status, evidence, loading, empty, error, copy, and motion policy.
- Add framework-neutral `@tab/networks` profiles containing CAIP-2 ID, numeric chain ID, display name, official logo, explorer, native asset, Circle USDC address, facilitator, and `testFunds`.
- Define light/dark/system themes as a financial atelier: Instrument Sans for product UI, Instrument Serif only for restrained marketing emphasis, and Geist Mono for policy, code, addresses, amounts, and evidence. Use warm paper `#F4F0E7`, surface `#FFFCF7`, ink `#15130F`, muted `#6C665C`, cobalt `#3157E8`, emerald `#1F7A4D`, testnet amber `#9A6400`, danger `#B83F4A`, and line `#DDD6C8`; dark mode uses ink surfaces and warm-white text.
- Make the reusable Flowline the single signature motif: one line branches into human checkout and Leash/x402 on marketing, advances only from real checkout events, and becomes the evidence rail in Leash. Hero choreography runs once and settles; reduced motion replaces travel and line drawing with static or opacity-only presentation.
- Add Motion only to React applications; use scoped CSS/SVG transitions in `@tab/sdk`.
- Add Playwright and axe infrastructure with deterministic Linux visual baselines.

### Real Integration Path

Network profiles replace duplicated constants without changing accepted chain, token, or facilitator values. Installed package types win over design assumptions.

### Mock/Simulation Policy

Component fixtures remain test-only. Shipped states accept real props and never manufacture financial records.

### Checks

- RED/GREEN tests for tokens, profile fail-close behavior, theme semantics, reduced motion, and component accessibility.
- Unknown profiles reject; mainnet never falls back to testnet.
- Official assets retain full names and accessible labels.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` remain green.

### Acceptance Criteria Covered

Consistent premium UI, chain identity, test/live separation, accessibility, and reusable states.

### Stop Condition

All new surfaces can build from shared primitives without importing application or database code.

## Phase R2: Marketing And Documentation Surfaces

### Goal

Give strangers and developers a complete, premium product story before authentication.

### Work

- Create static-first `apps/site` with the Flowline hero, human checkout, Leash/x402, one-rail/two-payers, evidence, developer preview, test/live boundary, and focused calls to action.
- Create `apps/docs` with native Next.js MDX for SDK, API, webhooks, Leash CLI/MCP, networks, receipts, security, and troubleshooting.
- Share brand/UI packages while keeping deployments independent.
- Use hard navigation between domains and explicit canonical URLs.

### Real Integration Path

Developer snippets compile against the built/packed SDK and CLI. Marketing claims reference implemented or explicitly forthcoming behavior.

### Mock/Simulation Policy

The public walkthrough is labeled illustrative. It contains no fake volume, customer count, balance, or transaction claim.

### Checks

- Playwright desktop/mobile visual and keyboard tests.
- Reduced-motion and no-JavaScript/static-content checks.
- Docs snippets build against package exports.
- SEO metadata, social preview, sitemap, robots, and canonical links validate.

### Acceptance Criteria Covered

A stranger can explain both payment flows and choose the right next action without crypto prerequisite knowledge.

### Stop Condition

Marketing and docs are independently buildable and contain no placeholder landing copy.

## Phase R3: Auth, App Entry, And Onboarding

### Goal

Turn signup into a branded, persistent, task-oriented journey.

### Work

- Replace bare merchant and Leash auth with branded Magic session restoration, OTP, resend cooldown, recovery, and accessible status feedback.
- Add the application workspace entry for Merchant and Leash while preserving authorization boundaries.
- Add merchant onboarding: identity, appearance, key, webhook, test checkout, go-live readiness.
- Add Leash onboarding: provision, cap/emergency policy, Test Lab, connect, first paid call, evidence.
- Allow users to leave and resume; compute progress from real persisted state.

### Real Integration Path

Always try `isLoggedIn()` and `getIdToken()` before OTP. Ordinary Tab sign-out clears only Tab sessions and never calls `magic.user.logout()`.

### Mock/Simulation Policy

No demo accounts or seeded completion. Missing configuration produces an actionable unavailable state.

### Checks

- RED/GREEN auth persistence, expired/rate-limited OTP, resume, ownership, and onboarding-readiness tests.
- Playwright happy and failure journeys.
- Session cookies remain host-only, secure, and same-origin.

### Acceptance Criteria Covered

Persistent Magic login, branded auth, resumable onboarding, and no redundant OTP under a valid Magic session.

### Stop Condition

A new real identity can reach a useful dashboard and see the exact next incomplete task.

## Phase R4: Base Sepolia Test Lab

### Goal

Make real testnet readiness visible and, when Circle access permits, claimable inside Tab.

### Work

- Introduce `BaseSepoliaFundingReadiness` with payer, exact network/asset, USDC/native legs, signer state, blockers, checked time, and explorer links.
- Add authenticated readiness and claim endpoints.
- Proxy Circle `/v1/faucet/drips` server-side for `BASE-SEPOLIA`, USDC, and optional native ETH.
- Add PostgreSQL atomic claims/idempotency, address/principal/IP cooldowns, Turnstile validation, bounded bodies/timeouts, sanitized errors, and `Retry-After`.
- Poll chain state independently and enable x402 only when USDC plus signer recovery are ready.

### Real Integration Path

The provider call, balance reads, and signer preflight are real. The endpoint is disabled until a live Circle credential proves access.

### Mock/Simulation Policy

Tests may stub provider/RPC responses. Production never fabricates a provider reference, transaction hash, balance, or ready status.

### Checks

- Wrong profile/asset/mainnet claim rejects.
- Already-funded payer causes no provider dispense.
- Concurrent idempotent requests produce one claim.
- Turnstile replay, provider 429/timeout, DB restart, and secret-safe logging tests pass.
- Native ETH absence does not block x402 readiness.

### Acceptance Criteria Covered

Test-funds labeling, friction-reduced setup, abuse resistance, and fail-closed separation from mainnet.

### Stop Condition

Readiness is always truthful; in-app claim is either live-proven or visibly unavailable with the exact official fallback.

## Phase R5: Checkout SDK And Merchant Test Workspace

### Goal

Make checkout feel like a trustworthy payment product while preserving the existing integration contract.

### Work

- Add backward-compatible `appearance`, `className`, and `onStageChange` PayButton props plus normalized merchant appearance in checkout context.
- Replace inline styles with scoped `--tab-*` variables and collision-safe styles.
- Rebuild trigger, branded auth, balance confirmation, add-funds, real execution substages, transaction-ID-backed submitted success, continuing verification, verified/settled evidence, and retry-safe failure.
- Instrument progress from real execution callbacks, never timers.
- Redesign `/demo` around the current tenant, signed intent, key, webhook, and built SDK.

### Real Integration Path

Magic session, Particle balance, payment execution, and server verification remain the source of truth. Checkout enters an immediate submitted-success state only after `ua.sendTransaction` returns a real `transactionId`, as required by AC-TAB-3. Settlement verification continues as a distinct evidence axis; webhooks and settled ledger state still wait for authoritative verification.

### Mock/Simulation Policy

Existing test-mode simulation remains explicitly labeled, randomized, server-persisted, and excluded from live claims. Live execution stays spike-gated.

### Checks

- RED/GREEN tests for every checkout state and transition, stale/double requests, focus trap, reduced motion, and host-style isolation.
- Network loss during confirmation lands in recoverable error without double payment.
- Packed SDK passes external-consumer render and type tests.

### Acceptance Criteria Covered

Branded PayButton, persistent auth, real progress, balance/add-funds clarity, submitted success plus independently verified settlement evidence, and developer-quality theming.

### Stop Condition

The entire test checkout is polished and truthful; live checkout remains unavailable until its real proof clears.

## Phase R6: Merchant Product

### Goal

Make merchant integration, operations, and evidence coherent rather than a collection of pages.

### Work

- Reorganize navigation around Overview, Integrate, Payments, Webhooks, and Settings.
- Turn Quickstart into a real-state checklist with copy/run controls and a direct test checkout.
- Add network/payer identity and settlement/webhook evidence to transactions.
- Add filtering/pagination and recovery to webhook deliveries.
- Add live checkout appearance preview and explicit go-live transition.

### Real Integration Path

All counts, rows, readiness, keys, webhooks, and payment evidence come from current APIs/DB/chain verification.

### Mock/Simulation Policy

No seeded merchant or transaction. Empty state is the correct first-run state.

### Checks

- Unit/integration tests for all state projections and pagination.
- Playwright first-run, populated, failure, and go-live flows.
- API keys and webhook secrets remain show-once/secret-safe.

### Acceptance Criteria Covered

Merchant setup, checkout integration, evidence, webhook operations, settings, and live-mode safety.

### Stop Condition

A real merchant can integrate and diagnose a test payment without reading repository internals.

## Phase R7: Leash Control Plane And Phase 9 Mobile

### Goal

Make policy-before-signing and payment evidence unmistakable on web and mobile.

### Work

- Reorganize Leash around Overview, Activity, Policy, Funds, Connect, and Emergency controls.
- Present status, cap, key, float, and signer as explicit pre-sign gates.
- Turn provisioning into provision, fund, cap, connect, first-call, evidence.
- Render challenge, authorization, facilitator, settlement, protected delivery, and independent verification as separate receipt axes.
- Resume and complete mobile P1-P6, manifest, service worker, icons, push, offline/stale state, and all four revoke levels.
- Keep mobile read/control-only; no on-device signing.

### Real Integration Path

Web/mobile read current APIs and PostgreSQL. Push requires HTTPS and real subscriptions. Rebalance badges render only from real operations.

### Mock/Simulation Policy

No seeded receipt, notification, balance, or rebalance. Blocked money actions remain disabled with exact prerequisite copy.

### Checks

- RED/GREEN receipt, policy, revocation, push, offline/restart, and install tests.
- Cap-exceeded/paused/nuked states make the absence of signature/transfer visible.
- Mobile routes never import wallet-signing code.

### Acceptance Criteria Covered

Leash oversight, evidence, policy, connect, notifications, revocation spectrum, and the original Phase 9 PWA requirements.

### Stop Condition

Owner control and evidence work end-to-end on desktop and installable mobile, with no desktop-link escape for emergency actions.

## Phase R8: Live Integration Lane

### Goal

Replace every Phase-0/6/10/11 blocked money path with live evidence or retain an explicit blocker.

### Work

- Run the Magic issuer/provider preflight at the start of execution, then resolve issuer trust and prove same-subject idempotency plus different-subject separation.
- Provision and persist the real Express wallet.
- Implement/verify Magic sign-data reconstruction and local signer recovery.
- Fund the wallet and run the packed CLI through real Tab 402, gates, facilitator, Base Sepolia settlement, retry 200, and independent server verification.
- Prove all specified negative paths and restart persistence.
- Run the separately funded live buyer checkout through Particle, merchant settlement reconciliation, and real webhook delivery.
- Prove live float top-up and withdrawal, then the agent mainnet payment when its authenticated facilitator prerequisites are configured; otherwise retain the exact blocker.
- Run the separate Particle mainnet transfer and cross-chain rebalance proof after funding.
- Build the asynchronous rebalance worker only after the Particle proof.
- Close the Tab-as-x402-resource loop with the same real Tab endpoint used by the Base Sepolia packed-CLI proof and reconcile its agent-paid row/webhook; do not treat the endpoint's earlier 402-only proof as full Phase 11 completion.

### Real Integration Path

Every payment uses real Magic, x402 facilitator, Circle USDC, trusted RPC, PostgreSQL, and on-chain settlement. Particle uses real mainnet funds.

### Mock/Simulation Policy

No mocked facilitator, signature, transaction hash, balance, receipt, or transfer. Local unit fixtures remain allowed outside judged/live paths.

### Checks

- Capture payer/payee, amount/network/asset/nonce/expiry, facilitator result, signature recovery, explorer transaction, PostgreSQL receipt/cycle, dashboard notification, and redacted CLI transcript.
- Cap, pause/nuke, insufficient float, duplicate nonce, and expired authorization create no unintended signature/transfer.
- Packed CLI restart retains persisted state.
- Particle destination and cross-chain float movement verify independently.
- Buyer submission, merchant settlement, webhook delivery, float top-up/withdrawal, and any claimed mainnet agent payment each have independent chain/DB evidence.
- Tab's protected resource, agent-paid merchant projection, and webhook converge on the same verified settlement rather than a seeded row.

### Acceptance Criteria Covered

Original B-03/B-04/B-10, F-9/F-15, live buyer checkout, merchant settlement/webhook, float top-up/withdrawal, first real Base Sepolia x402 payment, agent mainnet payment when prerequisites clear, first real Particle payment, Tab-as-x402-resource convergence, and flagship rebalance proof.

### Stop Condition

Every claimed live path has reproducible evidence; any provider-side gap remains explicitly BLOCKED and is not softened by UI.

## Phase R9: Domain Cutover And Release Hardening

### Goal

Ship the three surfaces without breaking identity, auth, API, or evidence guarantees.

### Work

- Deploy and smoke-test site, app/API, and docs independently.
- Register final Magic origins/issuer before DNS changes; retain compatibility aliases during migration.
- Add route-specific loading, error, and not-found boundaries.
- Complete accessibility, performance, security, responsive, reduced-motion, offline, and secret-safety audits.
- Remove all scaffold copy and update stale documentation claims.

### Real Integration Path

Production smoke tests use real auth and read-only live state first; money-moving probes follow the approved bounded test/mainnet procedures.

### Mock/Simulation Policy

No production fallback to local, testnet, seeded data, or simulated settlement.

### Checks

- `pnpm check:showcase`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm --filter @tab/web db:check`
- Packed SDK/CLI external-consumer verification.
- Verification audit, security review, code review, and green GitHub CI.

### Acceptance Criteria Covered

Complete product experience, domain separation, CI, distributable artifacts, and evidence-based release claim.

### Stop Condition

A new user can understand, configure, test, pay, inspect, recover, and control Tab without encountering a placeholder or falsely represented money state.

## Review Reconciliation

The 2026-07-18 independent plan review was verified under the repository's authoritative order (`DECISIONS.md` → spec/build plan → rebuild artifacts). Every material finding was accepted within the approved scope:

| Finding | Disposition | Evidence | Applied action |
| --- | --- | --- | --- |
| Checkout delayed success until verification | Accept | R-TAB-8 and AC-TAB-3 require immediate submitted success when real `ua.sendTransaction` returns `transactionId`; webhooks still wait for verification | R5, the surface map, brief, and workflow now separate submitted success from continuing verification |
| R8 omitted canonical blocked money paths | Accept | Canonical Phase 10/11 also names live buyer settlement/webhook, top-up, withdrawal, agent mainnet pay, and Tab-as-x402 convergence | Added explicit R8 work, checks, acceptance language, and live workflow gates |
| Phase-0 preflight was too late | Accept | Canonical Phase 0 is an early parallel prerequisite and Abu explicitly requested the bounded spike before returning to build work | Added early Magic preflight and real-address funding handoff before implementation; later R8 steps reconcile the live lane |
| Emergency levels replaced Freeze with key revoke | Accept | Canonical L2 Freeze blocks signing while leaving credentials untouched; L3 Cancel revokes signer subject and keys | Brief, surface map, and workflow now use Pause → Freeze → Cancel → Nuclear with exact consequences |
| RED steps could pass for the wrong reason or target absent workspaces | Accept | New `@tab/networks`, `@tab/ui`, `@tab/site`, and `@tab/docs` boundaries do not exist yet; a raw failing command cannot complete a governed step | First RED steps scaffold test-only manifests and all 17 RED steps use an exact sentinel through `scripts/assert-red.mjs` |
| Broad implementation steps and phase-only-at-end quality gates | Accept | AGENTS requires per-phase gates and the former onboarding/merchant/Leash/mobile steps crossed several routes and state families | Split route/state work into atomic steps and attached all five canonical gates to every R-phase endpoint |

## Verification Checkpoint

Before any completion claim:

1. Run the full command suite and report exact pass counts.
2. Run the project verification audit from spec/story/plan through code/tests.
3. Run security and independent code review; resolve every blocking finding.
4. Confirm GitHub CI green on the exact head.
5. Report transaction/explorer links for every live proof, plus remaining external blockers and deviations.
6. Confirm production contains no demo account, seeded tenant, fabricated money state, secret, or silent mainnet/testnet fallback.

## Handoff Notes

- Execute from `docs/plans/2026-07-18-tab-product-experience-rebuild-workflow.md` in three-step review batches.
- The design lane may continue while Magic/Circle/Particle prerequisites are external, but final integration acceptance may not.
- Stage only files created or changed for the active step; never use `git add .` in this dirty checkout.
- Re-read installed package types and current official documentation immediately before adding or changing an SDK/API dependency.
