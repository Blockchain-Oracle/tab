# Handoff: Tab Product Experience Rebuild → Claude Code

## Objective

Take over the complete Tab product-experience rebuild and the unfinished real-integration lane without losing the existing merchant, checkout, Leash, mobile, or live-spike work. The latest landing implementation is **not approved** by Abu. Treat it as an uncommitted exploration, not as visual law or a completed R2 checkpoint.

Tab's product thesis remains: **“Invisible payments — for you, and for your AI.”** People check out by email; AI agents pay x402 resources only after owner-controlled policy gates. No judged path may fabricate a balance, signature, facilitator result, transaction hash, settlement, receipt, or transfer.

## Current State

- Repository: `/Users/abu/dev/hackathon/uxmax`
- Branch: `codex/tab-experience-rebuild`
- Pushed HEAD: `0a24a8d` (`origin/codex/tab-experience-rebuild` matches it)
- Last pushed CI is green: <https://github.com/Blockchain-Oracle/tab/actions/runs/29657915492>
- Implementation has stopped. No localhost server is intentionally running.
- The worktree is deliberately dirty. Never run `git add .`, broad restore, reset, stash, or cleanup.
- The remote branch contains the committed R0/R1 foundation through `0a24a8d`; the current `apps/site`, Playwright harness, CI addition, and related dependency/config changes are still uncommitted and local.

Experience-program position:

- R0 artifacts/checkpoints exist, but the workflow checkboxes were not maintained as a trustworthy status ledger.
- R1 foundations are substantially committed: canonical networks, financial-atelier tokens, accessible UI primitives, caller-driven StageFlowline, and risk-based UI-testing policy.
- R2 is incomplete. `apps/site` exists locally, `apps/docs` does not. Abu rejected the present landing execution.
- R3–R7 and R9 have not been completed under the rebuild program. Existing pre-rebuild API/PostgreSQL functionality remains the foundation and must be refactored, not replaced blindly.
- R8/live integration remains incomplete: no claimed real Magic-provisioned/signed Base Sepolia x402 settlement; Particle's separate Base-mainnet proof still needs approximately 20 real USDC at `0x895792c87f4A3D0aAFf9604CEab10169F3194Cc0`.
- Existing Phase 9 mobile work is paused and must be preserved.

Abu's latest UI verdict:

- The current landing background/color treatment and overall composition are not good enough.
- The motion felt amateur rather than like intentional motion graphics.
- He expects the local frontend/website-development skills to be used.
- Use Playwright for browser work; do not rely on Computer Use.
- Keep explicit light/dark control, but do not mistake its existence for visual approval.
- He wants to review the running product himself at localhost during future iterations.
- UI testing is risk-based: protect truthful/payment/accessibility boundaries, not every CSS atom.

## Key Decisions

