# Hackathon Overview

> Source: `instuctions.md` (the pasted brief). See [raw sources](../../raw/sources.md).

## What it is
A Web3 hackathon run primarily by **Particle Network**, with partner bounties from
**Arbitrum** and **Magic Labs**, and General-Track subtracks from **Openfort** and
**ZeroDev**. The **7702 Collective** is a partner/community backer.

## The single thesis tying every sponsor together
**Make crypto invisible to the user.** Every sponsor sells some flavor of "the user
should never think about wallets, gas, bridges, or which chain they're on":
- Particle → chain abstraction + EIP-7702 (one login, one balance, any chain).
- Arbitrum → consumer apps where the L2 is invisible backend settlement.
- Magic → email/Google login wallets (no MetaMask install).
- Openfort / ZeroDev → smart-account / account-abstraction onboarding.

Judges reward the app a non-crypto person could use without knowing crypto is underneath.

## Key terms (defined once)
- **EOA** (Externally Owned Account): a normal key-controlled wallet (e.g. MetaMask). "Dumb" — runs no custom logic.
- **Smart account**: a programmable wallet (batching, gas in any token, etc.). Historically required deploying a new account + migrating.
- **EIP-7702**: lets a normal EOA *temporarily act as a smart account in place* — no new address, no migration. The hackathon's headline trick.
- **Chain abstraction (CHA)**: hiding the multi-chain mess so the user sees one balance / one account across chains.
- **Account abstraction (ERC-4337)**: the prior-generation standard for smart-contract wallets; background context for 7702.

## Related pages
- [Tracks & prizes](tracks-and-prizes.md)
- [Judging criteria](judging-criteria.md)
- [Rules & deliverables](rules-and-deliverables.md)
- Concepts: [EIP-7702](../concepts/eip-7702.md), [chain abstraction](../concepts/chain-abstraction.md), [agent wallets](../concepts/agent-wallets.md)
