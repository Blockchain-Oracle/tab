# Prototype Reintegration: Tab Financial Atelier Checkpoints

## Verdict

**ALLOWED for the non-money implementation lane; conditionally allowed for provider-backed slices; BLOCKED for any unproven live-money claim.**

The three approved boards preserve the canonical functional model and improve its presentation. They are safe to translate into components only under the matrix below. They do not prove Magic provisioning/signing, Circle faucet access, Base Sepolia x402 settlement, Particle mainnet transfer/rebalance, or mobile completion.

## Inputs Checked

- Discovery: `../prototype-discovery/2026-07-18-tab-financial-atelier-checkpoints.md`
- Three approved PNG checkpoints under `../design/checkpoints/2026-07-18/`
- Designer brief, product surface map, current UI baseline, additive rebuild plan/workflow
- Domain wiki and canonical spec/stories/build plan/decisions/quality profile
- Prior skeptic-corrected reintegration `2026-07-06-tab-v1.md`
- Current Next.js routes, Drizzle schemas, SDK state machine, Leash APIs, x402 test resource, and uncommitted Phase 9 mobile files/tests

## Screen-to-Reality Matrix

| ID | Surface/state | Real source and side effect | Boundary/persistence | Decision | No-shipping rule |
| --- | --- | --- | --- | --- | --- |
| L-1 | landing thesis and two branches | static product explanation grounded in implemented architecture | public, no financial state | `REAL_MVP` | never imply a completed provider proof |
| L-2 | illustrative branch events | labeled product anatomy only | no DB/API mutation | `SIMULATED_DEMO_ONLY` | terminal green proof copy stays neutral/blocked until corresponding live evidence exists |
| L-3 | Flowline motion | semantic route/stage/evidence props | client presentation only | `REAL_MVP` | no timer may advance payment meaning |
| C-1 | trigger/context | signed intent and `GET /api/v1/checkout-context` | public-key scope; no created amount constant | `REAL_MVP` | stable skeleton is not an empty state |
| C-2 | Magic email/OTP/session | real Magic events and Tab session binding | Magic + host-only Tab session | `REAL_MVP` | restore session before OTP; ordinary logout preserves Magic |
| C-3 | Tab balance | Particle `getPrimaryAssets()` result | authenticated wallet read | `REAL_MVP` | never render checkpoint balance placeholders |
| C-4 | live add funds | real buyer/UA address plus checkout-context-supported network | authenticated address read; no trustline | `REAL_MVP` | pictured `Base` is visual-only; never show actionable funding inside simulated test mode |
| C-5 | simulated test payment | existing randomized, server-persisted test lifecycle | test environment + `simulated_test` verification | `SIMULATED_DEMO_ONLY` | exact `Test payment — no real funds moved`; no provider transaction or on-chain settlement claim |
| C-6 | live Particle execution | installed UA 2.0.3 + both Magic signatures + `sendTransaction` | real wallet/money side effect | `BLOCKED` until funded live proof | no fake progress or success path |
| C-7 | submitted success | real provider `transactionId` returned | persisted pending payment/report | `REAL_MVP` once C-6 is reachable | may say submitted; may not say confirmed/settled/verified |
| C-8 | completion/verified evidence | persisted simulated completion, or backend verification and `settlements` row for live execution | DB + RPC/Particle evidence | simulated completion `SIMULATED_DEMO_ONLY`; live `BLOCKED` | simulation may say `Test completed` / `simulated verification persisted`; never unqualified settled/verified/payment-received or settlement-observed; live emerald/verified waits for authoritative mainnet proof |
| C-9 | safe recovery | durable report handoff plus payment status/reconcile read | idempotent server read/write retry | `REAL_MVP` prerequisite not yet complete | unknown-after-broadcast must block resubmission; do not enable pictured close/status CTA first |
| M-1 | merchant checklist/next action | merchant, key, webhook, quickstart, payment/settlement rows | tenant-scoped PostgreSQL | `REAL_MVP` | no seeded completion, greeting, or counts |
| M-2 | webhook requirement/evidence | real signed test delivery and `verified_at` | tenant-scoped endpoint/delivery rows | `REAL_MVP` | no fake delivery/latency/provider response |
| M-3 | test workspace empty/evidence | current tenant intent, SDK, order, payment, webhook | tenant-scoped API/DB | `REAL_MVP` | day zero is an honest empty state |
| A-1 | agent gate rail | one server evaluation of status, cap, key, exact-chain float, signer with exact failed code | owner/key auth; receipt/audit persistence | `REAL_MVP` | failed gate creates no signature or transfer; `No settlement expected` needs stored gate/audit evidence |
| A-2 | placeholder payer/signer | Magic Express `POST /v1/wallet`, persisted provider address | owner-scoped agent row | `BLOCKED` on Magic issuer/provider acceptance | never generate a local substitute address |
| A-3 | Test Lab readiness | real Base Sepolia USDC/native RPC balances + local signer recovery | owner-scoped observation rows | `REAL_MVP`, provider address prerequisite | USDC + signer gate x402; native ETH is informational/non-gating; permanent test-funds label |
| A-4 | in-app faucet claim | real Circle `/v1/faucet/drips` via secured proxy | Turnstile + DB idempotency/cooldown | `BLOCKED` until eligible Circle credential proves access | official faucet fallback; no fake provider reference/tx |
| A-5 | Magic signature | exact x402 EIP-712 digest, live `/v1/wallet/sign/data`, local recovery | signing claim/lease + secret-safe audit | `BLOCKED` until live response proves signer equality | provider rejection is not `SIGNER_NOT_CONFIGURED` |
| A-6 | x402 settlement/delivery | canonical endpoint already emits a genuine 402; Magic signature, facilitator, Base Sepolia settlement, retry 200, and independent verification follow | receipt/cycle/x402 settlement tables | genuine challenge `REAL_MVP`; terminal proof `BLOCKED` | no seeded receipt, signature, response, or tx hash |
| P-1 | mobile overview/feed/receipt | owner-scoped Leash APIs and sanitized cached read | existing Tab session; no signer imports | `REAL_MVP` incomplete | stale/offline label and last-success time required |
| P-2 | Pause/Freeze/Cancel/Nuclear | real `POST /api/leash/revoke` and subsequent refresh | same-origin owner mutation + agent event | `REAL_MVP` incomplete | Pause/Freeze block new signing only; already issued/submitted work may settle; never claim status before refresh |
| P-3 | push/install/offline | real subscription/events; minimal anonymous shell + sanitized client snapshot | HTTPS, VAPID, client storage | `REAL_MVP` incomplete | no cached authenticated mutation response as truth |
| R-1 | Particle rebalance | funded Base-mainnet UA proof then async worker | real funds + `rebalance_ops` | live proof `BLOCKED`; worker `REAL_LATER` only after proof | never bridge in x402 hot path |

