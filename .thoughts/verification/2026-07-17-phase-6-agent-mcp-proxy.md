# Verification Audit: Phase 6 Agent MCP Proxy

## Verdict

**PASS — the Phase 6 MCP proxy, x402 payment wire, hosted-signer policy boundary, receipt
ledger, CLI/package, and local checkpoint pass at the approved B-03/B-04 blocked boundary.**

Real Magic TEE signing and a funded mainnet agent payment are not included in this verdict. The
production route returns `SIGNER_NOT_CONFIGURED`, terminalizes the reservation honestly, and never
returns a fabricated signature or transaction hash.

## Artifacts Checked

- Phase 5 baseline: `975aa4b`
- Phase 6 implementation commits: `eab8053`, `bd59fce`, and `8d05657`
- Domain wiki and its x402, MCP, Magic, Particle, and hackathon source map
- `.thoughts/decisions/DECISIONS.md`
- Product spec and Story 3, "Agent pays an x402 resource within cap"
- Phase 6 plan goal, work list, acceptance coverage, and stop condition
- Prototype reintegration matrix F-1..F-15 and no-shipping-mock table
- Project quality profile and pinned installed package contracts
- Agent CLI/package, web signer routes, PostgreSQL schema/migrations, cross-app tests, built output,
  and repository diff

## Requirement Traceability

| Requirement | Result | Evidence |
| --- | --- | --- |
| F-1 installable `leash-mcp` entry | Pass at workspace boundary; publication blocked | The package builds a stdio binary, parses strict environment/CLI configuration, bootstraps `/api/agent/connect`, and supports optional `--upstream`. Built-bin stdio and Streamable HTTP smoke tests and package dry-run pass. The package remains private until B-08; no unpublished name is presented as available from npm. |
| F-2 MCP pass-through proxy | Pass | The real MCP SDK server/client pair forwards list/call requests to a real Streamable HTTP upstream. The proxy starts without a signer, and free tools continue to work. |
| F-3 `paid_fetch` and fetch wrapper | Pass | The standalone MCP tool and exported wrapper use the real x402 client/scheme path, preserve request bodies, and retry the protected HTTP request through the remote signer contract. Real loopback HTTP integration tests pass. |
| F-4 dual-surface detection | Pass | Tests cover MCP tool-result payment-required data, SEP-1036 JSON-RPC `-32042`, x402 v2 response headers, and the v1 HTTP 402 body path using the installed x402 package contracts. |
| F-5 remote-signer wire | Pass at blocked production boundary | Strict EIP-3009 parsing, exact native-USDC domain/message validation, Base/Arbitrum registration, and signature recovery are tested with real viem private-key signatures. The production web route does not sign until B-03. |
| F-6 server-side cap gate | Pass | PostgreSQL reservations count settled plus pending spend. The final locked pre-signing check reloads the current cap and active cycle, rechecks expiry, and prevents concurrent reservations from crossing the cap. Blocked attempts persist as `blocked` with `LEASH_CAP_EXCEEDED`. |
| F-7 status and key gates | Pass | Paused, frozen, cancelled, and nuked agents fail before signing; the final locked check repeats status and active-key validation so revocation/status changes cannot slip through an earlier read. |
| F-8 CAIP-2 float routing | Pass | Only Base `eip155:8453` and Arbitrum `eip155:42161` native USDC are accepted. Real viem RPC tests prove `balanceOf`; the final gate counts all pending reservations across cycles on the selected float. RPC failure terminalizes the row as `failed/FLOAT_CHECK_UNAVAILABLE`. Polygon is rejected. |
| F-9 Magic TEE signing | Correctly blocked | B-03 remains open. The route returns HTTP 503 `SIGNER_NOT_CONFIGURED`, stores a failed reason, and emits no signature or fake hash. |
| F-10 result capture and receipt finalization | Pass | Agent callback data is stored only as an observation. Settlement occurs only after the server independently reads the transaction/receipt and verifies the direct native-USDC call, exact Transfer event, AuthorizationUsed event, payer, payee, amount, nonce, network, and success. HTTP 202/429/5xx retain correlation for bounded retry; only a trusted HTTP 200 `{status:"settled", verified:true}` clears it. |
| F-12 origin telemetry | Pass | MCP origin records real client/tool/transport values. HTTP telemetry strips credentials, query, and fragment on both agent and server boundaries; malformed or secret-bearing URLs are never echoed. |
| F-13 connect telemetry | Pass | `/api/agent/connect` authenticates the real Leash key and persists first/last seen, cycle count, raw client info, and the honest `Unknown client` fallback. CLI bootstrap executes before upstream initialization, so absence of downstream client info is represented honestly. |
| F-14 Leash key lifecycle | Pass | Keys are generated from cryptographic randomness, hashed at rest, shown once, rotated by revoking the prior key, and tenant/agent scoped. |
| F-15 flagship payable target | Correctly blocked | B-10 remains open. The universal tool and upstream accept explicit URLs; no fake or hardcoded payable resource was added. |
| Receipt schema and upgrade | Pass | PostgreSQL enforces canonical states, lowercase authorization nonces, unique replay evidence, owned cycles, supported networks, and nonblank terminal reasons. Migration `0016` safely normalizes legacy mixed-case nonces, aborts before mutation on case-fold collisions, preserves audit fingerprints, and truthfully marks admitted null terminal reasons as `LEGACY_REASON_MISSING`. Real 0015-shaped PostgreSQL upgrade tests pass. |
| AC-LEASH-1 | Pass for interception/wire; execution blocked | Proxy interception, dual detection, CAIP-2 routing, HTTP wrapper, persistence, and verified result processing are real. Magic signing and mainnet payment execution remain B-03/B-04 blocked as required by the Phase 6 stop condition. |
| AC-LEASH-2 | Pass for the Phase 6 signer boundary | Cap/status/key/float/expiry checks are server-side and concurrency-aware. The Tier 3 owner notification is a Phase 7 control-plane concern, not fabricated in Phase 6. |

