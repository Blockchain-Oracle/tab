# Tab Official Asset Manifest

Every brand mark shipped by `@tab/ui`, its source, and its usage rules.
Chain/partner brand colors appear ONLY inside these official marks — never as
Tab UI colors (see `src/tokens.ts`).

| Mark | Component | Source | License/terms | Usage |
| --- | --- | --- | --- | --- |
| Tab tally | `TabMark` (`src/assets/tab-mark.tsx`) | Original, this repo | Ours | Brand mark everywhere; `currentColor` so it follows theme ink. Favicon variants in `apps/*/app/icon.svg`. |
| Base "The Square" | `BaseMark` (`src/assets/marks.tsx`) | `github.com/base/brand-kit` → `logo/TheSquare/Digital/Base_square_blue.svg` (fill `#0000FF`) | Base brand kit terms — unmodified mark | Network identity for Base (8453) and Base Sepolia (84532; always paired with the test-funds badge, never as its own logo). |
| Arbitrum One | `ArbitrumMark` (`src/assets/marks.tsx`) | Official Arbitrum docs repo (`Reference/arbitrum-docs/static/img/logo.svg`, OffchainLabs) | Arbitrum brand terms — unmodified mark | Network identity for Arbitrum One (42161). |
| USDC | `UsdcMark` (`src/assets/marks.tsx`) | `spothq/cryptocurrency-icons` reproduction of Circle's USDC token mark (`#3E73C4`) | CC0 icon set; USDC mark is Circle's | Asset identity for USDC balances/amounts. |
| Magic wordmark | not embedded — `apps/site/public/marks/magic.svg` | Official `magiclabs/magic-js` README logo (`media.graphassets.com/T9TXZhcNRVm211eyMh3u`; purple `#6851FF`). NOTE: the Mintlify-hosted `magiclabs/logo/*.svg` files are the "Mint Starter Kit" template logo — NOT Magic's mark; never use them. | Magic brand — unmodified wordmark | Ecosystem/partner rail on marketing + docs only. |
| Particle Network | not embedded — `apps/site/public/marks/particle.png` | `particle.network/logo.png` (official site wordmark; white monochrome). NOTE: the SVGs vendored in `Reference/particle-docs-mintlify/logo/` are byte-identical to Magic's Mintlify logos — a template artifact, NOT Particle's mark; never use them. | Particle brand — unmodified; CSS `invert(1)` on light backgrounds (monochrome wordmark) | Ecosystem/partner rail on marketing + docs only. |
| x402 wordmark | not embedded — vendored | `Reference/x402-coinbase/typescript/site/app/assets/x402_wordmark_{light,dark}.svg` | x402 project assets | Protocol mention on marketing + docs. |

Rules:

1. Never recolor, skew, or restyle an official mark; scale uniformly only.
2. Base Sepolia is Base's mark + the `Sandbox funds — no real value` badge — a
   testnet is not a separate brand.
3. Chains are always identified by mark + full display name (+ CAIP-2 in
   evidence contexts) — never initials alone.
4. Partner wordmarks (Magic, Particle, x402) belong to marketing/docs
   ecosystem sections, not product chrome.
