---
intent: Rebuild Tab's complete public, checkout, merchant, Leash, mobile, and developer experience while preserving unfinished Phase 9 work and completing the real Magic, x402, and Particle proof lanes without fabricated money state.
success_criteria: All R0-R9 acceptance conditions in the approved research-backed plan pass, the built and packed artifacts work as external consumers use them, real Base Sepolia and Particle mainnet evidence exists where claimed, and GitHub CI is green.
risk_level: high
auto_approve: false
branch: codex/tab-experience-rebuild
worktree: false
dirty_worktree: allow
---

## Steps

Execution contracts:

- Course correction accepted 2026-07-18: UI testing is risk-based. Preserve stable tests, but do not expand RED/GREEN matrices for visual atoms, CSS, exact markup/wording, spacing, skeletons, badges, or animation details. Interpret future UI-focused RED steps as the smallest meaningful state, money, security, recovery, or accessibility boundary; verify presentation through direct browser inspection, a small Playwright desktop/mobile/reduced-motion journey set, and axe on judged routes. Financially consequential and persistence contracts remain fully test-driven.
- When a RED step still protects one of those meaningful boundaries, scaffold only the testable workspace boundary when it does not yet exist, add an exact `[RED: …]` sentinel test, and verify through `scripts/assert-red.mjs`. That harness succeeds only when the command exits non-zero and the named sentinel appears; a missing workspace or unrelated failure cannot satisfy RED.
- Every phase-ending review also runs `pnpm check:showcase`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. A phase is not complete while one is red; pre-existing failures are recorded, then fixed in scope before the checkpoint is accepted.
- Live-provider steps may conclude with a precisely evidenced external blocker only where the action says so. They may never substitute seeded data, a mocked provider, or a fabricated money result.

- [ ] **Step 1: Validate the durable R0 design package**
action: Review `.thoughts/design/2026-07-18-tab-product-experience-surface-map.md`, `.thoughts/design/2026-07-18-tab-product-experience-designer-brief.md`, and `.thoughts/plans/2026-07-18-tab-product-experience-rebuild.md`; correct broken links, missing required headings, or contradictions with the canonical build plan without editing other existing `.thoughts` files.
loop: until clean
max_iterations: 3
verify:
  - type: artifact
    path: .thoughts/design/2026-07-18-tab-product-experience-surface-map.md
    assert:
      kind: exists
  - type: artifact
    path: .thoughts/design/2026-07-18-tab-product-experience-designer-brief.md
    assert:
      kind: exists
  - type: artifact
    path: .thoughts/plans/2026-07-18-tab-product-experience-rebuild.md
    assert:
      kind: exists
  - type: shell
    command: rg -n '^## (Entry Points And Navigation Flow|Screen Inventory|Per-screen Required States|On-screen Data Shapes|Generated Artifacts|Copy And Vocabulary Rules|Decided vs Designer.s Call|Traceability|Open Questions)' .thoughts/design/2026-07-18-tab-product-experience-surface-map.md | awk 'END { exit(NR == 9 ? 0 : 1) }'

- [ ] **Step 2: Capture the pre-rebuild UI baseline**
action: Create `.thoughts/design/2026-07-18-tab-current-ui-baseline.md` from current source and browser inspection, recording the root placeholder, all public/auth/merchant/checkout/Leash/mobile/docs surfaces, their existing state coverage, visual debt, and the unfinished Phase 9 file list; include no secrets or invented runtime result.
loop: false
verify:
  type: artifact
  path: .thoughts/design/2026-07-18-tab-current-ui-baseline.md
  assert:
    kind: exists

- [ ] **Step 3: Generate the landing concept checkpoint**
action: Use the built-in image generation tool in `ui-mockup` mode to produce a preview-only desktop/mobile concept for the approved financial-atelier landing direction: warm paper and ink surfaces, a one-shot Flowline entering Tab and branching into human checkout and Leash/x402, Instrument Sans product voice, sparse Instrument Serif marketing emphasis, Geist Mono evidence, cobalt action, emerald verification, testnet amber, no fake metrics, no generic glassmorphism, and no distorted third-party logos.
loop: false
verify:
  type: human-review
  prompt: Confirm the landing concept feels recognizably Tab, explains one rail and two payers, avoids generic SaaS/Web3 styling, and uses motion composition that can become a one-shot, reduced-motion-safe Flowline.