## Integration Inventory

| Integration | Product role | Current reality |
| --- | --- | --- |
| Magic browser SDK/admin | persisted human identity and server session binding | implemented; preserve device login behavior |
| Magic Express + OIDC/JWKS | provision and sign for agent | code/spike present; provider trust acceptance/live response unresolved |
| Particle UA 2.0.3 | human unified balance, transfer, later rebalance | installed mainnet-only; funded proof incomplete |
| x402 core/fetch/evm/mcp | challenge/payment/protected retry | installed code path; real Base Sepolia E2E incomplete |
| x402.org facilitator | Base Sepolia test settlement | canonical testnet target; no fabricated fallback |
| Circle USDC/RPC | exact balances and on-chain evidence | Base Sepolia asset fixed; credential/funding prerequisites remain |
| Circle faucet API | optional in-product test funding | unavailable until eligible credential proves `/v1/faucet/drips` |
| Cloudflare Turnstile | faucet abuse control | planned; mandatory server verification before enabling claim |
| PostgreSQL/Drizzle | product state, leases, receipts, audit evidence | substantial real schema/API coverage exists |
| Web Push/service worker | mobile notification/install/offline enhancement | Phase 9 shell partial; subscription API, PushManager flow, delivery handler, and mobile notifications remain incomplete |
| Motion | React-only Flowline/state transitions | not installed; Context7/version check required before add |
| Playwright/axe | visual, reduced-motion, responsive, accessibility checks | not installed; version check required before add |

## Mocked Prototype Surface Register

