# Verification Audit: Phase 5 Merchant Dashboard

## Verdict

**PASS — the Phase 5 implementation, local checkpoint, and pull-request CI pass at the approved
test-mode boundary.**

The funded live-settlement spike is still blocked by B-04 and is not included in this verdict. No
fake balance, transfer, settlement, webhook, or tenant data is accepted as evidence.

## Artifacts Checked

- Phase 4 baseline: `54505a0`
- Phase 5 plan and stop condition
- `DECISIONS.md`
- Merchant dashboard portions of the product spec and stories
- Prototype reintegration matrix E-1..E-14 and C-1..C-4
- Project quality profile
- Current dashboard, API routes, SDK client, database integrations, tests, and repository diff
- Authenticated Chrome run against the local Next.js/PostgreSQL application

## Requirement Traceability

| Requirement | Result | Evidence |
| --- | --- | --- |
| E-1 Quickstart | Pass | `quickstart.ts` derives key, webhook, verified-delivery, and first-settlement state from PostgreSQL; manual steps persist through the authenticated route. Eight-step rendering and real-state integration tests pass. Step 1 never auto-completes. |
| E-2 package install | Correctly blocked | Quickstart shows `npm install @tab/sdk` and explicitly says publication is blocked and the workspace package must be used until B-08. |
| E-3 server-key snippet | Pass | The snippet uses a masked real key and the decided `new Tab(process.env.TAB_SECRET_KEY!)` contract. A real TCP/HTTP/PostgreSQL test proves one-argument configuration through `TAB_API_BASE_URL`, payment listing, tenant/environment scope, and `last_used_at`. Package smoke verification checks both `Tab` and `TabApiError` exports. The response parser accepts positive padded decimals such as `0.100000` while rejecting zero, negative, exponent, over-precision, and non-string amounts. |
| E-4/E-5 Quickstart values and banner | Pass | Tenant-specific receiving address, publishable key, intent endpoint, webhook URL, first test settlement, and delivery latency come from database records; Arbitrum USDC comes from canonical product configuration. The browser rendered a stored $3.50 simulated settlement and its real 571ms delivery. Failed deliveries are not labeled delivered. |
| E-6 API keys | Pass | Real create/show-once/rotate/revoke flows use hashed secrets, explicit environment scope, read/full permissions, authenticated merchant isolation, and real last-use timestamps. PostgreSQL route and service tests cover cross-tenant rejection and one-time reveal behavior. No pre-seeded live secret exists. |
| E-8 transactions | Pass | The ledger joins payments, settlements, and the latest unsuperseded webhook delivery by merchant and environment. Tests cover filtering, cursor pagination, detail isolation, payer/search paths, and the manual-resend head rule. Detail renders canonical token changes, audit URL, simulation evidence, and delivery timing without inventing a block-explorer hash. |
| E-9 first live row | Correctly blocked | No live settled row is fabricated. The browser and UI label the existing row as `TEST` and `Simulated test — no funds moved`. B-04 remains open. |
| E-11 export | Correctly cut | No unsupported export control was added. |
| E-12 webhook configuration | Pass | Secrets are generated and revealed once per creation or rotation, AES-GCM encrypted at rest, and recoverable only for signing. URL policy, DNS/IP checks, signed real HTTP test delivery, bounded response capture, verification-on-2xx, retry policy, and listening/failing/awaiting health states are tested. Signatures cover exact raw bytes; the verifier uses constant-time comparison with a 300-second maximum age and 30-second future-skew allowance. Merchant guidance requires verification before JSON parsing and replay-safe fulfillment through a unique `${event.type}:${event.id}` key in the fulfillment transaction. |
| E-13 delivery log | Pass | Delivery attempts persist request, signature, response, status, timing, ancestry, and trigger. Resend creates a new manual row. A database advisory lock serializes the shared test-mode root budget across automatic settlement webhooks, manual test sends, and resends: 10 roots per 10 minutes and at most 2 active roots. Live automatic fulfillment is exempt, and denied test egress does not roll back its settlement. Real PostgreSQL/HTTP concurrency tests pass. Resend ISO timestamps are hydrated before rendering, and the log is keyed by environment so Test state cannot remain visible in Live. |
| E-14 Go Live | Pass | Live-key, verified-webhook, and actual simulated-settlement predicates come from tenant records. The modal is warn-and-allow, persists `live_activated_at`, and never creates or moves money. Browser evidence showed the missing live-key/webhook warnings and a disabled activation action. |
| C-1..C-4 demo | Pass at test boundary | `/demo` uses the signed-in merchant, real `pk_test`, signed five-minute intent, SDK `PayButton`, and a runtime-derived order number. The composition test runs PostgreSQL, real routes, canonical payment open/report/order behavior, and an actual signed localhost webhook; only the external Magic Admin verification boundary is replaced. |
| SDK API boundary | Pass | `PayButton` accepts a root HTTPS Tab API origin, plus loopback HTTP for local development. Credentials, path, query, fragment, remote HTTP, and public hostnames beginning with `127` are rejected before checkout or identity services run. Tests preserve genuine `localhost`, `*.localhost`, `[::1]`, and numeric `127.0.0.0/8` support. |
| Story 1 callback/webhook parity | Pass | The report response, stored settlement, queued payload, and signed HTTP body carry the same canonical server token changes. The SDK validates that authority against the signed intent and passes the server response to `onSuccess`. |
| Tenant and environment isolation | Pass | API-key, transaction/detail, webhook, demo intent/order, mode, and Quickstart tests reject cross-tenant identifiers and scope reads/writes to the authenticated merchant plus explicit environment. API-key, delivery-log, and webhook-editor client islands remount on mode changes; regressions prove stale Test URLs, keys, deliveries, notices, secrets, and dialogs cannot cross into Live mutations. |
| B-04 honesty | Pass | Live buyer execution remains guarded. The only browser checkout attempted during this audit stopped at the real Particle `$0.00 available / $1.00 short` state and reported that nothing was charged. |