gate: human

- [ ] **Step 4: Generate the checkout state-strip checkpoint**
action: Use the built-in image generation tool to produce one preview-only state strip containing trigger loading, branded Magic email/OTP, unified balance, insufficient/add-funds, real processing substages, submitted success after a real transactionId, verification in progress, verified/settled evidence, and specific recovery; keep test/live treatment unmistakable and avoid timer-based fake progress.
loop: false
verify:
  type: human-review
  prompt: Confirm the checkout sequence reads like a credible payment product, keeps merchant/amount/mode oriented, and distinguishes submission from independent verification.
gate: human

- [ ] **Step 5: Generate the product-family checkpoint**
action: Use the built-in image generation tool to produce a preview-only coordinated merchant, Leash receipt/policy, and mobile emergency-control concept using the same financial-atelier tokens and Flowline evidence rail without compressing desktop navigation into mobile.
loop: false
verify:
  type: human-review
  prompt: Confirm merchant, Leash, and mobile feel like one product while preserving their distinct jobs and making policy-before-signature visible.
gate: human

- [ ] **Step 6: Reintegrate the accepted visual checkpoints**
action: Create a dated prototype discovery report and a dated prototype reintegration matrix under `.thoughts/prototype-discovery/` and `.thoughts/prototype-reintegration/`, classifying every illustrated value/action as real MVP, visibly simulated test-only, blocked, deferred, or visual-only before any implementation copies the concepts.
loop: until clean
max_iterations: 3
verify:
  - type: artifact
    path: .thoughts/prototype-discovery
    assert:
      kind: matches-glob
      value: "2026-07-18-*.md"
  - type: artifact
    path: .thoughts/prototype-reintegration
    assert:
      kind: matches-glob
      value: "2026-07-18-*.md"
  - type: human-review
    prompt: Confirm no prototype-only data or money transition can silently become a judged production path.
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 7: Run the early Phase-0 Magic preflight**
action: Before product implementation, rerun the current secret-safe Magic Express preflight against the deployed stable OIDC issuer and discovery/JWKS endpoints. If Magic accepts the issuer, provision the owned agent through the real wallet API and prove same-subject idempotency plus different-subject separation; if it rejects, capture the exact provider stage/status/trace with credentials redacted and retain B-03 as blocked while the non-money build lane continues.
loop: false
verify:
  type: human-review
  prompt: Accept either genuine provider-returned wallet/idempotency evidence or a redacted reproducible Magic provider blocker; reject any locally generated address or mocked response.
gate: human

- [ ] **Step 8: Hand off the real testnet funding prerequisite**
action: Only after Step 7 returns a real provider-owned public address, persist it to the correct agent and return that address to Abu with the Circle faucet link, exact `Base Sepolia` / `eip155:84532` chain, Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, and `Test funds — not real money` label, then pause the live lane for Abu to report funding. If Step 7 remains provider-blocked, record that no payer address exists and do not request funding; continue only the independent build lane.
loop: false
verify:
  type: human-review
  prompt: Confirm the returned address came from Magic and the chain/token/faucet instructions are exact, or acknowledge the evidenced provider blocker and absence of any address.
gate: human

- [ ] **Step 9: Write RED tests for canonical network profiles**
action: Create only the `@tab/networks` package/test manifest plus the repository `scripts/assert-red.mjs` harness, then add an exact `[RED: canonical network profiles]` test requiring immutable Base, Arbitrum, and Base Sepolia profiles with CAIP-2, numeric chain ID, full name, official-asset identifier, explorer, native asset, Circle USDC, facilitator when applicable, and explicit `testFunds`; require unknown profile rejection and no mainnet-to-testnet fallback. Do not add implementation exports.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: canonical network profiles]" -- pnpm --filter @tab/networks test

