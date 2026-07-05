# Designer update prompt — Leash was reframed (paste to the AI designer)

Paste the block below to the AI designer. It assumes the designer already did a first pass on
the old brief; this tells it exactly what changed on the **Leash** half so it redoes only those
screens. The **Tab** half is unchanged.

---

The product's "Leash" half was corrected after deeper research — please **re-read the updated canonical files and redo only the Leash screens.** Tab (the pay button + merchant dashboard) is unchanged.

**Canonical, updated files (source of truth):**
- `.thoughts/design/2026-07-02-designer-brief.md`
- `.thoughts/design/2026-07-02-product-surface-map.md`

**What Leash IS now (this changed):**
- OLD (wrong): an AI agent with a brain where the owner picked which LLM (Claude/GPT/Gemini) it used.
- NEW (correct): **Leash is an x402 auto-payer.** The owner connects their OWN external AI agent (Claude Code, Cursor, OpenClaude, a script…). When that agent hits a paywall — an "x402" (HTTP 402) — Leash pays it **automatically** from a capped, monitored wallet, and the agent keeps going. **Leash has NO LLM and NO model picker.**

**The two demo hero beats:**
1. (Tab) "I paid with just an email — I never knew it was crypto."
2. (Leash) "My AI agent hit a paywall mid-task, Leash paid it automatically, and I watched every cent — and can yank the leash instantly."

**Screens to REDO / ADD (Leash surfaces only):**
- **DELETE the Model Picker screen.** No model selection anywhere in the UI.
- **ADD "Connect your agent"** (the screen that replaces the model picker): install the Leash MCP server (a config snippet) or the HTTP wrapper; copy your Leash key (shown once, like an API key); a connection-status indicator (not-connected / awaiting-first-payment / active / error).
- **Multi-chain floats** on the web dashboard + mobile: per-chain USDC float balances (**Base = primary**, Arbitrum, Polygon) + ONE unified treasury total; a "topping up" state for the background rebalance.
- **Payment-feed rows** show the settlement network (Base / Arbitrum / Polygon) per payment; explorer links resolve per chain (Basescan / Arbiscan / Polygonscan).
- **Keep** the spend bar, cap config, 3-tier notifications, and the 4-level revocation spectrum (soft pause → freeze → cancel → nuclear) — unchanged.

**Unchanged (do NOT redo):** all Tab screens (buyer checkout, merchant dashboard + auth). The anti-slop bar, the Coinbase-Commerce anti-reference, your creative freedom over visual direction, and the mocked-data / mocked-integrations rules all still apply.

**The narrative that ties it together:** *"one balance powers both sides of the x402 economy"* — humans pay via Tab, AI agents auto-pay via Leash, both from one Particle Universal Account.
