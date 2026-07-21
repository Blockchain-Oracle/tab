# Story: The qualifying human cross-chain op (flagship RAT)

> Traces to: R-TAB-5, R-TAB-7; AC-TAB-2, AC-TAB-5; Constraint 4 (live spike). Spec: .thoughts/specs/2026-07-02-tab-leash.md

As a buyer whose Magic-email EOA is the human flagship proof,
I want to execute a Particle UA-7702 `createTransferTransaction` from my assets on a non-Arbitrum chain to a third-party merchant address on Arbitrum One,
so that the resulting `transactionId` and Arbiscan-confirmed settlement demonstrate the cross-chain value move required for the Particle Network flagship track.

---

## Acceptance Criteria

- **[R-TAB-5 / AC-TAB-5a]** The Particle UA is initialized with the nested `smartAccountOptions: { useEIP7702: true }` form — not the flat quickstart shape. The `ownerAddress` field is set to the buyer's Magic-email EOA public address (the address returned by `magic.user.getInfo()`).

- **[R-TAB-5]** `UNIVERSAL_ACCOUNT_VERSION` is imported and used verbatim in the UA init; the account version matches the live Particle V2 environment at spike time.

- **[R-TAB-7]** `createTransferTransaction` is called with `receiver` set to a third-party merchant address (not the buyer's own UA), `token.chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE` (42161), and the payment `amount`. The call returns a `{ rootHash, userOps }` transaction object.

- **[R-TAB-7 / AC-TAB-5b]** `sendTransaction` is called with three arguments: the transaction object, the `rootHash` signature (from `personal_sign`), and an `authorizations` array built from each `userOp.eip7702Auth` in `tx.userOps` that has not yet been delegated on the source chain, de-duped by nonce.

- **[AC-TAB-2]** The buyer's source funds reside only on a chain other than Arbitrum One (e.g., ETH on Base, USDC on Polygon). The buyer holds zero balance of the settlement token on Arbitrum One at the moment `createTransferTransaction` is called.

- **[AC-TAB-2]** `sendTransaction` returns a `TransactionResult` whose `tokenChanges` field shows the merchant's Arbitrum One address receiving the payment amount. The buyer's non-Arbitrum balance decreases by the corresponding amount.

- **[AC-TAB-5c]** The transaction record at `universalx.app/activity/details?id=<transactionId>` is reachable immediately after `sendTransaction` resolves and shows a successful cross-chain transfer originating from the buyer's Magic-email EOA address.

- **[Constraint 4]** The spike is executed with a real, funded Particle project (`projectId`, `projectClientKey`, `projectAppUuid`) and a real Magic embedded wallet session — not a mock, stub, or hardcoded key. The merchant receiver address is a real EOA distinct from the buyer.

- **[Constraint 4]** Arbiscan (`arbiscan.io`) confirms a token credit to the merchant address on Arbitrum One that corresponds to the `transactionId` returned by `sendTransaction`.

---

## Scenarios

### Scenario 1 — Happy path: cross-chain settlement from a non-Arbitrum source

```
Given the buyer has authenticated via Magic email OTP and `magic.user.getInfo()` has returned a public EOA address
And that EOA holds a funded balance only on a non-Arbitrum chain (e.g., Base), with zero settlement-token balance on Arbitrum One
And a Particle UniversalAccount is constructed with `smartAccountOptions: { useEIP7702: true, ownerAddress: publicAddress, name: "UNIVERSAL", version: UNIVERSAL_ACCOUNT_VERSION }` (no `tradeConfig.universalGas` — removed in UA SDK V2; see Constraint 14)

When `ua.createTransferTransaction({ token: { chainId: 42161, address: TOKEN }, amount, receiver: MERCHANT })` is called
And the returned `tx.userOps` are iterated to collect each `userOp.eip7702Auth` not yet delegated, de-duped by nonce, into an `authorizations` array
And the `tx.rootHash` is signed via `personal_sign` to produce `rootHashSignature`
And `ua.sendTransaction(tx, rootHashSignature, authorizations)` is called

Then `sendTransaction` returns a `TransactionResult` with a non-null `transactionId`
And `transactionResult.tokenChanges` reflects a credit to the merchant address on Arbitrum One equal to `amount`
And the transaction record at `universalx.app/activity/details?id=<transactionId>` shows a completed cross-chain transfer sourced from the buyer's EOA
And Arbiscan confirms a token credit to the merchant address on Arbitrum One matching the `transactionId`
```

### Scenario 2 — Edge case: `authorizations` array omitted on an undelegated chain

```
Given the buyer's EOA has not previously delegated to the Particle UA contract on the source chain (undelegated state)
And `createTransferTransaction` has returned a transaction object with non-empty `userOps`

When `ua.sendTransaction(tx, rootHashSignature)` is called with only two arguments (no `authorizations` array)

Then the call fails before submission
And no funds leave the buyer's account
And the error indicates missing or invalid authorization (consistent with R-TAB-7 gotcha: "omitting it on an undelegated chain fails")
```

### Scenario 3 — Edge case: buyer's non-Arbitrum balance is insufficient for the payment amount

```
Given the buyer's funded non-Arbitrum balance is less than the requested payment amount
And the buyer holds zero settlement-token on Arbitrum One

When `ua.createTransferTransaction` is called with `amount` exceeding the buyer's available unified balance

Then the call returns an error or an insufficient-funds response before a `userOps` array is produced
And `sendTransaction` is not reached
And no authorization is submitted to any chain
```

---

## Notes

- **This story is the gating live spike (Constraint 4).** `createTransferTransaction(receiver=merchant)` to an external Arbitrum address, sourced cross-chain, is confirmed in the Particle API docs (transfer.mdx, web-quickstart.mdx) but has not been executed live in any cloned demo as of spec date. No assertion in this story is verifiable until the spike runs with real funded keys. The story defines what "pass" looks like; executing it is the prerequisite for demo recording.

- **The nested init form is mandatory for judge-proofing (R-TAB-5).** The flat quickstart init shape does not expose `useEIP7702` at the top level; only the nested `smartAccountOptions` form constitutes auditable evidence of 7702 mode for judges.

- **The `authorizations` array is the 3rd argument, not optional (R-TAB-7).** On a chain where the UA has not previously delegated, omitting it causes the transaction to fail. Scenario 2 captures this failure mode.

- **The buyer holds zero Arbitrum balance — this is required, not incidental (AC-TAB-2).** A buyer who happens to hold Arbitrum funds does not prove cross-chain abstraction. The spike must use a source-chain-only-funded EOA.

- **Flagship eligibility rests on the HUMAN's UA (Constraint 5, not in this story's trace set but shapes scope).** The story is scoped to the human buyer's Magic-email EOA. Whether a server-held agent key qualifies as "the user's EOA" for the flagship track is an open organizer-interpretation question and is not addressed here.

- **No buyer-facing UX in scope.** This story is the underlying cryptographic and settlement proof — the gating behavior that makes Stories 2, 5, and the flagship prize submission credible. Buyer-visible UI (button states, vocabulary, success animation) is Story 2.

- **UA V2 migration is time-sensitive.** `UNIVERSAL_ACCOUNT_VERSION` must be verified against the live Particle environment at spike time. Users may need to withdraw from old accounts before the spike can execute.

---

## Open Questions

1. **Token address on Arbitrum One (OQ-4 from spec).** The Particle quickstart snippet uses USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`) on Arbitrum; the product description says USDC. The `TOKEN` address in `createTransferTransaction` must be confirmed against live Particle UA liquidity availability before the spike runs. The wrong address will silently produce a zero-liquidity failure.

2. **Does `createTransferTransaction(receiver=merchant)` actually work cross-chain, live (OQ-5 from spec / Constraint 4)?** This is doc-proven but unverified in any cloned demo. The spike result itself answers this question. If the call fails (e.g., external-receiver cross-chain settlement is blocked by a Particle SDK restriction not documented), the entire Tab human-payment story is blocked and the flagship track claim cannot be made.
