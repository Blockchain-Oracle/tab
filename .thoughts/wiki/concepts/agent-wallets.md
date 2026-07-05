# Agent wallets (AI agents with wallets)

> Sources: [Coinbase AgentKit](https://github.com/coinbase/agentkit), [CDP AgentKit docs](https://docs.cdp.coinbase.com/agent-kit/welcome), [x402](https://www.x402.org/) / [CDP x402 docs](https://docs.cdp.coinbase.com/x402/welcome), [ZeroDev docs (cloned)](https://docs.zerodev.app/), [Particle docs (cloned)](https://developers.particle.network/), [Openfort AI agents](https://www.openfort.io/solutions/ai-agents), [Magic Server Wallets](https://docs.magic.link/server-wallets/introduction), [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004). See ../../raw/sources.md.

Strategic lens page. "Agent wallets" is the 2025–2026 design pattern where an autonomous
AI agent — not a human at a popup — holds and uses a crypto wallet. This page maps the
**current reality** and cross-references which hackathon sponsor SDKs enable headless /
agent / CLI wallet use. Facts only; no build proposal.

## What it is (plain English, define jargon inline)

An **agent wallet** is a crypto wallet whose signer is software — typically an **LLM
agent** (a program that loops "think → call a tool → observe") — so it can hold funds and
sign/send transactions **without a human approving each one**. Coinbase's framing, which
the whole category borrows: *"Every AI Agent deserves a wallet."*
([AgentKit README](https://github.com/coinbase/agentkit))

Why this needs new infra: ordinary wallets (MetaMask) assume a **human at a browser popup**
clicking "confirm," and they hold one key in front-end context. Agents are **headless**
(no UI, run on a server or CLI), need **programmatic signing**, and need **bounded
authority** so a hallucinating or compromised agent can't drain everything. The category
splits into two custody patterns:

- **Agent owns its own wallet** — a fresh key the agent controls, secured server-side via
  **MPC** (multi-party computation: the key is split into shares so no single machine ever
  holds it whole) or a **TEE** (Trusted Execution Environment: isolated secure hardware
  where the private key never leaves). Examples: Coinbase **CDP Server Wallets**, Magic
  **Server Wallets**, Openfort **backend wallets**.
- **Agent gets delegated authority** under a *user's* wallet via a **session key** — a
  short-lived keypair scoped by policy (which contracts, how much, until when). The user
  stays the owner; the agent only gets a leash. This is the safer pattern for consumer
  apps and the one all four sponsor SDKs support in some form.

## How it works (technically correct, concise)

**1. Headless signing back-end.** The key lives where an agent can reach it programmatically:
- **CDP Server Wallets v2** — MPC-secured, reached GA **Jul 24 2025**, advertised
  sub-200ms signing latency and 99.9% availability target ([web research, verify exact
  SLA]).
- **Magic Server Wallets** — *"private keys never leave secure hardware"*; AWS Nitro TEE +
  **key sharding**; two surfaces: **Express API** (JWT auth, keys managed internally) and
  **Core API** (more control, key sharding); EVM, Solana, Bitcoin over REST. Explicitly
  *"ideal for backend systems and headless applications."*
- **Openfort backend wallets** — TEE/MPC custody via **OpenSigner** (open-source,
  self-hostable key management); non-custodial; sub-200ms signing.

**2. Session keys = scoped delegation.** ZeroDev's model is the clearest spec:
`Permission = 1 signer + N policies + 1 action`, answering **who / when / what**. Policies
include call (contract+function+param allowlist), gas cap, **rate limit**, **timestamp**
window, and spend limits ([ZeroDev permissions intro, cloned]). Flow for "automate
transactions from a server" ([ZeroDev transaction-automation, cloned]): the **owner**
(user frontend) approves the **agent**'s (server) session-key *address* — only the public
key crosses the wire — producing a serialized approval; the agent then signs UserOps with
the session key; the owner can **revoke** by uninstalling the permission plugin. ZeroDev's
own blog calls session keys *"the JWTs of Web3."* Particle exposes the same via
`createSessions` / `validateSession` (SDK + AA RPC), but its docs note this is *"currently
supported only on the Biconomy v2.0.0 smart account implementation"* — a real constraint.

**3. Agent frameworks + wallet plumbing.** **Coinbase AgentKit** is the connective layer:
*"wallet-agnostic, framework-agnostic."* It ships wallet providers (CDP, Privy, Viem, plus
Smart Wallet and **ZeroDev** examples) and framework adapters for **LangChain, MCP (Model
Context Protocol), Vercel AI SDK, OpenAI Agents SDK, AutoGen, Pydantic AI**. Coinbase's
branded **"Agentic Wallets"** package wraps this with per-tx limits, session caps, gasless
Base settlement, and native x402, installable via `npx awal` or an **MCP server** callable
from Claude / Codex / Gemini ([web research, recent — verify naming]).

**4. Agent payments — x402.** An open standard reusing the dormant **HTTP 402 "Payment
Required"** status: server replies `402` with price + accepted token; the client (often an
agent) returns a **signed USDC payload in an HTTP header**; a **facilitator** verifies and
settles on-chain in seconds, no login. Open-sourced by Coinbase **May 2025**; the **x402
Foundation** (Coinbase + Cloudflare) lists Google, Visa, AWS, Circle, Anthropic, Vercel as
members; CDP facilitator settles on Base, Polygon, **Arbitrum**, World, Solana.

**5. Agent identity standards (emerging).** **ERC-8004 "Trustless Agents"** — Identity
(ERC-721), Reputation, and Validation registries so agents can be discovered/trusted across
orgs; extends Google's **A2A** (agent-to-agent) protocol and its **AP2** (Agent Payments
Protocol); went live on Ethereum mainnet **Jan 29 2026** ([web research — verify]).
**ERC-7715 / ERC-7710** (grant-permissions / delegation) are the wallet-permission side but
were not confirmed in primary sources here — *treat as unverified*.

## Why it matters for THIS hackathon

- The hackathon's thesis is **"invisible crypto" / exceptional UX**, and AI is called out
  explicitly: the **Arbitrum bonus** lists *"AI apps with invisible onchain payments"* as
  an example idea; the **Magic bonus** lists *"AI or social apps with embedded accounts."*
  An autonomous agent that pays/moves value with no human gas-clicking is a vivid demo of
  the exact UX judges reward.
- **It composes with the headline trick.** An agent acting through an EIP-7702-upgraded
  Universal Account could satisfy the UA Track's hard requirement ("at least one
  cross-chain operation moving value via UA") *and* deliver a novel autonomous UX in one
  build — chain abstraction + agent autonomy.
- **It's a differentiator, not a freebie.** The UA Track text says the *user's EOA* becomes
  the account; whether judges accept an **agent-held** key as "the user" is an
  interpretation risk (see Open questions). Session-key delegation (user owns, agent
  acts) is the safer framing and sidesteps the "agent owns the EOA" ambiguity.
- **Strong tie to incumbents:** Coinbase ran a 2025 "Agents in Action" hackathon on this
  exact stack (AgentKit + x402), so the pattern is judge-legible and well-tooled.

## Relationship to the sponsor SDKs (Particle UA / ZeroDev / Openfort / Magic)

- **ZeroDev — strongest, most explicit agent story.** Ships a first-party quickstart
  *"ZeroDev × AgentKit (LangChain chatbot)"* where the agent's wallet **is** a ZeroDev
  smart account (`ZeroDevWalletProvider` in `@coinbase/agentkit`, EntryPoint v0.7); a
  dedicated **transaction-automation** tutorial frames "owner (frontend) vs agent
  (server)"; composable session-key **policies** via `@zerodev/permissions`; works in
  **7702 mode** (pass the EOA as `eip7702Account`, no sudo validator). Note: ZeroDev was
  acquired by **Offchain Labs (Arbitrum)** — doubly relevant given the Arbitrum bonus.
- **Openfort — purpose-built "agent wallet" product.** Markets *"Agent wallets for
  autonomous AI transactions"*: **server-side backend wallets**, **session keys** scoped by
  contract allowlist + spend cap + expiry, TEE/MPC custody via **OpenSigner** (OSS,
  self-hostable), **ERC-4337 + EIP-7702**, integrations with LangChain/CrewAI/AutoGen,
  sub-200ms signing, plus policy controls (limits, allowlists, anomaly detection, multi-
  party approval, audit logs). This is the cleanest off-the-shelf agent-wallet kit among
  the sponsors (General Track Subtrack 1, $100).
- **Magic — headless Server Wallets exist, but the bonus rewards onboarding.** Server
  Wallets are genuinely backend/agent-suited (TEE, no client iframe, REST, EVM/Solana/
  Bitcoin). BUT the **Magic $500 bonus is scoped to the *embedded* wallet** (social/email
  onboarding UX), not headless server wallets — so server wallets help an agent build but
  may **not** be what wins that specific bonus. Verify which Magic product the bonus judges
  accept.
- **Particle UA — backend-capable, "agent accounts" emerging, with a caveat.** The Universal
  SDK can run **in a Node backend** (build a viem wallet client from a private key →
  `AAWrapProvider` → send via the UA). Search surfaced **"Universal Agent Accounts"** (an
  API + dashboard letting AI agents own/manage their own Universal Accounts) — *not
  confirmed in the cloned docs; verify before relying on it.* Caveat: Particle's session-key
  support is documented only on the **Biconomy v2.0.0** smart-account implementation, which
  may not line up with UA 7702 mode for delegated agents.

## Open questions

- Does **UA 7702 mode** support a fully **headless/agent-held** key, and will UA-Track
  judges accept an *agent* (not a human) as the EOA owner? The track says "user's EOA."
- Is **"Universal Agent Accounts"** a real, available Particle product (API + dashboard),
  or marketing/roadmap? Only seen in search snippets, not the cloned docs.
- Does Particle's **Biconomy-v2.0.0-only** session-key limitation block combining session
  keys with UA 7702 mode? (Conflict to verify in docs.)
- Can an agent **pay via x402 out of a chain-abstracted UA balance** (cross-chain
  settlement under the hood)? Undocumented.
- For the **Magic bonus** specifically: do server wallets qualify, or must it be the
  front-facing embedded wallet onboarding flow?
- Exact, current status of agent standards (**ERC-8004** mainnet date, **ERC-7715/7710**)
  — pulled from secondary web sources; confirm against EIP text before citing in a demo.

## Citations

- Coinbase AgentKit (tagline, wallet/framework support) — https://github.com/coinbase/agentkit ; docs https://docs.cdp.coinbase.com/agent-kit/welcome
- CDP Server Wallets / "Agentic Wallets" (MPC, session caps, `npx awal`, MCP) — https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets (web research, verify dates)
- x402 — https://www.x402.org/ ; https://docs.cdp.coinbase.com/x402/welcome ; Coinbase launch https://www.coinbase.com/developer-platform/discover/launches/x402
- ZeroDev permissions / session keys / AgentKit / 7702 — live **https://docs.zerodev.app/** (pages `smart-accounts/permissions/{intro,transaction-automation,agentkit,1-click-trading}`) + Context7 `/websites/zerodev_app`; local mirror `Reference/zerodev-docs` was GitHub-throttled (best-effort).
- Particle session keys + backend SDK — cloned `Reference/particle-docs-mintlify` (HEAD 360327a): `aa/guides/keys.mdx`, `aa/rpc/{createsessions,validatesession}.mdx`; live https://developers.particle.network/
- Openfort AI agents (backend wallets, session keys, OpenSigner/TEE) — https://www.openfort.io/solutions/ai-agents ; https://www.openfort.io/blog/ai-agent-wallet-strategy
- Magic Server Wallets (TEE/Nitro, Express vs Core API, headless) — https://docs.magic.link/server-wallets/introduction
- ERC-8004 Trustless Agents (identity/reputation/validation registries; A2A/AP2) — https://eips.ethereum.org/EIPS/eip-8004 (web research, verify mainnet date)