| Prototype value/action | Classification | Required implementation fate |
| --- | --- | --- |
| all artifact layouts, icons, phone chrome | `REAL_MVP` visual reference / furniture only | translate to semantic responsive components; do not ship raster UI |
| `Example merchant`, `Merchant Co`, `Leash Agent` | `SIMULATED_DEMO_ONLY` in artifact | runtime owned identity or honest empty fallback |
| `[amount]`, `[balance]`, `[shortfall]` | `SIMULATED_DEMO_ONLY` in artifact | signed intent and observed arithmetic |
| example email/OTP/cooldown | `SIMULATED_DEMO_ONLY` in artifact | user input and real Magic/client-throttle state |
| Base badge/QR/example address in checkout | `SIMULATED_DEMO_ONLY` in artifact | network/address from authoritative context; never copy the example |
| provider transaction placeholder | `SIMULATED_DEMO_ONLY` in artifact | exact live provider value only |
| merchant completed steps | `SIMULATED_DEMO_ONLY` in artifact | DB-derived checklist |
| green gate ticks and blocked float/signer | `SIMULATED_DEMO_ONLY` in artifact | exact server gate result for the request |
| payer/payee/amount/nonce placeholders | `SIMULATED_DEMO_ONLY` in artifact | challenge/provider/agent values, redacted only in transcripts |
| `No settled receipts yet` | `REAL_MVP` | real zero-row state |
| mobile stale badge | `REAL_MVP` | last-success timestamp plus offline/stale reason |
| official asset slots | `REAL_MVP` | approved official files and accessible full names |
| dark mode not pictured | `REAL_MVP` | locked system token contract, not deferred |
| unsupported Polygon/Particle testnet/session-key flows | `OUT_OF_SCOPE` | do not add UI or claims |

## No-Shipping-Mock Decisions

1. Raster checkpoints are never imported as production UI.
2. No generated merchant, balance, address, amount, nonce, transaction, gate result, or completion state enters `apps/` or `packages/`.
3. Merchant test simulation is permitted only in the existing persisted test environment with `Test payment — no real funds moved` at point of display.
4. Base Sepolia is a real on-chain test-funds path, not a simulation; it must say `Test funds — not real money` and retain real provider/chain evidence.
5. Submitted success requires a real provider transaction ID. Confirmed/settled/verified requires backend verification.
6. A blocked Leash gate ends before signing; no later evidence axis may be synthesized.
7. Mainnet is fail-closed and never falls back to Base Sepolia.
8. Mobile mutations remain pending until refreshed server state confirms them; cached state is always visibly stale/offline.
9. External-provider unavailability produces an exact blocker and official fallback, never a locally invented success.
10. `pnpm check:showcase` and the verification audit remain release gates.
11. Do not ship the board's unsupported `payment-only address`, alternate-payment-method, or extension-wallet copy; installed provider behavior and accepted product scope determine those words.
12. Freeze blocks new signatures only. Already authorized/in-flight work must be described and reconciled separately.
13. Nuclear remains gated by the real remaining-float/withdraw-first flow; the compact board is not permission to bypass it.
14. Use `Authorization` for the EIP-3009 payload and `Signature recovery` for the cryptographic proof; do not collapse them into an ambiguous success axis.
15. Treat the checkout strip as a branch-aware event graph, not an eleven-step wizard. Safe recovery is not a stage after verified evidence.
16. Merchant simulated test, real Base Sepolia test-token settlement, and live Particle mainnet payment are distinct typed modes with mutually exclusive copy/evidence.
17. Public green proof endpoints and provider capability claims remain neutral/blocked until the matching R8 evidence artifact exists.
18. `One rail / two payers` describes shared merchant integration and normalized evidence. It must not imply that x402 draws directly from the human Particle unified balance; agent chain-specific floats are pre-positioned and asynchronously rebalanced.
19. A simulated merchant test may show an observed live balance as read-only evidence, but insufficient live funds neither block its independent labeled simulation nor reveal Add funds. Balance-gated Add funds is exclusive to live Particle checkout.
20. Pause, Freeze, Cancel, and Nuclear are disabled offline. No emergency mutation may be queued or automatically replayed after connectivity returns.

## Spec Deltas

No behavior in the boards overrides the canonical spec. Proposed clarifications only:

- Name the post-`transactionId` state `submitted`, reserving `settled`/`verified` for server evidence.
- Describe Flowline as event-driven presentation whose state cannot outrun the underlying operation.
- Add the Base Sepolia Test Lab readiness/claim API contract as an additive integration surface.

