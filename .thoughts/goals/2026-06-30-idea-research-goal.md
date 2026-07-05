# Cloud Code Work — Idea Research & Wedge Selection Goal

Paste the block below into Cloud Code Work. It assumes the repo (with `.thoughts/`
and `Reference/`) is available in that environment. If those folders are missing,
the first thing the agent should do is ask Abu to sync the repo.

---

Set a goal to decide on the strongest hackathon wedge for this project by mining the domain knowledge already in this repo and doing your own idea research — then STOP for Abu before any build.

Objective:
Produce a ranked, scored shortlist of 2–3 hackathon ideas (with one clear recommendation) that maximally exploit the sponsor tools documented in this repo, grounded in what those tools ACTUALLY support — not invented capabilities. Do not write code. Do not lock an idea; recommend and stop.

What this hackathon is (gist — verify against the wiki, do not trust this summary alone):
- Run by **Particle Network** (chain abstraction + EIP-7702). Thesis across every sponsor: **make crypto invisible to the user**. UX is the highest-weighted judging axis everywhere.
- Two main tracks (pick ONE): **Universal Accounts Track** (flagship, up to $2,500 — REQUIRES Particle UA SDK in **EIP-7702 mode** + ≥1 cross-chain value-moving op via UA + a demo). **General Track** ($2,000 — must also pick the **Openfort** $100 or **ZeroDev** $500 subtrack).
- Stackable bonuses on EITHER track: **Arbitrum $2,000** (deploy primarily on Arbitrum, invisible UX) + **Magic $500** (embedded wallet). One app can win a main track + Arbitrum + Magic.
- **VERIFIED HARD CONSTRAINT:** Particle UA 7702 mode can only be signed by **embedded/WaaS wallets (Dynamic, Magic, Privy) or raw server keys — NOT MetaMask / browser-extension / JSON-RPC wallets.** So a "browser-extension wallet" surface conflicts with the flagship 7702 track. The **AI-agent angle fits perfectly** (a server-held key signing 7702 authorizations is how an autonomous agent operates).
- Abu's lens (a strong preference, NOT a hard filter): multi-surface (web + extension + mobile + CLI) and "crypto invisible to AI agents too, not just humans."
- The submission deadline is not a factor in scope or quality (per Abu) — build the right product; prioritize by product/demo merit, not time.

Abu's profile (weight ideas toward this): TS/React/Solidity/Python developer with a content-creation distribution edge (polished, demoable UX travels). Judges weight UX 30–40%.

Current context to inspect (READ THESE FIRST, in this order):
- `.thoughts/wiki/index.md` — the domain-wiki hub.
- `.thoughts/wiki/hackathon/` — overview, tracks-and-prizes, judging-criteria, rules-and-deliverables.
- `.thoughts/wiki/sdks/` — particle-universal-accounts (the flagship — read closely), zerodev, openfort, magic, arbitrum.
- `.thoughts/wiki/concepts/` — eip-7702, chain-abstraction, erc-4337-account-abstraction, agent-wallets.
- `.thoughts/wiki/strategy/surface-feasibility.md` — which SDK supports web / extension / mobile / CLI / AI-agent wallet.
- `Reference/` — cloned partner docs (Particle incl. the official 7702 demo `particle-universal-accounts-7702/`, Magic, Openfort, Arbitrum). ZeroDev is NOT cloned (use live docs.zerodev.app); see `Reference/RETRY-zerodev-clone.sh`.
- `.thoughts/research/ideas/` — if present, a local idea-research pass (DECISION-MEMO.md + per-idea files + `raw/`) is already running here; read it and treat it as a peer to cross-check and challenge, not as the final answer.
- `instuctions.md` (repo root) — the original pasted hackathon brief (source of truth for tracks/prizes/rules).

Required workflow:
1. Read the wiki + Reference context above. Build an accurate mental model of what each tool genuinely supports (especially the 7702 wallet-provider constraint and the surface-feasibility matrix). Do NOT propose anything the wiki marks unverified without flagging it.
2. Research the idea space yourself: (a) the current landscape of EIP-7702 consumer apps, chain-abstraction UX, and AI-agents-with-wallets (AgentKit, x402/agent payments, agent treasuries/subscriptions); (b) strong recent hackathon-winning projects in adjacent ecosystems that could be PORTED here and rebuilt with these tools (ecosystem-refactor strategy — novelty is local; a Solana/Base winner is novel in this ecosystem). Use web search. If a local winner-corpus query tool or hackathon skills are available in your environment, use them; if not, web research is sufficient.
3. Generate 6–10 candidate wedges (fresh + refactor). Each must specify: the "invisible crypto" moment, which tracks/prizes it stacks, which tools, which surfaces, the defensible WEDGE, why the UX is demoable, and risks.
4. Score every candidate with multiplicative-floor scoring (each 0–1; one catastrophic dimension tanks the geometric mean): **novelty (on THIS ecosystem) × judge-fit (UX-first + prominent UA/7702 use) × buildability (in the window, in TS/React/Solidity) × prize-stack × wedge-strength.** For any candidate scoring > 0.7, write its single Riskiest Assumption and a ≤2-hour test to de-risk it.
5. Write/refresh a decision memo at `.thoughts/research/ideas/DECISION-MEMO.md` (do not delete an existing one — reconcile with it: agree, dispute, or add). Rank all candidates, detail the top 3, and recommend ONE with sharp reasoning anchored to the judging weights and prize-stack math.
6. STOP and present the recommendation to Abu. Do not proceed to spec, design, or code.

Autonomy rules:
- Keep working through steps 1–5 without asking Abu to restate the process.
- Inspect the actual files before deciding what exists; quote them when you make a claim about a tool.
- Ground every idea in real, documented tool capabilities. Never invent an SDK feature; mark unverified assumptions explicitly.
- Be honest and make Abu slightly uncomfortable — surface the hard tradeoff (e.g. flagship-track depth vs. multi-surface breadth), don't just cheerlead.
- Do not lock a track or idea. The decision is Abu's.

Pause and ask Abu only for:
- A genuine product decision that cannot be answered from the artifacts (e.g. "flagship UA track vs. General+subtrack").
- Missing access needed to research (it shouldn't be — this is read + web only).
- A genuine buildability blocker that requires Abu's input (scope is decided on product/demo merit, not time).

Constraints:
- Read-only on the wiki/Reference (don't rewrite domain pages); you may add/append under `.thoughts/research/ideas/`.
- Respect the verified 7702 constraint above — do not recommend an idea whose core flow needs an extension/JSON-RPC wallet to drive Particle 7702.
- No code, no scaffolding, no track lock this pass.

Definition of done:
- `.thoughts/research/ideas/DECISION-MEMO.md` exists with: a landscape read, a ranked table of all candidates with scores+verdicts, the top 3 in detail (wedge, surfaces, prize-stack math, riskiest assumption + RAT), and ONE recommended pick with reasoning.
- The recommendation is presented to Abu and the agent has STOPPED for his go-ahead.
