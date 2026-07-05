# RAT + Mobile verification — Tab+Leash (Particle Universal Accounts, EIP-7702)

> Doc/code verification only. No live transactions were run. Every load-bearing claim
> is cited to a cloned doc/code file or a live primary source. "(unverified)" = not
> confirmable from a primary source / would need a live run.
>
> Sources consulted:
> - Cloned docs `Reference/particle-docs-mintlify/` (HEAD `360327a`)
> - Cloned Privy 7702 demo `Reference/particle-universal-accounts-7702/` (HEAD `69df80e`)
> - Live server example `Particle-Network/universal-account-example/examples/7702-convert-evm.ts`
> - Context7 `/websites/developers_particle_network`
> - Grounding wiki: `.thoughts/wiki/sdks/particle-universal-accounts.md`, `.../concepts/agent-wallets.md`, `.../strategy/surface-feasibility.md`

---

## 1. Tab RAT — third-party settlement (`createTransferTransaction` → external receiver on Arbitrum, sourced cross-chain)

### VERIFIED (doc/code level)
- **`createTransferTransaction` settles to an arbitrary external `receiver` address.** The
  method "lets you send tokens to **any address** across supported chains." The `receiver`
  param is documented as "The recipient's address" (required) — not constrained to the
  caller's own accounts.
  - `Reference/particle-docs-mintlify/universal-accounts/ua-reference/web/transactions/transfer.mdx:7,17-24`
  - `Reference/particle-docs-mintlify/universal-accounts/web-quickstart.mdx:107-127` (`receiver: "0xYOUR_RECEIVING_ADDRESS"`)
  - Context7 `/websites/developers_particle_network` — `POST /createTransferTransaction`, body field `receiver (string) - Required - The recipient's address`.
- **Targets Arbitrum.** Quickstart + reference both hardcode `chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE`
  with USDT `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`.
  - `web-quickstart.mdx:110-117`; `transfer.mdx:17-24`; `reference-implementation.mdx:132`.
- **Liquidity sourced cross-chain, no asset/gas on the destination chain.** "The UA does
  **not** need USDT, gas, or any specific asset on Arbitrum. The SDK sources liquidity from
  the Primary Assets the UA holds across chains and routes them automatically."
  - `web-quickstart.mdx:129-131` (Info box); `transfer.mdx:7` ("liquidity and gas are abstracted").
- **Signing shape is simple for a server caller:** build tx → `wallet.signMessage(getBytes(transaction.rootHash))`
  → `ua.sendTransaction(transaction, signature)` → returns `transactionId` + explorer URL
  `https://universalx.app/activity/details?id=...`. `web-quickstart.mdx:119-126`.

### What the OFFICIAL cloned demo proves vs. what still needs a live run
- The cloned **Privy 7702 demo** (`particle-universal-accounts-7702`) **does NOT exercise
  `createTransferTransaction` and does NOT settle to an external receiver.** It only imports
  and calls `createBuyTransaction` and `createSellTransaction` (swap a token into/out of the
  UA's own balance). Confirmed by grep of `app/page.tsx` (only `createBuyTransaction` /
  `createSellTransaction` are imported/called; no `createTransferTransaction`, no `receiver`)
  and by `lib/buy-transaction.ts` / `lib/sell-transaction.ts`.
  - So the demo PROVES, end-to-end in a browser: (a) UA init with `useEIP7702: true`
    (`app/page.tsx:225`), (b) inline 7702 authorization signing over `transaction.userOps`
    (`lib/eip7702.ts`), (c) a **cross-chain value move via the UA** on chains incl. Arbitrum
    (`buy-transaction.ts:15` maps `42161 → CHAIN_ID.ARBITRUM_MAINNET_ONE`).
  - The demo does NOT prove: settlement to a **third-party** address (a "Tab" paying a merchant).
    That is a buy/sell into the user's own UA, not a transfer out to someone else.
- **The external-receiver Arbitrum transfer is documentation-proven only** (API shape +
  the runnable quickstart script `script.ts`). A funded UA actually settling USDT on Arbitrum
  to an external receiver, sourced from another chain, **still needs a live run** to prove
  end-to-end (out of scope here, no live txns). (unverified end-to-end)

### Nuance / tension to flag
- Three docs carry a migration-context line: "Assets can be **withdrawn to any account the
  user controls**, but only via the `createTransferTransaction` method"
  (`overview.mdx:27`, `reference-implementation.mdx:16`, `web-quickstart.mdx:18`). That
  "the user controls" phrasing is the **V1→V2 withdrawal warning** framing. The transfer
  **API itself** (`transfer.mdx`, Context7 API doc) is explicitly "send to **any** address."
  For a Tab paying an unrelated merchant, the "any address" semantics are the governing ones
  and are doc-supported — but the migration-warning wording is a place a judge could push back.

---

## 2. Leash RAT — headless agent key drives a UA in 7702 mode (`authorizeSync` / `eip7702Auth`)

