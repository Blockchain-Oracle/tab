# Story: Owner revokes the agent (revocation spectrum)
> Traces to: R-DASH-4, R-DASH-6; AC-LEASH-3, AC-LEASH-4, AC-MOBILE-1. Spec: .thoughts/specs/2026-07-02-tab-leash.md

As an agent owner,
I want to revoke my Leash agent at four discrete escalating levels — soft pause, freeze, cancel, and nuclear — from both the web dashboard and my mobile PWA,
so that I can halt agent activity instantly and proportionally to the situation, without any on-device signing or on-chain transaction.

## Acceptance Criteria

- The web dashboard exposes all four revocation actions as distinct, labelled controls. (R-DASH-4)
- The mobile PWA exposes all four revocation actions with the same behaviour as the web dashboard. (R-DASH-6)
- All four revocation actions are implemented as HTTP calls to the `apps/web` backend; no on-chain transaction is made and no private key signing occurs on any client surface. (R-DASH-4, R-DASH-6, Constraint 7)
- **Level 1 — Soft pause (resumable):** triggering soft pause halts the agent loop; no x402 payment is submitted after the action takes effect; the server-held key is not touched. (R-DASH-4, AC-LEASH-3)
- **Level 1 — Resume from soft pause:** the owner can resume the agent from a soft-paused state; payments proceed normally on the next loop iteration. (AC-LEASH-3)
- **Level 2 — Freeze (resumable):** the agent cannot submit any x402 payment while frozen; the server-held key (credential) remains intact and is not rotated or deleted; the owner can resume. (R-DASH-4)
- **L3 — Cancel:** revokes the `signer_subject` at the Tab OIDC credential layer and invalidates all Leash keys. Magic has no wallet-delete or key-rotate endpoint (verified absent); cancellation is entirely at our credential layer. Re-provisioning mints a new OIDC subject. **Named spike (B-03, unverified):** whether a new OIDC subject yields a new TEE wallet address is unknown until the spike runs; two copy variants are pre-authored and the pick is deferred to the spike result. (R-DASH-4, reintegration H-2)
- **L4 — Nuclear (irreversible):** pre-destruction dialog shows the live remaining float balance and a **"Withdraw first"** offer; on confirm, the entire credential chain is hard-deleted (OIDC subject + all keys + JWT material); status becomes `nuked` (irreversible tombstone); the dashboard renders the "not provisioned" chip family. **Post-nuke floats are NOT withdrawable via Leash** — the withdraw path is itself TEE-signed and the credential no longer exists. Re-provisioning requires a new agent. (R-DASH-4, AC-LEASH-4, reintegration H-3)
- No `signAuthorization`, `signMessage`, or private key ever exists on the mobile surface during any revocation action. (R-DASH-6, AC-MOBILE-1, Constraint 7)
- A revocation action triggered from the mobile PWA produces the same agent halt as the same action triggered from the web dashboard, within HTTP round-trip latency. (AC-MOBILE-1)

## Scenarios

### Scenario 1 — Soft pause halts the agent; owner resumes

```
Given the Leash agent is running and making autonomous x402 payments
When the owner triggers "soft pause" from the web dashboard
Then the agent loop halts
And no further x402 payment is submitted
And the server-held key is unchanged

When the owner triggers "resume" from the web dashboard
Then the agent loop resumes on its next iteration
And x402 payments proceed normally
```

### Scenario 2 — Freeze blocks all transactions; key remains intact

```
Given the Leash agent is running and making autonomous x402 payments
When the owner triggers "freeze" from the web dashboard
Then the agent cannot submit any x402 payment
And the server-held key is neither rotated nor deleted
And the freeze can be lifted by the owner to resume normal operation
```

### Scenario 3 — Cancel revokes the credential at our OIDC layer; new subject required

```
Given the Leash agent is in an active or paused state
When the owner triggers "cancel" from the web dashboard
Then the signer_subject is revoked at the Tab OIDC credential layer
And all Leash keys are invalidated
And the agent cannot submit any x402 payment
And Magic is NOT called for wallet delete or key rotation (no such endpoint exists)
And the agent remains non-operational until the operator re-provisions (minting a new OIDC subject)
Note: Named spike B-03 determines whether re-provisioning yields a new TEE wallet address.
Both copy variants are pre-authored; the displayed copy is picked after the spike result.
```

