# Phase 0 live x402 + Magic integration spike

Status: approved for execution by Abu on 2026-07-18.

## Outcome

Make Phase 6 F-9/F-15 real on Base Sepolia before returning to the normal build
sequence. The funding checkpoint is the only planned pause: Tab must first return
the real Magic Express payer address, exact faucet instructions, and the separately
verified Particle buyer EOA/UA address.

## Non-negotiable boundaries

- Test x402 payments use only `eip155:84532`, Circle Base Sepolia USDC
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, and
  `https://x402.org/facilitator`.
- Every testnet surface says `Test funds — not real money`.
- Existing agents default to the persisted `mainnet` profile. A newly provisioned
  spike agent explicitly uses `base_sepolia_integration`. The request body cannot
  select or override the profile.
- A profile registers only its own networks. There is no mainnet-to-testnet or
  testnet-to-mainnet fallback.
- The Magic JWT, provider secret, Leash key, session cookie, and signing request
  authorization are never printed, returned to browsers, committed, or stored in
  general-purpose logs.
- Particle Universal Accounts remain a separate Base-mainnet funded spike. The
  installed `@particle-network/universal-account-sdk@2.0.3` types are authoritative
  and contain no testnet chain.

## Provider contract decisions

- Use `POST /v2/wallet` and `POST /v2/wallet/sign/data`. Magic changed the
  authoritative Express wallet-operation contract to v2 on 2026-07-09 and will
  retire v1 on 2026-07-31; pre-cutoff v1 requests merely redirect to v2. This is
  an explicit evidence-backed deviation from the older x402 recipe and Abu's
  literal v1 wording, not a silent substitution.
- Register or reuse the OIDC provider through Magic's identity-provider API. Reuse
  requires an exact issuer/audience/JWKS match; drift fails closed rather than
  modifying or deleting an existing provider automatically.
- Use a stable public HTTPS deployment origin as the issuer. Publish discovery and
  a public RS256 JWKS; mint server-only JWTs with a persisted opaque per-agent
  subject and a maximum five-minute lifetime.
- Live validation reached Magic's downstream v2 wallet-creation stage but returned
  401. Magic's newer Core v2 documentation rejects self-managed issuers while its
  Express documentation still advertises custom OIDC. Treat that provider-side
  contradiction as unresolved until Magic confirms the trust-store behavior; do
  not replace the current app or silently substitute a third-party issuer.
- Hash the exact accepted EIP-712 typed data with `viem.hashTypedData`. Reconstruct
  the Magic response with `serializeSignature`, recover locally on the server, and
  require equality with the persisted agent address before returning a signature.

## Execution tasks

### 1. RED: profile and database contract

Files:

- `apps/web/lib/db/leash-control-schema.ts`
- `apps/web/lib/db/leash-ledger-schema.ts`
- `apps/web/lib/db/leash-receipt-schema.ts`
- `apps/web/lib/leash/sign-request.ts`
- `apps/web/lib/leash/float-balance.ts`
- `apps/web/lib/leash/settlement-evidence.ts`
- `apps/web/lib/leash/receipt-view.ts`
- `apps/agent/src/routing.ts`
- `apps/agent/src/eip3009-authorization.ts`
- `apps/agent/src/payment-client.ts`
- connect/bootstrap/runtime modules in both applications

Tests first:

- persisted profile defaults existing agents to `mainnet`;
- integration profile accepts only Base Sepolia native USDC with domain name
  `USDC`, version `2`, and chain ID `84532`;
- mainnet behavior stays byte-for-byte equivalent for Base and Arbitrum;
- cross-profile requests, wrong assets, wrong domain names, and unknown profiles
  fail closed;
- trusted RPC `eth_chainId` must equal the configured network before balance or
  settlement reads;
- Base Sepolia receipts render the exact test-funds label and explorer origin.

Generate a new Drizzle migration; never edit migration `0015`.

### 2. RED: OIDC, provisioning, and Magic client

Add isolated server modules for OIDC/JWKS/JWT and the strict Magic Express client.
Add public discovery and JWKS routes. Replace the provision route's B-03 guard with
a validated, same-origin owner mutation that creates/reuses an owned agent, mints
the short-lived JWT, and persists only the provider-returned address.

Tests first:

- discovery, JWKS public-only fields, JWT signature, claims, subject stability,
  audience, issuer, key ID, and TTL;
- exact Magic URL/header/body contract without secret-bearing assertions;
- response size and timeout bounds;
- provider rejection, rate limit, unavailable, timeout, invalid response, and
  missing configuration remain distinct;