### VERIFIED (doc/code level)
- **Server-side raw-key signing of 7702 auth is a documented, first-class path.** The docs'
  "About 7702 Mode" section shows the headless pattern: construct UA with
  `ownerAddress: wallet.address`, then for each `userOp.eip7702Auth` that is not yet
  `eip7702Delegated`, call **`wallet.authorizeSync(userOp.eip7702Auth)`** →
  `authorization.signature.serialized`, collect into `authorizations`, then pass them as the
  3rd arg to `sendTransaction`.
  - `Reference/particle-docs-mintlify/universal-accounts/ua-reference/web/initialization.mdx:137-162`.
- **Docs explicitly sanction server-side / raw-key use of 7702:** "7702 mode is **only
  available in server-side environments and embedded wallets** that support the authorization
  methods. JSON-RPC wallets are not supported at the moment."
  - `initialization.mdx:124-129` (Warning). Same statement in `eip7702-wallets.mdx`.
- **The runnable signer is a raw private key.** The live server example loads a private key
  straight from env:
  - `Particle-Network/universal-account-example/examples/7702-convert-evm.ts`:
    `const wallet = new Wallet(process.env.PRIVATE_KEY || '')` (ethers).
  - The quickstart ships an equivalent full Node script: `const wallet = new Wallet(process.env.PRIVATE_KEY!)`,
    signing the transfer's rootHash with that key — `web-quickstart.mdx:55-127`
    (with a "dev/test only — use KMS/HSM in prod, never a human-popup required" Warning at `:27-33`).
- **Is an agent-held key a legit/documented signer?** Mechanically **yes**. The SDK's owner/
  signer in 7702 mode is just "the EOA's private key." Nothing in the docs requires that key
  to be held by a human at a popup; the only constraint is that the signer can produce the
  Type-4 `authorizationList` + the rootHash signature — which a server-held `ethers.Wallet`
  does. The docs never name the key-holder, so a key held by an autonomous agent is
  indistinguishable, at the SDK level, from the documented "dev/test wallet" or "server key."

### Code/doc drift to note (small)
- The **docs** use `wallet.authorizeSync(userOp.eip7702Auth)` (`initialization.mdx:152`),
  but the **live cloned example** uses the lower-level ethers calls
  `wallet.signingKey.sign(hashAuthorization(userOp.eip7702Auth)).serialized` for the auth and
  `wallet.signMessageSync(getBytes(transaction.rootHash))` for the rootHash. Same outcome
  (a raw key, no human, produces both signatures); `authorizeSync` is the documented
  convenience method, `signingKey.sign(hashAuthorization(...))` is the explicit equivalent.
  Either is valid for a headless agent. (The exact `authorizeSync` method name is doc-stated;
  the cloned example does not call it — minor verification caveat.)

### Open INTERPRETATION question for judges (agent-key-as-"user")
- The UA Track frames the account as **"the user's EOA."** Tab+Leash has an **agent** hold a
  raw key that *is* the UA owner. This is **mechanically doc-supported** (the key is the EOA;
  the SDK doesn't care who holds it) but raises a **judging-criteria** question, not a
  technical one: **does the agent count as "the user"?** The docs are silent — they neither
  bless nor forbid an agent owner. So this is an interpretation risk to pre-empt in the demo
  narrative, not a code blocker. The "safer" alternative (human owns UA, agent gets a scoped
  *leash*) is constrained by §4 below.

---

## 3. Mobile surface

### No native / React-Native UA-7702 path is documented — VERIFIED (negative)
- The cloned UA docs reference tree has **only** `ua-reference/web`, `ua-reference/web/transactions`,
  and `ua-reference/apis` — **no mobile / react-native / native subdir**.
  (`find .../universal-accounts/ua-reference -type d`).
- Context7 returns the UA SDK reference exclusively under `ua-reference/**web**` (it labels the
  path `ua-reference/desktop/web`); a direct query for "React Native / native iOS/Android SDK
  for Universal Accounts in 7702 mode" surfaced **no** native/RN UA reference.
- The `universal-account-sdk` is JS/TS. Particle does ship RN/iOS/Android/Flutter SDKs, but
  those are **Auth/Connect/AA**, not the Universal Accounts SDK (per grounding wiki
  `particle-universal-accounts.md` p.109).
- **Conclusion:** there is **no documented native/React-Native UA-7702 path.** RN-via-JS-runtime
  is *feasible* but **(unverified)**; native iOS/Android UA-7702 is **(unverified / undocumented)**.

### A mobile "monitor + push-notify + revoke" app needs NO UA signing on the phone — VERIFIED (architecturally)
- **The agent signs server-side** (the entire §2 path — `new Wallet(PRIVATE_KEY)`,
  `authorizeSync` / `signingKey.sign`, `sendTransaction` — runs in Node). The phone is never
  in the signing path.
- **The phone only needs READ + a control call:**
  - READ state: `ua.getPrimaryAssets()` (unified balance) and the activity explorer URL
    (`https://universalx.app/activity/details?id=${transactionId}`) returned by every
    `sendTransaction` (`web-quickstart.mdx:123-126`, `transfer.mdx:29`). Balances/activity are
    plain reads — no signature.
  - REVOKE: a call to the user's **own backend** endpoint that disables the agent loop /
    pauses or cuts off the server-held agent key. That is an **app-level control action**, not
    an on-chain signature, so it needs **no** EIP-7702 authorization and **no** rootHash signing
    on the phone.
- **Net:** the phone is a **read + control-plane client, not a signer.** The "no UA signing on
  the phone" claim holds. Because there is no documented native UA SDK anyway (above), keeping
  signing off the phone is also the *only* practically clean architecture.
- **Caveat (honest):** a *true on-chain* revocation of the EOA's delegation (re-delegating the
  EOA to a null/empty contract, or rotating the key) would itself require a Type-4 authorization
  signed by the **EOA key**. In Tab+Leash that key lives **server-side**, so "revoke" is
  implemented as the backend disabling/rotating the agent key — again no phone signature. If a
  design ever wanted the *human on the phone* to sign an on-chain revoke, that **would** need a
  7702-capable signer on the device (undocumented for UA → (unverified)).

