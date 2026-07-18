# Phase 0 security and code review

Date: 2026-07-18

Verdict: the reviewed implementation has no remaining safety blocker and is safe
to push for CI. Phase 0 as a live money path is **not complete** because Magic
rejected real wallet creation and therefore no payer address, funding, TEE
signature, or settlement transaction exists.

## Live blocker

The production provision request reached Magic Express `/v2/wallet`, then Magic
returned HTTP 401 at the fixed `WALLET_CREATION` stage. Tab returned the bounded
`SIGNER_PROVIDER_REJECTED` 502 response. The validated provider trace is
`express-68861844-669f-47dc-a424-0a640ed5abae`.

This is not treated as missing configuration: the separate account preflight
proved one exact OIDC provider and an allowlisted production origin. PostgreSQL
retains the reserved `base_sepolia_integration` agent with no address, so no
wallet address has been fabricated or persisted.

## Closed findings

- `apps/web/app/api/agent/sign/route.ts` sweeps only expired pending
  authorizations that finalized canonical chain evidence proves unused. Provider
  timeouts, rate limits, and requests that never returned a receipt ID can no
  longer consume the cap forever; used or unavailable evidence remains
  fail-closed.
- `apps/agent/src/payment-envelope-store.ts` retains settled idempotency history.
  Record-count and worst-case byte bounds are checked before invoking the signer
  factory. Full capacity cannot create a new authorization, and replaying an old
  settled key returns its original receipt.
- `apps/agent/src/payment-target-network.ts` reserves the combined pinned and
  resolving hostname budget atomically. All shipping HTTP paths use the same
  DNS/IP pinning, redirect rejection, and private/reserved-address policy.
- Seller success, payer result reporting, and recovery require the trusted chain
  ID, a finalized receipt, canonical block hash, exact transaction/block
  correspondence, and the expected USDC events before terminal settlement.
- Payment result and connect bodies are content-type checked, size bounded, and
  time bounded. Magic provider errors and logs retain only validated status,
  stage, hints, and trace metadata.
- Migration `0029_new_nick_fury.sql` makes terminal payment fingerprints
  non-nullable. The runtime and PostgreSQL both reject terminal evidence without
  a replay fingerprint. The production preflight returned exactly zero legacy
  settlement rows before this intentionally non-backfillable migration ran.

## Residual risks

- `pnpm audit --prod --audit-level high` reports one high and four moderate
  advisories. The unpatched high advisory is `bigint-buffer@1.1.5`, reachable in
  the dependency graph through the pinned Particle Universal Account SDK's
  Solana token branch. Tab's funded Particle path is EVM-only and does not import
  that Solana branch, but the exception needs upstream monitoring; it is not a
  claim that the advisory is fixed.
- The durable CLI journal intentionally fails closed after 1,024 retained keys
  (or its byte bound). A future production-scale design needs an append-only
  archive or durable tombstones before capacity can be reclaimed without losing
  idempotency history.
- Settlement finality trusts the configured Base Sepolia RPC provider's
  `finalized` view. There is no independent RPC quorum or Merkle-proof verifier in
  this spike.

## Independent review evidence

- Agent journal, network, and restart review: 57 focused tests passed.
- Latest capacity and DNS concurrency regressions: 26 focused tests passed.
- Web signer reconciliation and settlement finality review: 42 focused tests
  passed.
- Settlement-store migration contract: 9 PostgreSQL tests passed.
- Full repository gates and the packed-artifact test are recorded in the paired
  verification audit.