- Read [`AGENTS.md`](../../AGENTS.md) first. Its wiki-first, real-integration, file-size, Magic persistence, and no-shipping-mock rules are binding.
- The canonical build plan remains authoritative. The experience rebuild is additive; see the rebuild plan assumptions at [`2026-07-18-tab-product-experience-rebuild.md:15`](../plans/2026-07-18-tab-product-experience-rebuild.md#assumptions).
- The current visual reference is [`landing-financial-atelier.png`](../design/checkpoints/2026-07-18/landing-financial-atelier.png), but do not assume that matching its geometry alone will satisfy Abu. Start with a browser walkthrough and a fresh design judgment.
- The site should default to explicit light on first visit and persist the user's light/dark choice. System preference must not unexpectedly force first-visit dark mode.
- Flowline is product anatomy, not fake transaction progress. Public terminal states stay neutral until real evidence exists. Reduced motion is static; motion runs once and does not replay on theme change.
- Ordinary Tab sign-out clears only Tab session state. Never call `magic.user.logout()` for ordinary sign-out.
- Mainnet never falls back to testnet. Base Sepolia must always say “Test funds — not real money.”
- Particle Universal Account SDK 2.0.3 is mainnet-only. Do not claim Particle testnet UA support.
- Use Context7 for current library/framework/SDK/API/CLI documentation. It was working again during the latest session.

## Artifacts

Read in this order:

1. [`AGENTS.md`](../../AGENTS.md)
2. Canonical plan and realness contract: [`2026-07-06-tab-build-plan.md`](../plans/2026-07-06-tab-build-plan.md), especially Phase 0 at line 99, Phase 9 at line 717, verification at line 912, and handoff notes at line 964.
3. Authoritative decisions: [`DECISIONS.md`](../decisions/DECISIONS.md)
4. Canonical Leash spec: [`2026-07-02-tab-leash.md`](../specs/2026-07-02-tab-leash.md)
5. Prototype-to-reality/no-shipping-mock matrix: [`2026-07-06-tab-v1.md`](../prototype-reintegration/2026-07-06-tab-v1.md), especially the screen matrix at line 27 and no-shipping-mock decisions at line 215.
6. Quality profile: [`2026-07-02-project-quality-profile.md`](../quality/2026-07-02-project-quality-profile.md), especially required checks at line 85 and file-size policy at line 143.
7. Additive experience plan: [`2026-07-18-tab-product-experience-rebuild.md`](../plans/2026-07-18-tab-product-experience-rebuild.md): R1 line 81, R2 line 119, R7 line 301, R8 line 338, R9 line 382, verification line 437.
8. Executable workflow: [`2026-07-18-tab-product-experience-rebuild-workflow.md`](../../docs/plans/2026-07-18-tab-product-experience-rebuild-workflow.md). Risk-based testing contract is lines 13–18; current site/browser work is Steps 17–20 around lines 178–225; docs begins at Step 21.
9. Product surface map: [`2026-07-18-tab-product-experience-surface-map.md`](../design/2026-07-18-tab-product-experience-surface-map.md)
10. Designer brief: [`2026-07-18-tab-product-experience-designer-brief.md`](../design/2026-07-18-tab-product-experience-designer-brief.md), especially landing direction at line 127, quality bar at line 164, and anti-slop risks at line 173.
11. Baseline and checkpoint reintegration:
    - [`2026-07-18-tab-current-ui-baseline.md`](../design/2026-07-18-tab-current-ui-baseline.md)
    - [`2026-07-18-tab-financial-atelier-checkpoints.md`](../prototype-discovery/2026-07-18-tab-financial-atelier-checkpoints.md)
    - [`2026-07-18-tab-financial-atelier-checkpoints.md`](../prototype-reintegration/2026-07-18-tab-financial-atelier-checkpoints.md)
12. All three visual checkpoints:
    - [`landing-financial-atelier.png`](../design/checkpoints/2026-07-18/landing-financial-atelier.png)
    - [`checkout-state-contract.png`](../design/checkpoints/2026-07-18/checkout-state-contract.png)
    - [`product-family-financial-atelier.png`](../design/checkpoints/2026-07-18/product-family-financial-atelier.png)
13. Abu's pasted UI feedback/context attachment: `/Users/abu/.codex/attachments/01d7fe01-162f-4ddf-8058-35b95ba336d4/pasted-text.txt`.

## Files Changed

Committed on this branch before the handoff:

- `packages/networks/**` — canonical Base, Arbitrum One, and Base Sepolia profiles.
- `packages/ui/**` — tokens, primitives, and caller-driven StageFlowline.
- `AGENTS.md` and workflow policy — risk-based UI testing.
- Agent lock-deadline fix/tests at commits `9bc76e6` and `0a24a8d`.

Local uncommitted takeover work:

- `apps/site/**` — static Next.js marketing implementation. Abu rejected its current visual result; inspect before deciding what to keep.
- `playwright.config.ts`, `tests/e2e/**` — desktop/light, mobile/dark, reduced-motion, axe, and no-JavaScript coverage plus current golden images.
- `.github/workflows/ci.yml` — installs Playwright Chromium and runs `pnpm test:e2e` after build.
- `package.json`, `pnpm-lock.yaml`, `.gitignore` — Playwright/axe scripts and dependencies/artifact ignores.
- `.env.example`, `apps/site/lib/urls.ts` — local-only URL fallback plus fail-closed Vercel/explicit deployment-origin validation.
- `docs/plans/2026-07-18-tab-product-experience-rebuild-workflow.md` — local workflow refinements.

Protected pre-existing/user work—do not delete, overwrite, or broad-stage:

- Modified `.thoughts/decisions`, `.thoughts/specs`, `.thoughts/quality`, and `.thoughts/stories` files shown by `git status`.
- Untracked `.hotl/`, older prototype/research/build-plan artifacts.
- Untracked `apps/web/app/mobile/**`, `apps/web/lib/mobile/**`, and `apps/web/public/**` Phase 9 work.

## Commands And Results

Evidence that passed on the pushed/foundation state:

- `pnpm check:showcase` — passed.
- `pnpm lint` — passed, 874 files.
- `pnpm exec turbo run typecheck --output-logs=errors-only` — 11/11 tasks passed.
- `pnpm exec turbo run test --output-logs=errors-only` — 10/10 tasks passed in 1m51s.
- `pnpm exec turbo run build --output-logs=errors-only` — 7/7 tasks passed.
- GitHub CI for exact pushed HEAD `0a24a8d` — green at the link above.

Latest local site evidence:

- `pnpm exec biome check apps/site tests/e2e .github/workflows/ci.yml` — passed before the last URL/mobile spacing edits; run again.
- `pnpm --filter @tab/site typecheck` — passed.
- `pnpm --filter @tab/site build` — passed after the final local edits.
- `actionlint .github/workflows/ci.yml` and `git diff --check` — passed before the final local edits; run again.
- A Playwright interaction audit found theme persistence, keyboard navigation, reduced motion, one-shot motion, and no horizontal overflow working at that point.
- The last `pnpm test:e2e` run executed 9 project-tests: 6 passed, 2 intentionally skipped, and 1 golden screenshot failed because the mobile layout intentionally changed. Do **not** update the golden to bless the rejected UI. Redesign first, then regenerate reviewed baselines.
- Full root gates and GitHub CI were **not** rerun on the final uncommitted site/CI/URL state.

## Open Questions

- What visual direction will Abu accept after seeing a real browser walkthrough? The financial-atelier checkpoint is the last durable reference, but the latest code execution is rejected.
- Final root/app/docs domains are still external inputs.
- Magic issuer trust-store acceptance, Circle faucet API entitlement, and Particle mainnet funding remain external integration prerequisites.
- Decide which parts of the uncommitted site are worth preserving. Useful boundaries include truth labels, explicit theme persistence, no-JavaScript visibility, reduced-motion behavior, and the Playwright harness; the overall art direction/composition is not approved.

## Risks Or Blockers

- The local UI work is not on the remote fork. A remote Claude Code session will not see it unless it is given this same filesystem or the changes are deliberately committed/pushed. Do not commit rejected UI merely to transfer it without Abu's instruction.
- The golden screenshots represent a rejected/stale design and should not drive the redesign.
- Current site code has not received final independent review after the last edits.
- `apps/docs` is absent, so R2 cannot be called complete.
- No real Base Sepolia x402 transaction/explorer evidence exists for the requested live lane. Do not describe the integration as complete or “configured.”
- No real Particle mainnet transfer/rebalance proof exists. Never substitute faucet/test funds.
- The worktree contains user-owned changes adjacent to this program. Broad Git operations can destroy them.

## Next Steps

1. Run `git status --short`, confirm branch/HEAD, and inventory local-only files before changing anything.
2. Read the artifacts above and Abu's latest prompt. Use the local frontend/design skills and Playwright; do not use Computer Use for the review.
3. Start with a visual walkthrough, not more implementation: compare the accepted checkpoint, the rejected current site, and the actual browser at desktop/mobile/light/dark/reduced-motion. State plainly what is wrong and what will change.
4. Decide whether to surgically retain the truthful/accessibility foundations or replace the landing composition. Do not treat the present `apps/site` screenshots as approved.
5. Present the first corrected viewport to Abu at localhost before propagating the visual system across checkout, Merchant, Leash, docs, or mobile.
6. After visual acceptance, finish R2 site + docs and compile snippets against packed artifacts. Then execute the remaining workflow in order while running R8 only when real external prerequisites permit.
7. Keep UI testing risk-based. Retain small Playwright/axe/no-JavaScript/reduced-motion coverage and focused financially consequential tests; do not create visual-atom unit-test matrices.
8. Before any checkpoint claim, run the full canonical gates, external-consumer pack checks where applicable, independent review, verification audit, and CI on the exact pushed head.

## Resume Prompt

Take over Tab in `/Users/abu/dev/hackathon/uxmax` from `.thoughts/handoffs/2026-07-18-claude-code-takeover.md`. Read every linked authoritative artifact first, inspect the dirty worktree without broad Git operations, and treat the current uncommitted landing UI as rejected—not as a target. Use Playwright and the local frontend/design skills to give Abu a concrete browser walkthrough, rebuild the visual experience to an agency-level standard while preserving truthful financial states and existing Phase 9 work, then continue the R0–R9 workflow and real Magic/x402/Particle lane with no mocked money evidence.