## Evidence Log

### Browser

Chrome opened the returning merchant session for `abubakrjimoh16488@gmail.com` without another
OTP, proving the intended Magic session restoration path. The following real application pages
rendered successfully: Quickstart, API keys, transactions, transaction detail, webhooks, Go Live,
and the per-merchant demo.

- The database-backed ledger showed a $3.50 test settlement with canonical Arbitrum USDC token
  changes and a signed webhook delivery that returned HTTP 200 in 571ms.
- A fresh demo run fetched checkout context and the signed merchant intent, then created a real
  open payment row with HTTP 201.
- The checkout read the real Particle balance as $0.00 and stopped at the insufficient-funds
  branch. No Add Funds action, synthetic balance, success state, charge, or live activation was
  used.
- All visited application routes returned 200/201 and Chrome recorded no application errors.

This is returning-merchant evidence, not a fresh stranger-signup or funded-completion walkthrough.
That broader walkthrough remains an explicit follow-up to B-04/pre-funding rather than evidence
for this scoped Phase 5 checkpoint.

### Automated and review evidence

- Real PostgreSQL tests cover API-key lifecycle, Quickstart derivation, transaction joins,
  settlement/webhook parity, demo composition, tenant isolation, egress concurrency, and Go Live.
- Real localhost HTTP tests cover the server-key SDK, signed webhook delivery, response limits,
  retry/resend behavior, and callback/webhook payload equality.
- Focused red-to-green regressions cover padded sub-dollar SDK amounts, resend date hydration,
  Test/Live client-state resets, shared automatic/manual test-webhook admission, signature freshness,
  replay-safe guidance, and API-origin confusion.
- Final independent correctness review: READY, no actionable findings.
- Final independent security review: READY, no actionable findings.

## Quality Gates

- `pnpm lint`: passed, 384 files.
- `pnpm typecheck`: passed, 5 Turbo tasks.
- `pnpm test`: passed:
  - web: 98 files, 404 tests
  - SDK: 16 files, 68 tests, 1 explicit B-04 live skip
  - agent/mobile: pass-with-no-tests
- `pnpm build`: passed, 4 Turbo tasks; Next.js compiled and generated 33 routes/pages; SDK ESM,
  CJS, declarations, and package smoke checks passed.
- `pnpm check:showcase`: passed with 0 hits.
- `pnpm db:check`: passed (`Everything's fine`).
- `git diff --check`: passed.
- Source hard cap: no TypeScript/TSX file under `apps/` or `packages/` exceeds 300 lines.
- Independent correctness and security re-reviews: READY with no remaining findings.
- Pull-request CI: passed on PR #2 (`Lint → Typecheck → Test → Build`).

## Deviations From Plan

- The plan's parenthetical description called `GET /api/demo/intent` `pk-auth`. The implemented
  route uses the authenticated merchant session because it is the merchant's own relay and must
  select that merchant's private signing authority. The public SDK deliberately sends no Tab key
  to arbitrary merchant intent URLs. This matches the canonical signed-in, per-merchant demo model
  and preserves the publishable/secret boundary.
- Browser completion cannot honestly bypass a zero Particle balance. The UI exposes the real
  insufficient-funds state instead of turning the test seam into a fake successful transfer.

## Open Blocks and Follow-ups

1. B-04: complete the funded external-receiver/live settlement spike, real chain evidence, and
   live webhook proof before enabling money movement.
2. B-08: publish `@tab/sdk`; until then, retain the honest Quickstart workspace-package note.
3. Run the fresh stranger-signup and funded checkout walkthrough when the funded environment is
   available. Persistent returning-session behavior is already proven here.
