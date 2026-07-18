# Phase 0 verification audit

Date: 2026-07-18

Audit chain: user requirements →
`docs/plans/2026-07-18-phase-0-live-x402-magic-spike.md` → implementation →
automated tests → live evidence.

Verdict: **FAIL / unfinished as a live MVP integration**. The implementation,
database migration, deployment, canonical 402, OIDC metadata, and local quality
gates are verified. Magic rejected real wallet creation, so the funded signing and
settlement half of Phase 0 cannot truthfully be marked complete.

## Requirement traceability

| Requirement | Implementation and proof | Status |
| --- | --- | --- |
| Canonical Tab x402 target | `apps/web/app/api/x402/testnet/route.ts` and `apps/web/lib/leash/x402-testnet-resource.ts`; live stable endpoint returned x402 v2 HTTP 402 | Pass |
| Exact Base Sepolia tuple | Live payment requirement: `eip155:84532`, amount `1000`, Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, facilitator `https://x402.org/facilitator`, payee `0x895792c87f4A3D0aAFf9604CEab10169F3194Cc0` | Pass |
| Unmistakable test labeling | Live body/resource says `Test funds — not real money`; test profile is explicit and cannot be selected by request body | Pass |
| OIDC discovery/JWKS/JWT | `apps/web/lib/leash/magic-oidc.ts` and public well-known routes; live discovery 200 and one public RS256 JWKS key | Pass |
| Stable opaque subject and idempotent wallet provisioning | Subject persistence and provider contract have PostgreSQL/unit coverage; live provider did not create a wallet | Blocked live |
| Real Magic Express wallet | Production request reached `/v2/wallet`; Magic returned downstream 401 at `WALLET_CREATION`, trace `express-68861844-669f-47dc-a424-0a640ed5abae` | Fail |
| Real Magic signing adapter | Hash/reconstruction/recovery, provider errors, lease, timeout, and limits are tested in `apps/web/lib/leash/magic-express.test.ts` and signing route tests | Pass locally; blocked live |
| Base Sepolia profile without mainnet fallback | `apps/web/lib/leash/payment-profile.ts`, `apps/agent/src/payment-profile.ts`, route/config/schema tests | Pass |
| Real packed CLI consumer | `apps/agent/scripts/verify-packed-artifact.mjs` executes the packed binary, paid fetch, upstream restart, and package import | Pass |
| Genuine on-chain settlement and independent verification | No payer wallet/address exists to fund; therefore no Magic signature, facilitator settlement, transaction hash, PostgreSQL settled receipt, feed, or notification evidence exists | Not run |
| Real negative paths and restart | Gate/no-sign and durable restart behavior are integration tested, but no funded before/after chain proof exists | Partial |
| Particle mainnet spike | Installed SDK 2.0.3 mainnet-only scope is respected; buyer EOA/UA is known, but no approximately 20-USDC funding or real transfer exists | Not run |
| Review and CI | Security/code review completed; both push and pull-request Actions runs passed, and GitGuardian incident 17197295 was verified and ignored as a CI test credential | Pass |

## Live evidence

- Production deployment: `dpl_9WsV1L3s8KrtaQ6LyofiH65EdYfW`, READY and aliased
  to `https://tab-rosy.vercel.app`.
- `/.well-known/openid-configuration`: 200, issuer and JWKS URI use the stable
  production origin.
- `/.well-known/jwks.json`: 200, one RSA/RS256 signing key with key ID
  `tab-oidc-20260718-active`; no private key material is exposed.
- `/api/x402/testnet`: genuine 402 with a `payment-required` header, x402 version
  2, exact scheme, exact tuple above, and test-funds label.
- `/api/agent/pay/reconcile`: an unauthenticated POST returns 401
  `INVALID_LEASH_KEY`, proving the newly deployed route is present and protected.
- `https://x402.org/facilitator/supported`: 200 and explicitly supports x402 v2
  `exact` on `eip155:84532`.
- Magic account preflight: `providerExactMatch=true`,
  `productionOriginAllowlisted=true`, `providerCount=1`.
- Real Magic live-gated Vitest: one file and one test executed; the deployed route
  returned Tab 502 `SIGNER_PROVIDER_REJECTED`. Secret-safe Vercel evidence records
  Magic status 401, stage `WALLET_CREATION`, and the trace above.
- Production PostgreSQL retains agent
  `14ab5bba-51ba-495a-a504-afdb953ecdf1` as
  `base_sepolia_integration`, with one provider attempt and `address_pending=true`.
  No public address was fabricated or persisted.