---

## 4. Session-keys caveat (Biconomy v2.0.0-only) and what it means if judges require the HUMAN to own the UA

### VERIFIED
- **Particle session keys are Biconomy-v2.0.0-only.** "Currently supported only on the
  **Biconomy v2.0.0 smart account implementation**. Other smart account types will throw errors."
  - `Reference/particle-docs-mintlify/aa/guides/keys.mdx:17`.
- Session keys (`createSessions` / `validateSession`, the `sessionValidationModule` contract)
  live in Particle's **AA SDK / AA RPC**, bound to that Biconomy v2.0.0 module
  (`aa/guides/keys.mdx`, `aa/rpc/createsessions.mdx`, `aa/rpc/validatesession.mdx`).

### What it means for "human owns the UA, agent only gets a leash"
- **UA 7702 mode is a different smart-account implementation than Biconomy v2.0.0.** In 7702
  mode the EOA is delegated to **Particle's own Universal Account contract**
  (`initialization.mdx:120-122`, `eip7702-wallets.mdx:7`), **not** a Biconomy v2.0.0 smart
  account. The Biconomy-only session-key module therefore **cannot be attached to a UA** — the
  two stacks don't compose.
- **Consequence:** there is **no native Particle session-key "leash" on a UA.** If judges
  insist the **human owns the UA** and the **agent only gets scoped, revocable authority**,
  Particle gives you **no off-the-shelf way** to do that *on the UA itself*. Options, all with
  costs:
  - **(a) Agent holds the real UA owner key** (the §2 path). Works mechanically, but this is
    "agent **IS** the user," not "human owns, agent leashed" — i.e. it does **not** satisfy a
    human-owns-UA requirement.
  - **(b) Enforce the leash at the app layer** — spend caps / allowlists / rate limits coded
    into the server-side agent loop around the UA calls. The human "owns" by controlling the
    backend that holds the key, and "revokes" by disabling it (the §3 revoke). This is a policy
    leash, not a cryptographic one. (unverified that judges accept an app-layer leash as
    equivalent.)
  - **(c) Use Biconomy v2.0.0 session keys** for a true cryptographic leash — but then you are
    on a Biconomy smart account, **not** the UA, so you lose UA chain-abstraction and likely
    fail the track's "must use the Universal Accounts SDK in 7702 mode" requirement.
  - **(d) Put the cryptographic leash on a different AA stack** (e.g. ZeroDev/Openfort, which
    document 7702 + session keys) — but that is no longer a Particle-UA build.
- **Net:** the Biconomy-only limitation is real and **blocks the clean "human-owned UA +
  agent session-key leash" pattern.** Tab+Leash's leash must be either (a) "agent owns the key"
  (the simplest, but carries the §2 "is the agent the user?" judging risk) or (b) an
  app-enforced policy leash around a server-held key. There is **no** Particle-native session-key
  delegation available on UA 7702.

---

## Summary table

| Claim | Status | Key evidence |
|---|---|---|
| 1. `createTransferTransaction` → external receiver on Arbitrum, sourced cross-chain | **Doc-verified; end-to-end needs live run** | `transfer.mdx`, `web-quickstart.mdx:107-131`, Context7 API doc. Cloned Privy demo does buy/sell only — NOT transfer. |
| 2. Headless raw key drives UA in 7702 (`authorizeSync`/`eip7702Auth`) | **Doc-verified; legit documented signer** | `initialization.mdx:124-162`; live `7702-convert-evm.ts` uses `new Wallet(PRIVATE_KEY)`. Open Q: does "agent = user"? (judging, not technical) |
| 3a. Native / RN UA-7702 path | **Not documented (unverified)** | UA reference tree is web-only; Context7 shows web-only. |
| 3b. Mobile monitor/notify/revoke needs NO UA signing on phone | **Verified architecturally** | Agent signs server-side (§2); phone reads balances/activity + calls a backend revoke. |
| 4. Session keys Biconomy-v2.0.0-only → no native leash on UA | **Verified** | `aa/guides/keys.mdx:17`. UA 7702 ≠ Biconomy v2.0.0, so no session-key leash on UA. |
