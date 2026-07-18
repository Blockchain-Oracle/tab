# Designer Brief: Tab Product Experience Rebuild

## Purpose

Rebuild Tab as a premium, coherent payment product rather than a set of technically complete screens. The design must make one idea instantly legible:

> One balance supports a human who pays by email and an AI agent that pays its own x402 bills under an owner-controlled leash.

The prototype must teach that idea, make every payment consequence trustworthy, and give builders a handback they can implement without inventing screens or states.

### Demo script that drives the design

1. **A stranger understands Tab.** The landing experience traces an email checkout and an agent payment along one visual rail. The audience understands Magic holds/signs, Particle moves human liquidity across chains, and x402 handles agent-to-API settlement.
2. **A human pays without crypto ceremony.** The buyer opens the merchant's PayButton, restores or completes branded Magic email login, sees a real unified balance, confirms the exact consequence, watches real execution stages, and receives authoritative evidence.
3. **An agent pays only after policy.** A genuine 402 encounters status, cap, key, float, and signer gates before Magic signs. The facilitator settles Circle USDC on Base Sepolia, the resource retries, and the receipt independently verifies the result.
4. **The owner remains in control.** A cap-exceeded or paused/nuked agent produces no signature and no transfer. The owner can see and invoke the same emergency controls from the PWA.
5. **The infrastructure story closes.** A later, separately funded Particle mainnet proof moves and rebalances real liquidity; it is never confused with the Base Sepolia x402 flow.

## Prototype Scope

Produce a responsive, high-fidelity family covering:

- Marketing landing desktop and mobile.
- Merchant/Leash authentication and workspace entry.
- Merchant onboarding, overview, integration, payments, webhooks, appearance, and test workspace.
- Buyer checkout across all states.
- Leash onboarding, overview, activity/receipt, policy, funds/Test Lab, connect, notifications, and emergency controls.
- Mobile overview, feed, receipt, notifications, and controls.
- Documentation home and representative SDK/API/Leash pages.

The complete screen/state/data contract lives in `2026-07-18-tab-product-experience-surface-map.md` and must be treated as the inventory source of truth.

### Handback contract

The design toolchain is Codex plus image generation for mood/composition previews, followed by code-native responsive prototypes. Hand back:

1. Three reviewed concept boards: landing, checkout state strip, and product-control-plane family.
2. Desktop, tablet, and mobile layouts for every demo-critical moment.
3. A state matrix showing loading, empty, error, success, disabled/unavailable, test, live, and product-specific variants.
4. A motion storyboard that names the real event driving every transition and the reduced-motion replacement.
5. An official-asset manifest for Tab, Base, Arbitrum, Circle, Particle, and Magic marks.
6. A prototype/reintegration ledger classifying every value and action as illustrative, real API/DB/chain, test simulation, blocked, or deferred.
7. Implementable tokens and component behavior—not raster screenshots used as production UI.

## Product Context

Tab has two deliberately different payment paths:

### Human checkout

```text
Buyer email → Magic EOA/session → Particle EIP-7702 Universal Account
→ unified balance → Magic authorization → Particle transaction → merchant
```

The Magic EOA and Particle Universal Account share one address in EIP-7702 mode. The buyer should experience this as a Tab balance, not a chain-management exercise.

### Leash/x402 agent payment

```text
Paid API returns 402 → Leash checks status/cap/key/exact-chain float
→ Magic Express signs Circle USDC authorization → x402 facilitator settles
→ protected API retries → server independently verifies → receipt/notification
```

Particle is intentionally absent from this hot path. It later rebalances pre-positioned Base/Arbitrum floats asynchronously.

### Current truth the design must respect

- Merchant and Leash APIs/ledgers already exist and must remain real-data-first.
- The public landing is currently a scaffold and needs the most foundational redesign.
- Checkout has a complete state machine but basic visual treatment.
- Phase 9 mobile is unfinished and must be completed, not discarded.
- Magic Express provisioning/signing and both funded money proofs retain honest blockers until live evidence exists.
- Base Sepolia uses test Circle USDC and must say `Test funds — not real money`.
- Installed Particle 2.0.3 supports the required proof on mainnet, not Base Sepolia.

## Target Users

### Buyer

Wants to pay a trusted merchant quickly using email and an available balance. They should not need to understand wallets, EIP-7702, bridges, or CAIP identifiers.

