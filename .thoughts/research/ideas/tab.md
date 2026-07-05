# Tab — drop-in crypto `<PayButton>`

- **Type:** fresh
- **Geometric mean:** 0.698 (rank #1 of 13 — top of the `viable-risky` band, commit-adjacent, just under the 0.70 commit line)
- **Verdict:** viable-risky
- **Scores:** novelty 0.44 · judgeFit 0.85 · buildability 0.85 · prizeStack 0.90 · wedgeStrength 0.58

## One-liner
A drop-in Stripe-style `<PayButton>` where the buyer logs in with email and Particle UA silently sources liquidity from whatever they hold on ANY chain, settling the merchant's token on Arbitrum — no chain pick, no bridge, no gas, ever.

## Why it wins (anchored to judging weights + prize math)
- **UX axis (40% flagship / 30% Arbitrum) — bullseye.** "No chain name appears anywhere, email code, green check" is exactly the rewarded "make crypto invisible" UX. The buyer sees `Pay $5`; the chain abstraction is the entire product, not a bolt-on.
- **Prominent/innovative UA+7702 use (30%) — load-bearing.** UA in 7702 mode does the real work: it sources buyer liquidity from any chain and settles the merchant token. Magic is the literal 7702 signer (email-OTP), so the 7702 requirement is satisfied by the core flow.
- **Adoption (20%) — strong.** The "npm-install a Stripe button for crypto" narrative is the most credible adoption story in the set and travels well as content (Abu's distribution edge).
- **Prize stack math:** UA flagship 1st **$2,500** + Arbitrum invisible-UX bonus **$2,000** + Magic embedded-wallet bonus **$500** = **$5,000** — the documented best-case ceiling. Cannot also claim Openfort ($100) or ZeroDev ($500): those are General-Track subtracks and you submit to ONE main track. All three map cleanly and non-cosmetically.
- **Hard-constraint check:** PASSES. Web + thin server only; NO native mobile, NO extension-7702. The candidate cleverly turns the "extension-can't-sign-7702" constraint INTO the product by using Magic email as the signer.

## The wedge
**Invisible SOURCE.** The developer drops in one button; the buyer's funds can live on ANY chain and still settle the merchant's exact token on Arbitrum. Demo wedge is sharp and screenshot-perfect: ETH-on-Base buyer, USDC-on-Arbitrum merchant, modal just says "Pay $5."

**Honest defensibility caveat:** this is moderate, not strong. Particle's own Universal Deposit SDK + UniversalX already do embeddable chain-abstracted flows, and "pay any token, any chain, gasless" is ZiPay's exact tagline. The corpus is saturated with this genre (ZiPay, UWAPI, SuiPort, AuthenPay, All0x; plus Stripe/Transak/Privy in-market). Novelty 0.44 is the floor and the candidate's own #1 risk — this is a fresh-ecosystem PORT of a well-worn idea, and "is it just a payment widget?" is the correct worry.

## Surfaces
- Web: merchant integration snippet + buyer pay modal.
- Thin server: settlement orchestration / receipt.
- Signer: Magic embedded wallet (email-OTP) as the 7702 signer.
- Explicitly NOT building: native mobile, browser-extension 7702 (the constraint that this idea routes around).

## Single riskiest assumption
That a single Particle-UA 7702 cross-chain op can land the EXACT merchant token (USDC) at the EXACT merchant address on Arbitrum, sourced from buyer assets held only on a different chain, in one signed flow reliably enough to screen-record — AND that Particle's in-progress V2 account migration won't break it live.

The subtle technical leg: `createBuyTransaction` buys INTO the UA, but merchant payout actually requires `createTransferTransaction(receiver=merchant)` or `createUniversalTransaction`. So "merchant settlement works end-to-end" (not just a swap into your own account) is the unproven part.

## <=2h Riskiest-Assumption Test
Clone the documented `Particle-Network/ua-7702-magic-demo`, swap the action for ONE `createTransferTransaction({ token:{ chainId: ARBITRUM_MAINNET_ONE, address: USDC }, amount:"1", receiver:<merchant test addr> })` from a UA whose primary assets are funded ONLY on Base (zero Arbitrum balance), sign via Magic email-OTP, and confirm on Arbiscan that the **merchant address** received USDC on Arbitrum. If that one transfer lands (and V2 migration doesn't block it), the whole product's core is proven and the rest is UI. Verify UA account-version/V2-migration state in the same spike (live withdraw-funds warning on docs).

## Build guidance
- Over-invest in the differentiator beyond a plain widget, or this loses the flagship as a polished commodity. Lean HARD on the invisible-SOURCE framing.
- Consider grafting the **AI-receipt / agent-payable** angle (a server-key payer that can hit the same `<PayButton>` headlessly) to escape the "seen-it crypto-Stripe" pattern-match and pull in Abu's "crypto invisible to AI agents too" lens. This is the cheap novelty injection.
- Note the Magic $500 bonus rewards CREATIVE onboarding; plain email-OTP is table-stakes (good for "real not cosmetic," weak for "creative"). It still qualifies as the load-bearing signer.

## Scope principle
The submission deadline is not a factor in scope or quality (per Abu) — build the right product; prioritize by product/demo merit, not time. Build Tab's core properly; scope additional surfaces based on whether they strengthen the demo, not on any time window.