Do not edit the authoritative spec as a side effect of this report.

## Story Deltas

- Public stranger story: both payment paths, test/live boundary, reduced-motion equivalent.
- Buyer story: submitted-versus-verified evidence and unknown-after-broadcast recovery.
- Merchant story: DB-derived onboarding and first real test evidence.
- Agent story: gate-by-gate stopped evidence and signer recovery readiness.
- Mobile story: stale/offline state and server-confirmed four-level control.

## Quality Profile Deltas

- Exact token/type-role assertions, legacy-variable bridge, and dark/system behavior.
- Flowline semantic/reduced-motion tests independent of pixel geometry.
- Route-level tests for every new entry; isolated unit tests cannot satisfy a missing route.
- Explorer allowlisting, one-main-landmark, contrast, focus, live-region, and offline-truthfulness checks.
- Packed SDK/CLI external-consumer verification and secret-backed real-integration workflow.

## Plan Prerequisites

1. Keep the three approved files and this classification beside the workflow.
2. Run the R0 quality gate before R1.
3. Run the early Magic preflight before any Magic-dependent/provider-backed slice or capability claim; R1–R7 non-money work may continue independently. Accept only a real provider result or a redacted reproducible blocker.
4. Build `@tab/networks` before migrating visible network identity.
5. Build token-only `@tab/ui` before screen components; do not leak unpublished runtime packages into packed SDK/CLI artifacts.
6. Repair the preserved Phase 9 route/offline/controls defects during R7, not by hiding or deleting its tests.
7. Define the typed semantic event/evidence model before shared state primitives: simulated persistence, live submission, live verification, verification unavailable, and every x402 gate/evidence axis.
8. Add buyer-safe idempotent status/reconcile and durable transaction-report retry before shipping safe-close/status-recovery copy.
9. Extend receipt DTO/API projections to include the exact failed gate, fingerprint, nonce, expiry, digest/recovered signer, facilitator result, transaction, protected retry, and independent verification where the DB/provider evidence exists.
10. Observe the funded Magic/Particle authorization UX before choosing visible wallet/approval instructions.
11. Add official-asset and route/link manifests; omit any generated mark or dead navigation target.
12. Keep simulated completion independent from live-balance sufficiency, and test that it cannot enter live Add funds or use unqualified verified/settled copy.
13. Make all emergency controls connectivity-gated and prove no service worker, client queue, or retry layer can replay a destructive mutation.

## Blockers And Open Questions

| Blocker | Blocks | Does not block |
| --- | --- | --- |
| Magic issuer trust/provider acceptance | real agent address, signing, x402 E2E | design/network/UI foundations |
| Circle eligible faucet credential | in-app claim enablement | readiness reads and official fallback |
| Base Sepolia USDC funding | real x402 settlement | non-money build lane |
| ~20 USDC on Base mainnet | Particle transfer/rebalance/top-up/withdraw proof | Base Sepolia x402 and UI work |
| final domain | DNS/provider cutover | local independently deployable apps |
| Context7 quota/login | new Motion/Playwright/axe installation validation | dependency-free network/token slice |

No remaining visual choice requires Abu input.

## Planning Gate Decision

Implementation may continue through R1–R7 in phase order with the classifications above. Each provider-backed action remains independently fail-closed. R8/R9 completion claims remain prohibited until their exact live evidence and final release gates exist.

## Evidence

- Approved checkpoint hashes and discovery report above.
- Existing `payments`/`settlements`, webhook, Leash control/ledger/receipt/notification, and x402 settlement schemas.
- Existing Magic auth, payment lifecycle, Leash owner/key protection, revocation, receipt, agent sign/result/reconcile, and `/api/x402/testnet` routes/tests.
- `docs/reviews/2026-07-18-phase-0-verification-audit.md`: current live verdict remains unfinished; the 402 is genuine, but no provider payer/signature/transaction/settled DB proof exists.
- Preserved Phase 9 focused suite: 7 files / 33 tests and web typecheck passed before this report; independent review still found missing route/controller, mobile-only controls, offline navigation, and lint completion work.
- Canonical semantic authority: `.thoughts/specs/2026-07-02-tab-leash.md`, `.thoughts/decisions/DECISIONS.md`, and `.thoughts/plans/2026-07-06-tab-build-plan.md`.