- [ ] **Step 10: Implement the framework-neutral networks package**
action: Create `packages/networks/package.json` and minimal source exports that satisfy Step 9, then migrate one low-risk duplicated network consumer to prove the package boundary without changing accepted values.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/networks test
  - type: shell
    command: pnpm --filter @tab/networks typecheck

- [ ] **Step 11: Write RED tests for shared visual tokens**
action: Create only the `@tab/ui` package/test manifest when absent, then add an exact `[RED: shared visual tokens]` test requiring the locked financial-atelier light/dark/system palette, Instrument Sans / sparse Instrument Serif / Geist Mono roles, semantic test/live/status colors, focus visibility, and reduced-motion variables without embedding application or financial fixture state. Do not add token implementation.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: shared visual tokens]" -- pnpm --filter @tab/ui test

- [ ] **Step 12: Implement the shared UI token package**
action: Create `packages/ui/package.json`, theme styles, font-role exports, and a minimal provider satisfying Step 11; expose internal-only React/CSS entry points and keep server/database code out of the package.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/ui test
  - type: shell
    command: pnpm --filter @tab/ui typecheck

- [ ] **Step 13: Write RED tests for shared state primitives**
action: Add an exact `[RED: shared state primitives]` behavior/accessibility test for status badge, network identity, copy control, skeleton, empty state, error state, Flowline evidence rail, dialog/sheet, and live-region primitives; require full network names, stable skeleton geometry, and no focusable skeleton controls.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: shared state primitives]" -- pnpm --filter @tab/ui test

- [ ] **Step 14: Implement shared state primitives**
action: Implement the minimal components and styles required by Step 13 with files split below the 300-line cap and no wall-of-cards/nested-card abstraction.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/ui test
  - type: shell
    command: pnpm --filter @tab/ui lint

- [ ] **Step 15: Write RED tests for motion policy**
action: Add an exact `[RED: motion policy]` test requiring one-shot Flowline transitions, real-event stage input, static reduced-motion output, no perpetual decorative animation, and unchanged semantic content when motion is disabled.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: motion policy]" -- pnpm --filter @tab/ui test

- [ ] **Step 16: Implement application motion primitives**
action: Implement the framework-neutral, caller-driven StageFlowline in `@tab/ui` with scoped CSS/SVG and no internal timer or stage state. Add the current Context7-verified `motion` dependency to each of site/web/docs only when that real application exists and adopts an application reveal/layout wrapper; do not scaffold an application solely to install a dependency, and keep `@tab/sdk` and `@tab/agent` free of it.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/ui test
  - type: shell
    command: rg -n '"motion"' packages/sdk/package.json apps/agent/package.json && exit 1 || exit 0

- [ ] **Step 17: Establish browser and accessibility test infrastructure**
action: Add Playwright and axe configuration, deterministic Linux screenshot settings, desktop/tablet/mobile projects, light/dark/reduced-motion coverage, and a smoke test for the current root without changing product behavior.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm test:e2e
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build

- [ ] **Step 18: Write RED tests for the marketing surface**
action: Scaffold only the `@tab/site` package/test configuration when absent, then add an exact `[RED: marketing surface]` route/component test requiring the thesis hero, human path, agent path, evidence, developer preview, test/live boundary, and two distinct calls to action with no fake metric or unlabeled illustrative transaction. Do not implement the route.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: marketing surface]" -- pnpm --filter @tab/site test

- [ ] **Step 19: Implement the static-first marketing application**
action: Create `apps/site` with the approved financial-atelier responsive composition, shared tokens, one-shot/reduced-motion Flowline, metadata, social image, sitemap, robots, and hard links to app/docs; satisfy Step 18 without adding a seeded public demo.
gate: human
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/site test
  - type: shell
    command: pnpm --filter @tab/site build

- [ ] **Step 20: Review the marketing application in browser**
action: Run the site locally and inspect desktop/mobile, keyboard, reduced motion, no-JavaScript content, copy, and official-asset treatment; fix deterministic defects only.
loop: until clean
max_iterations: 3
verify:
  type: browser
  url: http://localhost:3001/
  check: The first viewport states Tab's product thesis, shows the meaningful two-path Flowline, has visible focus and no fake financial metric.
gate: human