## Real Integration Evidence

- A built `leash-mcp` process completed stdio and Streamable HTTP MCP smoke paths against real SDK
  transports; free tools work with the honest null signer.
- Real x402 HTTP integration exercises the installed x402 client/scheme and signs EIP-3009 data
  with an ephemeral viem account. Production code never receives that test key.
- A cross-application test drives the actual `LeashRemoteSigner` reporter over loopback HTTP into
  the actual Next.js result route, real PostgreSQL, and a viem JSON-RPC server. It proves 202 keeps
  correlation and independently verified 200 settlement clears it.
- Real PostgreSQL tests cover reservation serialization, current-cycle/cap/expiry rechecks,
  cross-cycle float reservations, key/status changes, canonical replay, receipt constraints, and
  the 0015-to-0016 data migration.
- Real viem RPC tests cover live USDC `balanceOf` reads and the transaction/receipt/log evidence
  used to settle a pending receipt.
- The no-signer path is exercised end to end: no Magic configuration produces
  `SIGNER_NOT_CONFIGURED`, a terminal failed receipt, and no fake signature or transaction hash.

## Quality Gates

- `pnpm install --frozen-lockfile --offline`: passed; lockfile was current.
- `pnpm lint`: passed, 446 files.
- `pnpm check:showcase`: passed with 0 fabricated-showcase hits.
- `pnpm typecheck`: passed, 6 Turbo tasks.
- `pnpm test`: passed, 6 Turbo tasks:
  - agent: 12 files, 57 tests
  - web: 112 files, 477 tests
  - SDK: passed
  - mobile: pass-with-no-tests
- `pnpm build`: passed, 4 Turbo tasks; the agent binary built and Next.js compiled/generated 36
  routes/pages including `/api/agent/connect`, `/api/agent/sign`, and `/api/agent/pay/result`.
- `pnpm --filter @tab/web db:check`: passed (`Everything's fine`).
- `git diff --check` and staged diff check: passed.
- Source hard cap: no TypeScript/TSX file under `apps/` or `packages/` exceeds 300 lines; the maximum
  is exactly 300 lines.
- Independent follow-up correctness/security review: READY with no remaining blockers after all
  prior HOLD findings and the 0015-to-0016 migration gap were resolved.
- Pull-request CI: pending publication; update this evidence after the hosted workflow passes.

## Deviations From Plan

- The plan says the client result response finalizes `pending→settled` or `pending→failed`.
  Client data is not authoritative enough for a money ledger. The implementation records it as an
  observation and settles only from server-fetched on-chain proof. Ambiguous client/network failure
  remains pending and retries instead of being mislabeled failed.
- The plan describes the Magic signing call behind an OIDC environment guard. Because B-03 has not
  established the real Express contract, Phase 6 stops one boundary earlier and always returns
  `SIGNER_NOT_CONFIGURED` after every policy check. No speculative Magic request shape ships.
- F-1 names publication behavior, but B-08 is still open. The built package and pack contents are
  verified locally while npm installation remains explicitly blocked.
- B-10 has not named a judged payable target. The implementation therefore exposes universal,
  caller-supplied upstream/fetch URLs rather than inventing `LEASH_DEMO_TARGET_URL` content.
- Migration `0016` retains legacy request fingerprints as exact audit evidence and performs replay
  matching from canonical stored payment semantics. This avoids rewriting historical evidence
  while preventing case-only nonce replay conflicts.

These are targeted plan/wiki deltas to propose; the authoritative documents were not silently
edited as a coding side effect.

## Open Blocks and Follow-ups

1. B-03: establish the Magic Express custom-issuer/TEE signing contract and provision the first
   real agent wallet. Before enabling it, add a signing claim/lease so concurrent identical replays
   cannot terminalize the same receipt between final preflight and signature release.
2. B-04: run the funded mainnet x402 payment and capture facilitator plus independent chain proof.
3. Add an expired-pending reconciler before B-03: use chain time and native USDC
   `authorizationState`; never release a reservation merely because a client reported failure.
4. B-08: reserve and publish the agent package names before showing npm installation as live.
5. B-10: select and verify the flagship payable x402 target; do not substitute a fabricated
   resource.
6. Before public traffic, add signer-route rate limiting/body-stream limits and pin trusted RPC
   chain identity/confirmation policy.
7. Update the result-contract wording in the plan/wiki to make server-side on-chain proof, retry,
   and honest pending ambiguity authoritative.
