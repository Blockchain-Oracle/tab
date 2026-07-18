# Magic Express preflight rerun

Date: 2026-07-18

Workflow: `tab-product-experience-rebuild-20260718T160724Z-091e9f167310`, Step 7

Verdict: **provider-blocked, with no payer address created.** The deployed OIDC
issuer, discovery/JWKS metadata, registered provider, and production origin are
healthy. A fresh real wallet-creation request reached Magic Express and was
rejected at `WALLET_CREATION`. B-03 remains blocked; no funding or live-signing
claim is allowed.

## Stable issuer evidence

The compatibility issuer remained unchanged at `https://tab-rosy.vercel.app`.
A bounded public check observed:

```json
{
  "discoveryStatus": 200,
  "issuerExact": true,
  "jwksUriExact": true,
  "jwksStatus": 200,
  "keyCount": 1,
  "rsaRs256PublicKey": true
}
```

The JWKS check required one public RSA/RS256 signing key and verified that no
private `d` member was present.

## Magic account preflight

The secret-safe repository preflight queried Magic's provider registry and
production access allowlist. Sensitive Vercel variables and the local Magic
secret source were injected into the subprocess without printing their values.
It returned:

```json
{
  "providerExactMatch": true,
  "productionOriginAllowlisted": true,
  "providerCount": 1
}
```

This proves configuration presence and exact registration. It does not prove
that Magic accepts a wallet-creation JWT.

## Fresh wallet-creation attempt

The live-only Vitest file
`apps/web/lib/leash/magic-express.live.integration.test.ts` ran with its dedicated
`vitest.live.config.ts`. The real owner identity was verified through Magic Admin,
then the deployed `POST /api/leash/provision` route attempted the existing owned
Phase-0 payer.

Observed client result:

```text
Test Files  1 failed (1)
Tests       1 failed (1)
Assertion   SIGNER_PROVIDER_REJECTED: expected 502 to be 200
```

The bounded production warning log recorded:

```json
{
  "code": "SIGNER_PROVIDER_REJECTED",
  "providerHints": [],
  "providerStage": "WALLET_CREATION",
  "providerStatus": 401,
  "providerTraceId": "express-c371acd9-a503-44d4-ad44-b47e1f4b9733"
}
```

No raw provider body, JWT, opaque subject, credential, or private key was logged.
Because the first real wallet call failed, the distinct-subject probe did not run.

## PostgreSQL evidence

A read-only aggregate query against production returned:

```json
[
  {
    "id": "14ab5bba-51ba-495a-a504-afdb953ecdf1",
    "paymentProfile": "base_sepolia_integration",
    "addressPending": true,
    "recentAttempts": 1
  }
]
```

The agent retained its stable opaque subject internally, but the subject was not
printed. No wallet address was fabricated or persisted.

## Safety and deviations

- The initial generic Vitest invocation stopped before provider/database mutation
  because the normal global setup refused the production `neondb` database. The
  dedicated live configuration was then used; the safeguard was not weakened.
- Vercel CLI exposed non-sensitive production configuration to `env run` but did
  not inject sensitive Magic/session values. The existing gitignored local secret
  source filled only those missing variables without echoing them.
- The current route-level repeat check would prove Tab/PostgreSQL idempotency after
  a successful first call, not Magic's literal same-subject API idempotency. A
  future accepted run must call `/v2/wallet` twice for the same persisted subject
  and compare the two provider-returned addresses before claiming that property.
- Different-subject wallet separation also remains unproven because Magic did not
  return the first wallet.
- Context7 remained quota-blocked. No package was installed or upgraded; the
  deployed provider response, installed implementation, and pinned official Magic
  references were used for this rerun.

## Required next action

Magic must resolve or explain the Express custom-OIDC wallet-creation 401 for the
exact registered provider. Until a fresh request returns a real public address:

- Step 8 records that no payer address exists and does not request testnet funding;
- live Magic signing, signer recovery, facilitator settlement, and Base Sepolia
  transaction evidence remain blocked;
- the independent non-money R1-R7 implementation lane may continue.