## Database evidence

Before migration, an aggregate-only production query returned exactly zero rows in
`x402_resource_settlements`. This is required because migration 0029 intentionally
adds the replay fingerprint as non-nullable rather than inventing a fingerprint for
legacy evidence.

`pnpm exec vercel env run -e production -- pnpm --filter @tab/web db:migrate`
completed successfully. Post-migration checks showed:

- 30 migration records;
- `agent_provision_attempts` exists;
- `x402_resource_settlement_observations` exists;
- `x402_resource_settlement_attempts` exists;
- `x402_resource_settlements.payment_fingerprint` reports `is_nullable=NO`.

## Automated verification

| Command | Result |
| --- | --- |
| `pnpm check:showcase` | Exit 0 |
| `pnpm lint` | Exit 0; 789 files checked |
| `pnpm typecheck` | Exit 0; Turbo 6/6 tasks successful |
| `pnpm test` | Exit 0; Turbo 6/6 tasks successful |
| `pnpm build` | Exit 0; Turbo 4/4 tasks successful |
| `pnpm db:check` | Exit 0; migration metadata consistent |
| `pnpm --filter @tab/agent verify:pack` | Exit 0; 81 files, executable, paid/upstream restart E2Es, fetch import |
| `git diff --check` | Exit 0 |
| Source line hard cap | Pass; maximum production/test/script source file 299 lines |

Hosted verification for commit `bdbce908d2a7b674c2ae580342a69a12c3119b78`:

- Push run `29641083918`: 1/1 job passed in 4m20s.
- Pull-request run `29641102090`: 1/1 job passed in 5m17s.
- The pull-request run passed lint, showcase checking, typecheck (Turbo 6/6),
  database migration validation, tests (1,271 passed and 3 skipped across the
  visible suites), build (Turbo 4/4), and packed-agent verification.
- GitGuardian incident `17197295` identified the literal password for the
  ephemeral `postgres:16` CI service. It is scoped to `tab_test` on loopback,
  equals the test user, and is not a production or external credential. The
  incident is explicitly `Ignored — Test credential`; no secret was printed,
  revoked, or replaced with another hardcoded value.

Test detail:

- Web: 219 files passed, 2 live files skipped; 1,009 tests passed, 2 skipped
  (1,011 total).
- Agent: 34 files and 193 tests passed.
- Mobile: no tests are defined and `--passWithNoTests` exited 0.
- Independent final code review reran 61 focused tests and found no additional
  safety BLOCK or WARN.

## Security and dependency deviations

- The current Magic contract is `/v2/wallet` and `/v2/wallet/sign/data`, replacing
  the older recipe's v1 paths. This is intentional and documented in the plan.
- `pnpm audit --prod --audit-level high` exits 1 with one high and four moderate
  advisories. The unpatched high `bigint-buffer` dependency is in the pinned
  Particle SDK's Solana transitive path; Tab's spike is EVM-only. This remains an
  explicit upstream-monitoring exception, not a fixed advisory.
- The CLI journal fails closed after 1,024 durable keys (or its byte bound). It
  never deletes settled idempotency history because doing so could authorize a
  second payment. Production-scale archival remains future work.
- Chain finality trusts one configured RPC's `finalized` view; no RPC quorum or
  independent Merkle proof is implemented.
- GitGuardian's original failed pull-request result remains attached to its prior
  commit. After the confirmed CI-only PostgreSQL credential was classified as
  `Ignored — Test credential`, the follow-up check scanned all 32 commits without
  finding a secret.
- That follow-up CI event exposed a separate five-second timeout cliff in the two
  real CLI child-process integration tests. Their MCP requests now share a
  15-second abort deadline, the outer tests retain a bounded cleanup window, and
  connect observations are isolated by per-test API key so a timed-out child
  cannot contaminate the next test.

## Completion blockers

1. Magic must resolve or explain the Express trust-store 401 for the exact
   allowlisted OIDC provider. Only then can Tab obtain and return the real payer
   address.
2. Abu must fund that returned address with Circle Base Sepolia USDC before the
   packed real E2E can execute.
3. The funded E2E must capture signature recovery, facilitator result, transaction
   and explorer URL, PostgreSQL receipt/cycle/feed/notification evidence, real
   failure paths, and restart persistence.
4. The separate Particle buyer address needs approximately 20 native USDC on Base
   mainnet before the real UA transfer/rebalance spike.

No completion claim is made for the missing live evidence.
