# Raw Sources Ledger

Immutable index of every source feeding the domain wiki. Wiki pages cite back to
entries here. Do not edit URLs to "fix" them — if a source moves, add a new entry.

## Primary brief
- `instuctions.md` (project root) — the hackathon brief as pasted by the user.
  This is the source of truth for tracks, prizes, rules, and judging.

## Particle Network (headline sponsor)
- Site: https://particle.network/
- Dev docs intro: https://developers.particle.network/intro/introduction
- Dev docs home: https://developers.particle.network/
- Universal Accounts overview: https://developers.particle.network/universal-accounts/cha/overview
- Universal Accounts web quickstart: https://developers.particle.network/universal-accounts/cha/web-quickstart
- GitHub org: https://github.com/Particle-Network

## 7702 Collective
- Site: https://7702collective.com/

## ZeroDev (General Track — Subtrack 2, $500)
- Site: https://zerodev.app/
- Docs: https://docs.zerodev.app/
- Docs repo (open source, cloneable): https://github.com/zerodevapp/docs.git

## Openfort (General Track — Subtrack 1, $100)
- Site: https://www.openfort.io/
- Docs: https://www.openfort.io/docs/overview
- GitHub org: https://github.com/openfort-xyz

## Magic Labs (Bonus, $500)
- Site: https://magic.link/
- Docs home: https://docs.magic.link/home/welcome
- Server wallets: https://docs.magic.link/server-wallets/introduction
- UOA (Unified Orchestration Accounts — per Magic's own docs; the brief's "Universal/Onchain Accounts" label is wrong): https://docs.magic.link/uoa/overview
- Recipe — Alchemy smart wallets: https://docs.magic.link/recipes/server-wallets/alchemy-smart-wallets
- AI-assisted docs / LLM support: https://docs.magic.link/home/ai-assisted-docs
- GitHub org: https://github.com/orgs/magiclabs/repositories

## Arbitrum (Bonus, $2,000)
- Site: https://arbitrum.io/
- Developer docs: https://docs.arbitrum.io/
- Public chains (One/Nova/testnets): https://docs.arbitrum.io/build-decentralized-apps/public-chains
- Solidity quickstart (deploy + network params): https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix
- Gas estimation (two-component model): https://docs.arbitrum.io/arbitrum-essentials/how-to-estimate-gas
- ArbOS 40 Callisto (EIP-7702 live): https://docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos40
- Orbit / Arbitrum chains: https://docs.arbitrum.io/launch-arbitrum-chain/overview/introduction
- Docs repo (cloned shallow): https://github.com/OffchainLabs/arbitrum-docs.git → Reference/arbitrum-docs/ @ 1437c8e
- Context7 library id: /offchainlabs/arbitrum-docs

## Standards / concepts
- EIP-7702: https://eips.ethereum.org/EIPS/eip-7702
- ERC-4337 (account abstraction): https://eips.ethereum.org/EIPS/eip-4337

## Cloned repos (in `Reference/`)
- `particle-docs-mintlify/` — github.com/Particle-Network/particle-docs-mintlify @ `360327a` (370 files) — Particle dev docs incl. Universal Accounts + EIP-7702.
- `particle-universal-accounts-7702/` — github.com/Particle-Network/universal-accounts-7702 @ `69df80e` (71 files) — official Privy + UA 7702 Next.js demo.
- `magic-docs/` — github.com/magiclabs/magic-mintlify-docs @ `7b38a09` (209 files) — sparse (server-wallets, recipes, uoa, embedded-wallets).
- `openfort-docs/` — github.com/openfort-xyz docs @ `b3618ac` (1080 files).
- `arbitrum-docs/` — github.com/OffchainLabs/arbitrum-docs @ `1437c8e` (858 files).
- **`zerodev-docs/` — NOT cloned.** GitHub bulk fetch (shallow clone, tarball, and blobless clone all) was throttled/wedged in this environment. ZeroDev content in the wiki is sourced from **live docs.zerodev.app + Context7 `/websites/zerodev_app`** instead. Retry later with `Reference/RETRY-zerodev-clone.sh`.
