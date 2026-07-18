# Product Surface Map: Tab Product Experience Rebuild

## Entry Points And Navigation Flow

### Public and developer entry

```text
<domain>/
  ├─ Understand one rail / two payers
  ├─ See human checkout and Leash flows
  ├─ Read security and test/live boundaries
  ├─ Open docs.<domain>
  └─ Continue to app.<domain>
       ├─ Merchant signup/login
       └─ Leash owner signup/login
```

### Merchant shortest path

```text
Signup → restore/login with Magic → business identity → checkout appearance
→ create key → configure/test webhook → open real tenant test checkout
→ inspect persisted payment + webhook evidence → go-live readiness
```

### Buyer shortest path

```text
Merchant PayButton → signed intent/context load → email or restored Magic session
→ unified balance read → confirm exact amount → real execution stages
→ authoritative verification → receipt/success
```

### Leash shortest path

```text
Owner login → provision Magic Express agent → set cap/emergency policy
→ Base Sepolia Test Lab → connect packed CLI/MCP → first paid request
→ pre-sign gates → real 402/sign/facilitator/settlement/retry
→ receipt evidence → notification/mobile oversight
```

### Mobile shortest path

```text
Install/open PWA → authenticated overview/feed → receipt detail
→ notifications → Pause/Freeze/Cancel/Nuclear → independently confirmed state
```

## Screen Inventory (by role)

### Public stranger

| Surface | Purpose | Required states |
| --- | --- | --- |
| Marketing home | Explain “Invisible payments—for you, and for your AI” through the kinetic transaction trace | static-first loading, full motion, reduced motion, mobile navigation, unavailable app/docs link recovery |
| Human payments story | Teach Magic identity + Particle unified balance without crypto prerequisite language | default, expanded technical detail, reduced motion |
| Agent payments story | Teach policy-first x402 and the reason Particle is outside the hot path | default, gate-by-gate reveal, reduced motion |
| Evidence/security | Show what Tab proves and what it never claims | default, test/live comparison, blocked capability |
| Developer preview | Show real PayButton and server/CLI entry points | loading, copied, copy error, package-unpublished note when applicable |

### Authentication and workspace entry

| Surface | Purpose | Required states |
| --- | --- | --- |
| Merchant login/signup | Restore Magic or complete email OTP | checking session, email idle/submitting, OTP idle/verifying, expired, invalid, rate-limited, provider unavailable, success |
| Leash login | Authenticate an owner into the agent control plane | same auth states plus no-owned-agent state |
| Workspace entry | Choose Merchant or Leash without redundant OTP | loading, both available, merchant only, Leash only, first-run, session expired |
| Resume onboarding | Return to the first real incomplete step | calculating, actionable incomplete, complete, stale/error |

### Merchant

| Surface | Purpose | Required states |
| --- | --- | --- |
| Merchant onboarding | Identity → appearance → key → webhook → test checkout → readiness | loading, each step incomplete/in-progress/complete/error, skipped-resumable, provider unavailable |
| Overview | Summarize real integration and money state | loading, empty day zero, partially configured, test-active, live-ready, live-active, data error |
| Integrate / Quickstart | Install SDK and prove the integration | loading, package unavailable, key missing, code copied, test request pending/passed/failed, all complete |
| API keys | Create/show once/rotate/revoke | empty, loading, created secret visible once, copied, rotate confirm, revoke confirm, rate/error |
| Checkout appearance | Configure and preview merchant identity | loading, no logo, upload progress/error, invalid color, saved, live preview |
| Test workspace | Run the merchant’s real test checkout | intent loading/error, PayButton states, test-payment persisted, webhook pending/delivered/failed |
| Payments list | Browse human and agent payments | loading, empty, sparse, dense, filtered empty, pagination, stale/error |
| Payment detail | Explain payer, route, settlement, and delivery | pending, settled, failed, blocked, test simulation, verification unavailable |
| Webhooks | Configure endpoint and inspect health | unconfigured, verifying, healthy, degraded, disabled, secret regenerated, test delivery pending/passed/failed |
| Webhook deliveries | Inspect and resend evidence | loading, empty, delivered, retrying, exhausted, filtered empty, detail expanded |
| Settings | Merchant identity and receiving configuration | loading, dirty, validation error, saving, saved, reconciliation pending/failed |
| Go live | Make an explicit mainnet transition | prerequisites incomplete, ready, confirmation, enabling, live, provider/configuration failure |

### Buyer checkout overlay

