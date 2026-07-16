# Verification Audit: Phase 4 PayButton

## Verdict

**PASS — scoped strictly to the Phase 4 stop condition.**

The funded stranger/live-payment test has **not passed**. B-04 remains blocked, and this verdict
does not authorize enabling either live-execution guard.

No Phase 4 blockers remain. The durable payment-report outbox and Particle delegate allowlist are
mandatory Phase 10/B-04 unlock work.

## Artifacts Checked

- Phase 3 baseline: `b727cf1`
- Phase 4 plan and stop condition
- `DECISIONS.md`
- Spec R-TAB-1/2/4/5/6/8/9/10/11/12/13
- Stories 1 and 2
- Prototype reintegration matrix
- Project quality profile
- Current SDK, checkout-context route, packaging, tests, and repository diff
- Magic and Particle wiki reconciliation

## Requirement Traceability

| Requirement | Result | Evidence |
| --- | --- | --- |
| R-TAB-1 | Pass | Required props only in `PayButton.tsx`; self-contained controller/state rendering; named package exports in `src/index.ts`. |
| R-TAB-2 | Pass for Phase 4 | Intent is fetched at mount and refetched on click; browser open sends exactly `{ intentToken }`; strict parsers compare the signed authority with the opened payment. Real PostgreSQL/JWS tests prove server mint and token-only open. Merchant relay remains correctly sequenced for Phase 5. |
| R-TAB-4 | Pass at current boundary | Persistent restore uses Magic `isLoggedIn()` followed by a fresh DID token and nested EVM address. Headless OTP implements six-digit verification. Tests cover persistent reuse, OTP, invalid/expired/throttled handling, and email preservation. Prior Phase 3 browser evidence supplies the real Magic-session proof. Server DID verification remains on the report route. |
| R-TAB-5 | Pass | Installed V2-only nested Particle configuration uses EIP-7702, the installed SDK version constant, and `slippageBps: 100`; no flat owner field or `universalGas`. A unit test asserts the exact shape. |
| R-TAB-6 | Pass | Real `getPrimaryAssets()` plus identity-checked `getSmartAccountOptions()` feed a single USD balance display. A keys-gated live Particle run returned a nonnegative balance and matching owner/account address. |
| R-TAB-8 | Correctly blocked | The controller dispatches success and calls `onSuccess` immediately after a valid execution result, before reporting; ordering is tested. No funded send or live-success claim exists. |
| R-TAB-9 | Pass | Centralized copy and automated/direct source scans found no prohibited wallet or chain terminology in buyer UI sources. The R-TAB-12 funding instruction is the explicit product-copy exception. |
| R-TAB-10 | Pass through Phase 4 boundary | The reducer guards transitions and the UI implements loading, authentication, balance, insufficient funds, add funds, confirming, success shell, and errors. Tests cover persistent and OTP paths, retries, cancellation, focus return, throttling, and double-submit guards. |
| R-TAB-11 | Pass for open/report scaffolding | Exact token-only open and strict response-authority validation are implemented. Real localhost HTTP + PostgreSQL evidence proved signed intent mint, payment open, and a real pending row. Reporting carries a DID token, transaction ID, and normalized token changes with `keepalive`. Live verification/settlement remains B-04 blocked. |
| R-TAB-12 | Pass | Insufficient balance uses the real account snapshot. Add Funds receives the Particle deposit address and provides a selectable/copyable address with recheck and cancel actions. Tests prove the address comes from the account service rather than a runtime constant. |
| R-TAB-13 | Pass, inherited from Phase 3 | Browser SDK accepts only `pk_` configuration; no `sk_` prop exists. Existing secret-key authentication, permission, and `last_used_at` tests remain green. |
| B-04 honesty | Pass | Checkout context always returns `livePaymentExecution: false`; the controller requires both live mode and capability; execution independently requires `NEXT_PUBLIC_SPIKE_COMPLETE=true`. A guard test proves no create/sign/send call occurs. |

## Acceptance Criteria Coverage

- AC-TAB-1: passed by automated and direct buyer-copy scans.
- AC-TAB-6: adapter/UI tests pass; prior real persistent Magic browser proof is cited.
- AC-TAB-5(a): nested 7702 initializer is proved.
- AC-TAB-2, AC-TAB-3, AC-TAB-5(b/c): intentionally **not accepted**; each requires the
  funded B-04 send.
- Story 1 live-webhook scenarios remain blocked; the browser callback is not presented as
  authoritative settlement.
- Story 2 Add Funds, returning-session, OTP, and blocked-execution scenarios are covered.

## Quality Gates

- `pnpm lint`: passed, 282 files.
- `pnpm typecheck`: passed, 4/4 packages.
- `pnpm test`: passed:
  - web: 68 files, 320 tests
  - SDK: 35 passed, 1 intentional environment-gated live-read skip
  - agent/mobile: no tests
- `pnpm build`: passed, 4/4; SDK ESM, CJS, DTS, and import verification passed.
- `pnpm check:showcase`: passed.
- `git diff --check`: passed.
- SDK package dry-run: passed.
- Phase 4 files: all below 200 lines; largest is 197 lines.
- Independent code-review verdict: READY, with no blockers or warnings.
- An earlier database-test collision came from an overlapping review process; the serialized
  canonical rerun passed without code changes.

## Deviations From Plan

- Particle publishes no semantic `UniversalError` catalog. The implementation preserves numeric
  code and opaque data internally, maps only known standard JSON-RPC integration failures, and
  never exposes opaque provider data to buyers. This is a justified fail-closed deviation pending
  live evidence.
- The execution path is structurally implemented but remains behind both guards. This does not
  count as live integration proof.
- Actual npm publication remains B-08; Phase 4 requires only a successful package dry-run.

## Gaps and Risks

### Mandatory before B-04/Phase 10 unlock

1. **Particle delegate allowlist:** `execute-validation.ts` verifies that an authorization target
   is a valid nonzero address, but cannot yet prove it is an approved Particle delegation
   implementation. Establish the chain/version allowlist from authoritative spike evidence before
   enabling signatures.
2. **Durable report outbox:** `use-checkout-payment.ts` uses `keepalive` and catches report failure,
   but browser delivery is not durable. After a real send, a lost PATCH could leave the backend
   without the transaction evidence needed by its sweep. Add durable retry/outbox behavior before
   live execution.
3. Complete the funded external-receiver spike, authoritative backend chain verification,
   destination-hash inspection, and real webhook proof.
4. Verify the final animated success treatment during the live acceptance pass.

### Non-blocking context/test cleanup

- Story 2's token-address open question is stale: the address is now pinned, while only live
  liquidity remains open.
- Some older spec examples still mention Polygon despite the authoritative no-Polygon decision.
- The copy test can add literal `EIP` to its regex, although the direct audit scan found no
  violation.
- The Magic wiki says mismatched signer metadata is rejected; code enforces this, but dedicated
  negative tests would make that statement fully test-backed.

## Evidence Log

- Real Particle read: live `getPrimaryAssets()` and `getSmartAccountOptions()` succeeded with
  matching authenticated identity; no signing or send.
- Real local backend path: a transient merchant was provisioned, a signed intent returned over
  HTTP, token-only open returned 201, and PostgreSQL contained the real pending row; transient data
  was cleaned.
- Magic: prior Phase 3 real persistent-session browser proof plus current deterministic adapter and
  cryptographic signature-recovery tests.
- No funded buyer transfer, Arbiscan receipt, live settlement transition, or live webhook was
  produced.