- [ ] **Step 21: Write RED tests for documentation information architecture**
action: Scaffold only the `@tab/docs` package/test configuration when absent, then add an exact `[RED: documentation information architecture]` test requiring SDK, API, webhooks, Leash CLI/MCP, networks, receipts, security, and troubleshooting navigation plus a mobile sidebar and explicit test/live vocabulary. Do not implement documentation routes.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: documentation information architecture]" -- pnpm --filter @tab/docs test

- [ ] **Step 22: Implement the branded MDX documentation application**
action: Create `apps/docs` with native Next.js MDX, shared quiet visual language, code/copy components, search-ready metadata, and representative content that compiles against actual package exports.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/docs test
  - type: shell
    command: pnpm --filter @tab/docs build

- [ ] **Step 23: Verify package snippets as external consumers**
action: Pack `@tab/sdk` and the Leash CLI, install them in a temporary external consumer, and compile/run every install/import/configuration snippet published by site/docs without importing repository source paths.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build

- [ ] **Step 24: Write RED tests for branded persistent authentication**
action: Add an exact `[RED: branded persistent authentication]` case to merchant and Leash auth tests requiring session-check branding, `isLoggedIn()`/`getIdToken()` restoration before OTP, resend/invalid/expired/rate-limit/provider-unavailable states, and ordinary logout that never calls `magic.user.logout()`.
gate: human
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: branded persistent authentication]" -- pnpm --filter @tab/web test

- [ ] **Step 25: Implement the shared authentication experience**
action: Refactor merchant and Leash auth into the shared branded shell and state primitives while preserving existing API/auth boundaries and satisfying Step 24.
gate: human
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 26: Write RED tests for resumable onboarding projections**
action: Add an exact `[RED: resumable onboarding projections]` test for workspace entry and merchant/Leash onboarding progress derived only from owned real DB state, including incomplete, partially complete, complete, provider unavailable, and expired-session cases.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: resumable onboarding projections]" -- pnpm --filter @tab/web test

- [ ] **Step 27: Implement workspace entry and onboarding projections**
action: Add the role-aware app workspace entry plus real DB-derived onboarding projection/read models required by Step 26, including exit/resume and first-incomplete-task routing; do not implement merchant or Leash task screens in this step.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test
  - type: browser
    url: http://localhost:3000/
    check: A restored user can choose Merchant or Leash and route to the first real incomplete task without a redundant OTP.

- [ ] **Step 28: Implement resumable merchant onboarding**
action: Implement merchant identity, checkout appearance, API-key, webhook, test-workspace, and go-live prerequisite tasks one route at a time from the Step 27 projection; each task must persist owned real state and resume exactly without a seeded completion.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 29: Implement resumable Leash onboarding**
action: Implement provision, policy, Test Lab, Connect, first-call, and evidence tasks one route at a time from the Step 27 projection; preserve exact Magic/funding/provider unavailable states and never mint a local wallet address.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build

- [ ] **Step 30: Write RED tests for Base Sepolia funding readiness**
action: Add an exact `[RED: Base Sepolia funding readiness]` test for `BaseSepoliaFundingReadiness` and its authenticated read API requiring `eip155:84532`, Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, independent USDC/native legs, signer state, blockers, checked time, explorer links, and permanent test-funds labeling.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: Base Sepolia funding readiness]" -- pnpm --filter @tab/web test

- [ ] **Step 31: Implement read-only Test Lab readiness**
action: Implement the typed readiness projection and UI from real Magic provisioning state and trusted chain-ID-checked RPC reads; require USDC plus signer recovery for x402 while leaving native ETH optional.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 32: Write RED tests for atomic faucet claims**
action: Add an exact `[RED: atomic faucet claims]` database/API test for authenticated ownership, unique idempotency, concurrent request serialization, address/principal/IP cooldowns, Turnstile replay, bounded bodies/timeouts, provider 429 metadata, restart persistence, secret-safe errors, and fail-closed mainnet/wrong-asset rejection.
gate: human
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: atomic faucet claims]" -- pnpm --filter @tab/web test