### Merchant/developer

Wants a polished PayButton, clear integration progress, reliable webhooks, inspectable payments, and an explicit path from test to live.

### Agent owner

Wants autonomous payment with a hard spending boundary, exact evidence, notifications, and a dependable kill switch.

### Judge/technical evaluator

Wants to distinguish real integration from presentation, see sponsor technologies used for the right job, and verify on-chain/database/CLI evidence without digging through code.

## Domain Knowledge The Designer Needs

- `Test` and `live` are financial safety modes, not color themes.
- Base, Base Sepolia, and Arbitrum must use official marks plus full names; abbreviations alone are insufficient.
- Circle USDC has six decimals. Base Sepolia USDC is a normal ERC-20 and needs no Stellar-style trustline.
- Native Base Sepolia ETH is separate from USDC and does not block facilitator-submitted x402 settlement.
- A Leash payment has independent axes: challenge, policy, signature, facilitator, settlement, protected delivery, and verification.
- A buyer transaction enters submitted success immediately after Particle returns a real `transactionId`; settlement verification remains a distinct continuing axis and cannot be presented as complete before independent verification.
- Emergency controls have four consequences: Pause, Freeze, Cancel, and Nuclear. Freeze blocks signing while leaving the credential untouched; Cancel revokes the signer subject and keys.
- Ordinary logout preserves Magic device login by clearing only Tab's session.

## Core User Journey

### Marketing to product

The hero presents the product thesis and the actual two-path Flowline before marketing claims. A visitor follows either `Build with Tab` or `Set up Leash`, restores/signs in with Magic, and lands on the first incomplete real task.

### Merchant

Identity → appearance → API key → webhook → merchant-owned test workspace → persisted test payment and delivery → go-live readiness. The user may leave and resume at any point.

### Buyer

Intent loading → branded identity → OTP/restored session → balance read → exact confirmation → real progress → transaction-ID-backed submitted success → continuing verification → verified/settled evidence or specific recovery.

### Leash owner

Provision → cap/emergency policy → Test Lab → connect packed CLI/MCP → first paid request → receipt → notification/mobile control.

## Screen-by-screen Direction

### Landing

Lead with the Flowline, not a dashboard screenshot or floating crypto tokens. It begins as one line entering Tab, branches into `Human checkout` and `Leash / x402`, then resolves into evidence. Vary section proportions; avoid a repeated card grid.

### Auth and onboarding

Tab and merchant/agent identity stay visible. Loading explains the current operation. OTP paste/resend/recovery must feel first-class. Onboarding is a task journey, not a carousel or forced tutorial.

### Checkout

The merchant identity, amount, test/live mode, and current real stage always remain oriented. The most expressive motion belongs to Particle returning a real transaction ID and the transition into submitted success; a quieter evidence axis continues through independent verification. The error state must state whether funds may have moved and whether retry is safe.

### Merchant product

Treat integration as an observable path from code to real evidence. Prefer one strong page hierarchy, tables/rails where the data is relational, and contextual actions over interchangeable cards.

### Leash

Make “policy before signature” the organizing visual truth. Gate states should converge into the Flowline evidence rail; a blocked gate visibly terminates it before signature. Receipt evidence should be dense but scannable.

### Mobile

Design for monitoring and emergency action, not compressed desktop administration. Critical status and control remain reachable with one thumb; destructive actions require explicit consequence and independent confirmation.

### Docs

Use the same identity more quietly. Code and evidence are primary content; explanations should teach why the two payment paths differ. Avoid a stock documentation theme that disconnects from the product.

## Data, States, And Mocking Rules

- Use only the prototype-only sample values defined in the surface map, with an obvious prototype label in presentation/review artifacts.
- Never invent volume, customer, success-rate, balance, transaction, or sponsor claim.
- Represent real integrations accurately even when the design prototype cannot call them.
- Every money/action state must be mapped during prototype reintegration as real MVP, visibly simulated test-only, deferred, or blocked.
- Do not design a fake optimistic `settled` state. A real-`transactionId` submitted-success state is evidentiary and is not a settled or confirmed claim. Optimistic UI is otherwise acceptable only for reversible non-money preferences.
- Every loading state must preserve final geometry and announce the operation; every empty/error state must contain a real next action.

## Prototype Quality Bar