| Surface/state | Required presentation |
| --- | --- |
| Trigger bootstrap | Stable amount geometry, loading shimmer, disabled/error recovery |
| Opening | Branded sheet and first real stage without false progress |
| Email | Merchant + Tab identity, labeled field, persistent-login context, validation |
| OTP | Six-digit input, paste support, resend cooldown, invalid/expired/rate-limit recovery |
| Balance loading | Real unified-balance read with meaningful status announcement |
| Balance ready | Available balance, exact amount, merchant, plain-language source, confirm |
| Insufficient | Current balance, shortfall, add-funds action, cancel |
| Add funds | Deposit address, QR/copy, supported network names/logos, recheck, no ambiguous “funded” flag |
| Confirming | Real substages: preparing, authorizing, and submitting; never timer-driven |
| Submitted success | Appears immediately after a real `transactionId`; exact amount, merchant, reference, and honest verification-in-progress evidence |
| Verified evidence | Independently verified settlement/delivery axes update without making the buyer wait for block finality before submitted success |
| Error | Specific failure, whether money may have moved, safe retry/reconcile/cancel action |
| Test mode | Persistent “Test payment — no real funds moved” treatment across all states |

### Leash web

| Surface | Purpose | Required states |
| --- | --- | --- |
| Agent onboarding | Provision → policy → fund → connect → first call | unconfigured, provisioning, address ready, awaiting funds, funded, signer verified, connected, first call passed/failed |
| Overview | Show agent health and next action | no agent, loading, active, paused, cancelled, nuked, low float, signer unavailable, data error |
| Agent switcher | Select owned agent without losing context | one, many, loading, unavailable, no ownership |
| Activity/payments | Poll real receipt ledger | empty, pending, settled, failed, blocked, stale, filtered empty, pagination |
| Receipt detail | Prove the full payment consequence | challenge, policy, authorization, facilitator, settlement, delivery, verification axes each pending/passed/failed/unavailable |
| Policy/cap | Create/update/reset budget policy | no cap, valid, approaching cap, exceeded, reset available, saving, conflict/error |
| Funds | Show exact-chain native USDC floats | loading, ready, low, empty, partial RPC failure, Base Sepolia test funds, mainnet live funds, rebalance blocked/in-progress/completed/failed |
| Test Lab | Provision/funding/signing readiness | checking, needs USDC, optional gas absent, claim available/pending/cooldown/failed, external fallback, funded, signer unverified/verified |
| Connect | Configure MCP/CLI and prove first paid call | key absent/created/copied/revoked, snippet copied, CLI unavailable, call running/passed/failed |
| Notifications | Triage real operational events | empty, unread, filtered, resolved, stale/error, pagination |
| Emergency controls | Pause, Freeze, Cancel, Nuclear | idle, confirm, in-progress, independently confirmed, partial failure, already applied; Freeze leaves credentials untouched, Cancel revokes signer subject and keys, and withdrawal-first is visibly blocked until real |

### Mobile PWA

| Surface | Purpose | Required states |
| --- | --- | --- |
| Overview | Glanceable agent/cap/float health | loading, active, paused/nuked, low float, stale/offline, no agent |
| Feed | Monitor receipts and notifications | loading, empty, pending/settled/blocked/failed, stale/offline, pagination |
| Receipt | Inspect amount, origin, gate, and settlement evidence | loading, missing, pending, settled, blocked, verification unavailable |
| Notifications | Read/resolve actionable events | permission unknown/denied/granted, empty, unread, resolved, offline |
| Controls | All four revocation levels without desktop escape | idle, confirmation, applying, confirmed, failed, offline-disabled |
| Install/push | Install and enable notifications | unsupported, available, installed, permission denied, subscription pending/active/error |

### Documentation

| Surface | Required states |
| --- | --- |
| Docs home/navigation | loading/static, search empty/results/error, mobile navigation |
| SDK/PayButton | install available/unpublished, copied, runnable example, type/API version note |
| API/webhooks | authenticated examples, response/error schemas, test/live boundary |
| Leash CLI/MCP | packed artifact install, configuration, first call, troubleshooting |
| Networks/security/receipts | exact profiles/assets, official links, evidence semantics, blocked capabilities |

## Per-screen Required States (demo-critical tier + full inventory)

### Demo-critical 1: Human checkout

The audience must see a real merchant context, branded login/session restoration, real unified-balance read, exact authorization consequence, progress driven by real callbacks, and authoritative success or honest blocker. Failure and insufficient-balance paths must be equally designed.

### Demo-critical 2: Agent pays under policy

The audience must see the genuine 402, status/cap/key/float gates before signing, Magic signer recovery, facilitator acceptance, Base Sepolia settlement, protected retry, independent verification, and persisted receipt/notification. Test-funds labeling remains visible.

### Demo-critical 3: Owner prevents payment

Cap-exceeded and pause/nuke paths must visibly stop before signature and create no transfer. Mobile emergency control must confirm the server state independently rather than merely animating a local toggle.

### Completeness rule

Every screen in the inventory must cover loading, empty, error, success, disabled/unavailable, and its listed product-specific states. Skeletons preserve final geometry; empty states always provide a real next action; errors state whether retry is safe.

## On-screen Data Shapes And Sample Data