- [ ] **Step 33: Implement the Circle-backed claim service**
action: Add the PostgreSQL migration, claim service, Turnstile server validation, Circle `BASE-SEPOLIA` native/USDC proxy, provider circuit breaker, `Retry-After`, and independent balance reconciliation required by Step 32; keep the claim control disabled when live provider configuration is absent.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test
  - type: shell
    command: pnpm --filter @tab/web db:check
gate: human

- [ ] **Step 34: Prove the live Circle claim or retain its blocker**
action: With a server credential that is already configured locally, make one bounded real Base Sepolia claim to an owned agent address, poll trusted RPC balances, and store/redact evidence; if Circle access is rejected, record the exact provider blocker and verify the official fallback/polling UI instead of enabling the claim.
loop: false
verify:
  - type: human-review
    prompt: Review the live provider result, redaction, observed balances, cooldown, and permanent test-funds labeling; approve only if no credential or fabricated transaction claim is exposed.
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 35: Write RED tests for backward-compatible PayButton appearance**
action: Add an exact `[RED: backward-compatible PayButton appearance]` SDK type/behavior test for optional `appearance`, `className`, and `onStageChange`, normalized merchant appearance, prefixed CSS variables, host-style isolation, and unchanged behavior for existing PayButton callers.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: backward-compatible PayButton appearance]" -- pnpm --filter @tab/sdk test

- [ ] **Step 36: Implement the scoped checkout visual shell**
action: Replace checkout inline style objects with collision-safe scoped styles, merchant/Tab identity, exact amount/mode orientation, light/dark/system appearance, official network treatment, and reduced-motion behavior satisfying Step 35 without adding Motion.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/sdk test
  - type: shell
    command: pnpm --filter @tab/sdk build

- [ ] **Step 37: Write RED tests for real checkout progress and recovery**
action: Add an exact `[RED: real checkout progress and recovery]` test for execution callbacks driving preparing/authorizing/submitting, immediate submitted success only after a real `transactionId`, continuing independent settlement verification, insufficient/add-funds QR/copy/recheck, lost-network ambiguity, safe reconciliation, duplicate protection, and every existing auth/balance/error state.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: real checkout progress and recovery]" -- pnpm --filter @tab/sdk test

- [ ] **Step 38: Implement the complete checkout state presentation**
action: Implement branded auth, balance, insufficient/add-funds, real progress, immediate submitted success after a real transaction ID, continuing independent verification evidence, and specific recovery views plus the merchant-owned `/demo` workspace required by Step 37; retain explicit server-persisted simulation labeling and the live spike gate.
gate: human
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/sdk test
  - type: shell
    command: pnpm --filter @tab/web test

- [ ] **Step 39: Verify checkout as an external consumer**
action: Pack the SDK, install it in a temporary React consumer, run the full test checkout in a browser at desktop/mobile/reduced-motion breakpoints, and verify focus, paste, retry, and host-style isolation.
loop: until clean
max_iterations: 3
verify:
  - type: browser
    url: http://localhost:3000/demo
    check: The packed PayButton completes a visibly labeled persisted test payment through every real state and returns authoritative evidence without layout shift or focus loss.
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 40: Write RED tests for merchant information architecture and states**
action: Add an exact `[RED: merchant information architecture]` test requiring Overview, Integrate, Payments, Webhooks, and Settings navigation; real-state Quickstart, payment evidence, webhook filtering/pagination/recovery, appearance preview, and explicit go-live prerequisites across loading/empty/error/success states.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: merchant information architecture]" -- pnpm --filter @tab/web test

- [ ] **Step 41: Implement the merchant shell and overview**
action: Refactor only the merchant navigation shell and Overview into Step 40's information architecture using shared primitives and existing APIs/DB projections; preserve loading/empty/error states, add no seeded tenant/row, and split any expanded file before 300 lines.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test
  - type: shell
    command: pnpm --filter @tab/web lint