- The landing should be recognizable as Tab without its logo.
- Checkout must feel credible beside best-in-class payment products while remaining uniquely tied to Tab's two-payer system.
- Motion communicates route, gate, and verification; it never exists solely to make the page “feel alive.”
- Dense evidence uses hierarchy, alignment, full network names, and tabular data rather than tiny low-contrast copy.
- Desktop and mobile are designed intentionally, not scaled versions of one another.
- Keyboard focus, zoom, touch targets, contrast, live regions, and reduced motion are part of the visual specification.

## Anti-slop Risks To Avoid

- Generic SaaS hero with headline, gradient orb, three equal cards, logos, and fake metrics.
- Dark “Web3 dashboard” with neon token coins, glowing chain lines, and unexplained abbreviations.
- Nested cards and badges used in place of information hierarchy.
- Decorative network logos that imply a route the product does not support.
- Time-based progress that outruns the real payment.
- A Stripe clone: learn from Stripe's hierarchy, but do not copy its blue-white hosted-checkout composition.
- A Linear clone: learn from its restraint and speed, but do not reproduce monochrome chrome or generic command-menu aesthetics.

## Interaction Opportunities

- One-shot landing Flowline that can be replayed and becomes static under reduced motion.
- Shared-layout transition from PayButton amount into checkout header.
- Flowline evidence rail whose gate ticks resolve from source events.
- Copy controls with immediate, labeled confirmation.
- QR/address funding sheet with automatic balance recheck.
- Before/after-signature visual distinction in Leash.
- Mobile emergency confirmation that shows the independently refreshed server result.

## Inspiration And Source Material

- Stripe Checkout: amount/merchant hierarchy and comprehensive payment-state anatomy.
- Linear: motion restraint, density, and interaction speed—not visual imitation.
- Vercel Geist guidance: skeleton/empty/error separation and stable layout.
- Monad repository: typed network identity and evidence-axis thinking, not proof of a completed browser payment.
- Stellar wallet repository: readiness-before-mutation and separate asset-leg states; do not copy trustlines, funding races, or onboarding carousel/audio.
- Official Base, Arbitrum, Circle, Particle, and Magic brand assets for marks only.
- Existing Tab wiki, spec, stories, build plan, quality profile, and prototype reintegration matrix remain authoritative for behavior.

## Creative Freedom

The approved direction is a **financial atelier**, not a fixed comp. It supersedes the earlier cool kinetic-ledger concept:

- Typography is Instrument Sans for product UI, Instrument Serif sparingly for marketing emphasis, and Geist Mono for code, addresses, amounts, policy, and evidence.
- The light palette is warm paper `#F4F0E7`, surface `#FFFCF7`, ink `#15130F`, muted `#6C665C`, cobalt `#3157E8`, emerald `#1F7A4D`, testnet amber `#9A6400`, danger `#B83F4A`, and line `#DDD6C8`.
- Dark mode uses ink surfaces and warm-white text. Chain brand colors appear only inside official marks and network badges.
- The Flowline is the one signature element. On landing it branches into human checkout and Leash/x402; in checkout it advances only on real events; in Leash it becomes the evidence rail.
- Hero choreography runs once and settles. Reduced motion replaces travel, parallax, and line drawing with static or opacity-only changes without changing meaning.
- Responsive composition, spacing rhythm, line geometry, and easing may be refined during the three checkpoint reviews; the palette and type roles are locked.
- Spend visual boldness on the Flowline and restrained serif emphasis; keep product surfaces quiet, tactile, and information-led.
- Do not use generic glassmorphism, walls of interchangeable cards, decorative gradients everywhere, fake charts, or unexplained crypto abbreviations.

## Explicit Non-goals

- No LLM/model picker in Leash.
- No Polygon, Particle testnet claim, session keys, or bridge-in-the-hot-path design.
- No injected-wallet/EIP-7702 flow; Magic is the wallet provider.
- No production database/API/auth/wallet implementation inside raster prototypes.
- No mainnet faucet.
- No redesign that hides real blockers to make a cleaner demo.
- No sound, autoplay carousel, perpetual ambient animation, or on-device mobile signing.

## Open Questions

There are no open design decisions. Magic trust, Circle faucet API access, final DNS, and Particle funding are external implementation inputs whose unavailable states must appear exactly as specified.