### Scenario 4 — Nuclear: withdraw-first offer → credential chain destroyed; post-nuke floats not recoverable via Leash

```
Given the Leash agent is in any state (running, paused, or frozen)
When the owner triggers "nuclear" from the web dashboard
Then the pre-destruction dialog shows the live remaining float balance
And the dialog offers a "Withdraw first" action before destruction proceeds
When the owner confirms destruction (skipping or after the withdraw offer)
Then the entire credential chain is hard-deleted (OIDC subject + all keys + JWT material)
And status becomes "nuked" (irreversible tombstone)
And the dashboard renders the "not provisioned" chip with the note:
  "Permanently destroys the signing credential. There is no recovery."
And post-nuke floats are NOT withdrawable via Leash — the TEE credential is gone
And restoring operation requires provisioning a new agent (new OIDC subject, new wallet)
```

### Scenario 5 — Mobile PWA revoke reaches backend with no on-device signing

```
Given the owner has the mobile PWA open
And the Leash agent is running and making autonomous x402 payments
When the owner triggers any revocation level from the mobile PWA
Then an HTTP call is made to the apps/web backend
And the agent halts to the same degree as the equivalent action from the web dashboard
And no EIP-7702 authorization, signMessage, or private key is used on the mobile device
And the halt takes effect within HTTP round-trip latency
```

## Notes

- The "leash" in revocation is entirely economic and operational — it is app-layer policy enforced by the backend (key deletion, rotation, or loop halt), not an on-chain cryptographic primitive such as a session key or a delegation contract. The spec explicitly rules out on-chain session-key delegation in 7702 mode. (Constraint 6, Non-Goals)
- Mobile holds no key, performs no signing, and holds no EIP-7702 authorization at any time. Revoke from mobile is a read/control client action only — the same HTTP backend call the web dashboard makes. (R-DASH-6, Constraint 7)
- L1 (pause) and L2 (freeze) are both resumable and leave the OIDC credential intact. L3 (cancel) revokes the `signer_subject` at our credential layer — Magic has no wallet-delete endpoint (verified absent). L4 (nuclear) destroys the entire credential chain including JWT material, making post-nuke float recovery via Leash impossible. The distinction matters: after L3 a new provisioning path exists; after L4 the credential chain is gone. (R-DASH-4, reintegration H-1..H-4)
- The spec draws the four levels from verified UX research (§C revocation spectrum): soft pause → freeze → cancel/archive → nuclear. The architectural pattern is confirmed as correct and honest — the submission must not overclaim cryptographic delegation. (Leash idea card, brutal honesty section)
- No on-chain transaction is used for any revocation level. (R-DASH-4, research/x402-tab-leash-mechanics.md §5)

## Open Questions

- The spec defines soft pause as "agent loop halted" and freeze as "agent cannot transact" — but it does not specify what distinguishes these two states in the implementation. Is soft pause a scheduler-level halt (the loop runner is stopped) while freeze is a payment-gate check inside a running loop? The acceptance criteria only cover soft pause explicitly (AC-LEASH-3); freeze has no dedicated AC. The behavioral distinction needs to be decided before the backend is built.
- What dashboard state indicator (label, badge, status chip) is shown to the owner while the agent is soft-paused, frozen, or cancelled? The spec specifies "not provisioned" for the nuclear state (AC-LEASH-4) but is silent on the visual state for the three lighter levels.
- What happens to an x402 payment that is already in-flight (the outbound HTTP request has been sent, awaiting the 402/200 response) at the exact moment a revoke action is triggered? The spec does not address whether the in-flight payment completes or is abandoned.
- What is the HTTP API shape for the four revocation actions — one endpoint accepting a level parameter (e.g., `POST /api/agent/revoke { level: "nuclear" }`), or four separate endpoints? This is an implementation decision not specified in the spec, but it shapes the mobile and web dashboard integration.
- The spec marks the mobile surface as "proposed pending Abu's confirm" (PWA vs Expo React Native). The story assumes PWA (Next.js `/mobile` route or separate Vite build) per DECISIONS.md. If the mobile surface changes to Expo, does the Web Push notification path for Tier 2/3 events change? (OQ-6)