- [ ] **Step 42: Implement merchant Integrate and appearance settings**
action: Rebuild Quickstart/Integrate, API-key, checkout-appearance preview, and merchant identity settings one route at a time from real tenant state, retaining show-once key behavior and unavailable prerequisites.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 43: Implement merchant payments and receipt evidence**
action: Rebuild Payments list/detail with real filters, pagination, payer type, lifecycle, settlement, explorer, and verification evidence; prove honest day-zero empty state and never synthesize a row.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 44: Implement merchant webhooks and go-live readiness**
action: Rebuild webhook configuration, delivery log/detail/recovery, Settings, and Go Live one route at a time from existing APIs and durable state; retain encrypted-secret behavior and explicit unmet live prerequisites.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test
gate: human

- [ ] **Step 45: Browser-review the merchant golden journey**
action: Exercise first-run through key, webhook, packed checkout, persisted transaction/delivery, settings preview, and go-live readiness at desktop/mobile widths; fix deterministic defects and retain unavailable live proof gates.
loop: until clean
max_iterations: 3
verify:
  - type: browser
    url: http://localhost:3000/dashboard/quickstart
    check: A real tenant can identify and complete each integration step, run test checkout, and inspect payment/webhook evidence without repository knowledge.
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 46: Write RED tests for policy-first Leash evidence**
action: Add an exact `[RED: policy-first Leash evidence]` test requiring status/cap/key/float/signer gates before signature, provision/fund/cap/connect/first-call onboarding, full receipt axes, copy/run controls, and truthful blocked top-up/rebalance/withdraw states.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: policy-first Leash evidence]" -- pnpm --filter @tab/web test

- [ ] **Step 47: Implement the Leash shell, overview, and activity**
action: Refactor only the Leash shell, Overview, Activity feed, receipt detail, and notifications using existing APIs/DB projections; cover honest loading/empty/stale/error states with no fabricated receipt or notification.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test
  - type: shell
    command: pnpm --filter @tab/web lint

- [ ] **Step 48: Implement Leash policy, funds, and Connect**
action: Rebuild cap/cycle policy, exact-chain float views, Test Lab, provisioning, and packed CLI/MCP Connect journey one route at a time from real DB/chain/provider state; keep top-up/rebalance/withdraw disabled until their live proofs.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test

- [ ] **Step 49: Implement the four Leash emergency controls**
action: Implement and independently reconcile Pause, Freeze, Cancel, and Nuclear from existing server actions/audit state: Freeze blocks signing with credentials untouched, Cancel revokes signer subject and keys, and Nuclear preserves the withdrawal-first safety boundary.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test
gate: human

- [ ] **Step 50: Make the preserved Phase 9 feed and receipt tests RED for the right reason**
action: Review the existing untracked mobile shell/feed/receipt/PWA tests, correct only invalid imports or stale expectations, add an exact `[RED: Phase 9 mobile behavior]` overview/notifications/controls case, and confirm the focused failure is caused by absent behavior rather than syntax/configuration.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: Phase 9 mobile behavior]" -- pnpm --filter @tab/web test -- app/mobile lib/mobile

- [ ] **Step 51: Implement mobile overview, feed, and receipt detail**
action: Complete the preserved Phase 9 overview, activity feed, receipt detail, and mobile-specific navigation from owner-scoped real APIs, including loading/live/retrying/empty and pending/settled/failed/blocked states; retain permanent Base Sepolia test-funds labeling.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test -- app/mobile lib/mobile

- [ ] **Step 52: Implement mobile notifications and emergency controls**
action: Complete push/notification state plus Pause, Freeze, Cancel, and Nuclear confirmation/reconciliation on mobile; prove owner scope and auth-expiry behavior, and keep all signing code off-device.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm --filter @tab/web test -- app/mobile lib/mobile
  - type: shell
    command: rg -n 'magic-signer|sign/data|createTransferTransaction' apps/web/app/mobile apps/web/lib/mobile && exit 1 || exit 0
gate: human

- [ ] **Step 53: Implement PWA install and offline behavior**
action: Add manifest, generated icons/splash assets, service worker, install affordance, stale/offline read persistence, update handling, and deep links; render rebalance only from real operations and never cache secrets or mutation responses.
loop: until tests pass
max_iterations: 5
verify: pnpm --filter @tab/web test -- app/mobile lib/mobile