- same-subject provisioning returns the same wallet; a separate live-only test
  proves a different subject receives a different wallet.

### 3. RED: signing claim, TEE adapter, and reconciliation

Add a database-backed lease token and expiry to pending receipts. Claim one signing
attempt transactionally, perform the external TEE call outside the transaction, and
finalize only with the matching lease token. An ambiguous timeout never fabricates
failure or retries concurrently. Reconciliation checks expiry and the native USDC
authorization state before allowing a safe retry or terminalizing the receipt.

Tests first:

- concurrent identical requests produce one provider signing call;
- an expired lease is reconciled without double settlement;
- cap, paused/frozen/nuked, empty float, invalid chain, expired authorization, and
  missing configuration make zero provider calls;
- provider errors do not become `SIGNER_NOT_CONFIGURED`;
- exact hash, `r/s/v` reconstruction, and local signer recovery are mandatory;
- request, response, rate, and timeout bounds fail closed without leaking secrets.

### 4. Canonical Tab x402 resource

Add direct web dependencies on `@x402/core@~2.17.0` and
`@x402/evm@~2.17.0`. Protect `GET /api/x402/testnet` with `withX402`, an explicit
atomic price/asset, a configured real payee, the test facilitator, and a test-funds
response label. Missing or unsafe configuration returns 503 before x402 setup.

Wrap the real facilitator client so a successful `settle` result is returned only
after Tab independently verifies the Base Sepolia chain, exact Circle USDC receipt,
`Transfer`, and `AuthorizationUsed`, then atomically converges the seller and payer
ledgers. Do not use `onAfterSettle` for enforcement: the installed x402 server
suppresses hook failures. Persist transient RPC/non-propagation results only in a
durable unverified outbox keyed by payer+nonce; replay re-verifies before another
facilitator call. Authoritative settlement rows require verified on-chain proof.

Tests first:

- unpaid request is a genuine protocol-shaped 402 with exact immutable values;
- successful handler output is test-labeled;
- facilitator verify/settle failures cannot become 200 or a settled receipt;
- duplicate settlement evidence is idempotent.

### 5. Deploy, register, and provision to the funding checkpoint

Create or safely reuse one stable Vercel project/domain, configure named secrets
without echoing them, deploy the issuer/JWKS/resource server, and verify public
metadata. Register or exactly reuse the Magic OIDC provider by API. Provision the
real integration agent twice with the same subject, then provision a distinct
subject and compare the returned public addresses.

Return to Abu:

- the real Magic payer address;
- Circle faucet: `https://faucet.circle.com/`;
- chain `Base Sepolia (eip155:84532)`;
- token `USDC` at the exact Circle contract above;
- the separately verified buyer EOA/Particle 7702 UA address
  `0x895792c87f4A3D0aAFf9604CEab10169F3194Cc0`, with a request for approximately
  20 native USDC on Base mainnet for the later Particle spike.

Pause only until Abu reports the relevant address funded.

### 6. Funded live proofs

Use the built, packed artifact from a clean temporary consumer. Drive a real MCP
stdio `paid_fetch` request through Tab's 402, policy gates, Magic TEE signature,
the public facilitator, Base Sepolia settlement, retry, independent verification,
receipt/cycle/feed/notification update, then restart client and server and repeat
the persisted-state read.

Capture only secret-safe evidence: payer, payee, amount, network, asset, nonce,
facilitator result, recovered signer, transaction hash/explorer link, PostgreSQL
receipt/cycle rows, and redacted CLI transcript.

Run real negative cases and compare balances/nonces before and after: cap exceeded,
paused/nuked, insufficient float, duplicate request/nonce, expired authorization,
and restart persistence. Each blocked path must show no signature and no transfer.

### 7. Distribution, Particle, and final gates

- Exclude all test/test-support material from the agent tarball.
- Build, `pnpm pack --dry-run`, pack to a temporary directory, install into a clean
  consumer, execute `node_modules/.bin/leash-mcp`, and import `@tab/agent/fetch`.
- After Base-mainnet funding, run the separate real Particle
  `createTransferTransaction -> two Magic signatures -> sendTransaction ->
  destination confirmation -> cross-chain float rebalance` proof. Never substitute
  testnet or simulated funds.
- Run `pnpm check:showcase`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build`, followed by the project verification audit, security/code review,
  and GitHub CI confirmation.

No completion claim is valid without command output, test counts, and live chain
evidence.