The values below are **PROTOTYPE-ONLY ILLUSTRATIONS**. They may be used in design previews but must never seed or appear as production financial state.

### Network identity

- Full name: `Base Sepolia`
- CAIP-2: `eip155:84532`
- Token: `Circle USDC`
- Contract: `0x036C…CF7e`
- Label: `Test funds — not real money`
- Explorer action: `View on BaseScan`

### Merchant payment row

- Amount: `$12.00`
- Payer type: `Human`
- Merchant: `Northstar Tools` (prototype only)
- Status: `Settled`
- Network: `Arbitrum One` with official mark
- Reference: `tab_7F3A…91C2`
- Transaction: `0x91c2…72aa`
- Webhook: `Delivered · 204`
- Time: `18 Jul 2026, 14:32 CAT`

### Leash receipt

- Agent: `Research buyer` (prototype only)
- Resource: `POST api.example.dev/report`
- Amount: `0.001000 USDC`
- Payer/payee: `0xAb12…90Ef` / `0x93C4…11D8`
- Network/asset: `Base Sepolia · Circle USDC`
- Nonce: `0xa41f…18c0`
- Valid before: `14:36:10 CAT`
- Cap context: `$0.001 of $5.00 today`
- Axes: `Challenge · Policy · Signature · Facilitator · Settlement · Delivery · Verified`
- Transaction: `0x72aa…118f`

### Funding readiness

- Payer: `0xAb12…90Ef`
- USDC: `0.000000 / 0.010000 required · Needs funds`
- Native ETH: `0.0000 · Optional for this x402 test`
- Signer: `Address ready · Signature check pending`
- Claim: `Available`, `Claiming…`, `Cooldown until 14:40`, or `Provider unavailable`
- Last checked: `12 seconds ago`

### Policy and emergency state

- Status: `Active`, `Paused`, `Frozen`, `Cancelled`, or `Nuked`
- Daily cap: `$5.00`
- Used: `$1.24`
- Remaining: `$3.76`
- Next reset: `00:00 CAT`
- Key: `Connected · last used 2 min ago`
- Float: `Base $8.40 · Arbitrum $12.00`
- Consequence: `Paused agents cannot request a signature or transfer funds.`

## Generated Artifacts (documents, exports, receipts)

- Checkout receipt/reference with test/live identity and verification state.
- Agent x402 receipt with complete evidence axes and explorer link.
- Redacted CLI transcript for the first real paid call.
- Webhook request/response evidence and resend history.
- Funding claim/readiness record with cooldown and observed balances.
- Verification-audit report linking requirement, story, implementation, test, and live evidence.

## Copy And Vocabulary Rules

- Lead with user-recognizable outcomes: `Pay`, `Available balance`, `Set a spending limit`, `Pause agent`, `View receipt`.
- Buyers see `Tab balance`; chain details appear only where needed for funding, evidence, or developer work.
- Developers always see full network name, official mark, CAIP-2 ID, asset name/address, amount, nonce, and expiry where relevant.
- Never use chain initials as the only identity.
- Use `Test funds — not real money` for Base Sepolia and `Live funds` for mainnet.
- Do not say `success`, `settled`, `funded`, or `verified` without the corresponding authoritative observation.
- Errors do not apologize. They state what failed, whether money may have moved, and the safe next action.
- No `wallet connect` language for buyer email login, no LLM/model picker in Leash, and no claim that Particle participates in the x402 hot path.

## Decided vs Designer's Call

### Decided

- One rail / two payer narrative and the three demo-critical moments.
- Separate marketing, application/API, and docs domains.
- Official chain marks plus full names.
- Kinetic transaction trace / receipt spine as the signature product motif.
- Motion is state-driven, one-shot, and reduced-motion-safe.
- Mainnet/testnet never silently fall back to one another.
- Every money state is real, explicitly test, or visibly blocked.

### Designer's call

- Exact responsive composition, spacing rhythm, crop, and section proportions.
- How the transaction trace bends, branches, and settles across breakpoints.
- Exact balance between dense ledger evidence and quiet product space.
- Micro-interaction easing and durations within accessibility/performance limits.

## Traceability

- Buyer surfaces: story 2 and R-TAB-4/5/6/9/10/12.
- Agent payment/evidence: story 3, F-9/F-15, B-03/B-10.
- Cap/policy: story 4 and Leash cap/status gates.
- Notifications/mobile: story 5 and Phase 9 P1-P6.
- Revocation: story 6 and the four-level revocation spectrum.
- Particle movement/rebalance: story 8 and B-04/Phase 10.
- One rail/two payers: story 9 and Tab-as-x402-resource.
- All surfaces: prototype reintegration no-shipping-mock contract and project quality profile.

## Open Questions

No surface decision remains open. Final root domain, Magic provider trust, Circle faucet credential access, and Particle funding are external execution inputs; their unavailable states are already specified above.