- [ ] **Step 54: Browser-review Leash desktop and installed-mobile control**
action: Exercise empty/active/paused/nuked, low float, pending/settled/blocked receipts, stale/offline, push permission, install, and each emergency level; confirm mobile never escapes to desktop for a promised control.
loop: until clean
max_iterations: 3
verify:
  - type: browser
    url: http://localhost:3000/mobile
    check: The installable monitor presents real/stale state clearly and can invoke and independently confirm all four emergency controls without on-device signing.
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 55: Reconcile the live Magic provisioning blocker**
action: Re-run the current secret-safe Magic Express preflight against the stable issuer, record the provider trace/status, and proceed only when the provider accepts the issuer; prove same subject returns the same wallet and a different subject returns a different wallet, persisting only provider-returned addresses.
loop: false
verify:
  type: human-review
  prompt: Review provider evidence and approve continuation only when issuer trust, subject idempotency, address separation, and redaction are proven; otherwise retain the blocker.
gate: human

- [ ] **Step 56: Prove live Magic EIP-712 signing and recovery**
action: For the provisioned owned wallet, sign the exact x402 EIP-712 payload through Magic `/v1/wallet/sign/data`, reconstruct the observed signature, recover locally, and require equality with the provisioned address; capture timeouts, leases, reconciliation, and provider-specific errors without secrets.
loop: false
verify:
  type: human-review
  prompt: Review the exact typed-data hash, reconstructed signature shape, recovered signer equality, lease/idempotency evidence, and secret-safe transcript before accepting the signer.
gate: human

- [ ] **Step 57: Run the real packed Base Sepolia x402 E2E**
action: Use the built/packed Leash CLI through stdio or paid_fetch to hit Tab's real 402 endpoint, pass server gates, obtain the real Magic signature, settle through `https://x402.org/facilitator`, retry to 200, independently verify Base Sepolia Circle USDC settlement, and reconcile the PostgreSQL receipt/cycle/dashboard/notification.
loop: false
verify:
  type: human-review
  prompt: Confirm payer, payee, 1,000 atomic USDC amount, eip155:84532, exact asset, nonce/expiry, facilitator response, signer recovery, BaseScan transaction, protected 200, PostgreSQL evidence, and redacted CLI transcript are all genuine.
gate: human

- [ ] **Step 58: Prove live x402 failure safety and restart persistence**
action: Against the real integration, prove cap-exceeded, paused/nuked, insufficient float, duplicate request/nonce, and expired authorization create no unintended signature or transfer; restart CLI/server and prove persisted state and reconciliation still work.
loop: false
verify:
  type: human-review
  prompt: Review chain, signer-call, receipt, lease, and restart evidence for every negative scenario; reject if any path relies on a seeded receipt or mocked facilitator.
gate: human

- [ ] **Step 59: Run the funded Particle mainnet proof**
action: After the known EOA/UA is funded with approximately 20 real Base-mainnet USDC, prove installed Particle 2.0.3 `createTransferTransaction`, both required Magic signatures, `sendTransaction`, destination confirmation, and cross-chain float movement; capture explorer links and do not claim testnet UA support.
loop: false
verify:
  type: human-review
  prompt: Confirm the funded source, two recovered Magic signatures, real destination receipt, Particle transaction result, and independently observed cross-chain balance change before unblocking rebalance.
gate: human

- [ ] **Step 60: Prove the live buyer checkout and merchant settlement**
action: With the funded owned buyer UA and live merchant configuration, execute the built/packed PayButton as an external consumer, require immediate submitted success only after Particle returns a real transaction ID, then independently reconcile merchant receipt, token changes, settled payment row, and the signed webhook delivery. Do not use the server-persisted test-payment simulator for this proof.
loop: false
verify:
  type: human-review
  prompt: Confirm buyer source, merchant destination, Particle transaction and explorer evidence, immediate submitted-success timing, authoritative settlement, PostgreSQL rows, and real webhook delivery all describe the same payment.
gate: human

- [ ] **Step 61: Prove live float top-up and withdrawal**
action: Against owned Base and Arbitrum agent floats, run the real top-up and withdrawal paths with installed Particle behavior already proven in Step 59, independently verify both destination balance changes, persist durable operation evidence, and prove ambiguous/restart reconciliation; if funding is insufficient, retain the exact funded prerequisite without simulating movement.
loop: false
verify:
  type: human-review
  prompt: Accept only real source/destination chain evidence and matching durable operation rows for top-up and withdrawal, or an exact funding blocker with both actions still disabled.
gate: human

- [ ] **Step 62: Close agent mainnet and Tab-as-x402-resource convergence**
action: When authenticated mainnet facilitator prerequisites are configured, run the packed Leash CLI through a real mainnet agent payment and reconcile its receipt; independently ensure Tab's canonical Base Sepolia protected resource proof from Step 57 produces the same agent-paid merchant projection and signed webhook contract as a human payment. If mainnet facilitator access remains absent, record that blocker while still proving the Base Sepolia Tab-resource convergence without relabeling it mainnet.
loop: false
verify:
  type: human-review
  prompt: Confirm the exact network and facilitator for each proof, real chain/receipt evidence, the Tab protected retry, agent-paid merchant row, and signed webhook; reject any conflation of Base Sepolia with mainnet.
gate: human

- [ ] **Step 63: Write RED tests for asynchronous rebalance operations**
action: Add an exact `[RED: asynchronous rebalance operations]` test for low-float detection, serialized/idempotent operation claims, Particle transfer dispatch, ambiguous result reconciliation, restart persistence, notification/mobile projection, and strict absence from the x402 hot path.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: asynchronous rebalance operations]" -- pnpm test

- [ ] **Step 64: Implement the rebalance worker after live proof**
action: Implement the asynchronous watcher/worker, durable `rebalance_ops` lifecycle, reconciliation, dashboard/mobile projection, and secret-safe observability required by Step 63 using only the Particle behavior proven in Step 59.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm test
  - type: shell
    command: rg -n 'createTransferTransaction|sendTransaction' apps/agent/src/payment-client.ts apps/agent/src/fetch-wrapper.ts && exit 1 || exit 0
  - type: shell
    command: pnpm check:showcase
  - type: shell
    command: pnpm lint
  - type: shell
    command: pnpm typecheck
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 65: Write RED tests for domain and OIDC migration**
action: Add an exact `[RED: domain and OIDC migration]` configuration test for marketing/app/docs origins, host-only application cookies, explicit CORS, stable current issuer compatibility, final issuer parallel acceptance, canonical redirects, and production rejection of localhost or testnet fallback.
loop: false
verify: node scripts/assert-red.mjs --expect "[RED: domain and OIDC migration]" -- pnpm test

- [ ] **Step 66: Implement deployment separation and route boundaries**
action: Add deployment configuration/env contracts for the three applications, register final Magic origin/issuer only after provider acceptance, preserve compatibility aliases, and add route-specific loading/error/not-found boundaries without cutting DNS yet.
loop: until tests pass
max_iterations: 5
verify:
  - type: shell
    command: pnpm test
  - type: shell
    command: pnpm build
gate: human

- [ ] **Step 67: Run the complete local verification suite**
action: Run every canonical quality gate, database check, browser/accessibility/visual suite, packed external-consumer test, showcase grep, and file-length audit; fix failures without weakening tests or financial boundaries.
loop: until clean
max_iterations: 5
verify: pnpm check:showcase && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build && pnpm --filter @tab/web db:check

- [ ] **Step 68: Run verification, security, and code-review audits**
action: Execute the project verification audit from spec/story/plan to code/tests, run an authorized repository security review and independent code review, resolve every blocking finding, and record exact commands/counts/live links/blockers/deviations.
loop: until clean
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm traceability is complete, all blocking security/code-review findings are resolved, and every live claim has reproducible evidence.
gate: human

- [ ] **Step 69: Confirm GitHub CI and release readiness**
action: Push the exact reviewed head, wait for all required GitHub checks, inspect any failure rather than rerunning blindly, and produce the final release report with green run links, exact test counts, packed artifacts, transaction links, remaining external blockers, and domain-cutover status.
loop: until clean
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm required GitHub checks are green on the exact head and the report makes no completion claim beyond the attached evidence.
gate: human
