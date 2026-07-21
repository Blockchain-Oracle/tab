<p align="center">
  <img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/logo.png" width="112" alt="Tab" />
</p>

<h1 align="center">Tab</h1>

<p align="center"><b>Invisible payments — for you, and for your AI.</b></p>

<p align="center">
  <a href="https://runtab.xyz">Website</a> ·
  <a href="https://app.runtab.xyz">App</a> ·
  <a href="https://docs.runtab.xyz">Docs</a> ·
  <a href="https://www.npmjs.com/package/@runtab/sdk">@runtab/sdk</a> ·
  <a href="https://www.npmjs.com/package/@runtab/mcp">@runtab/mcp</a> ·
  <a href="https://github.com/Blockchain-Oracle/tab">Source</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/tab-banner.png" alt="Tab — invisible payments for you and your AI" width="960" />
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/tab-brand-intro.mp4"><img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/demo-thumbnail.png" alt="Watch the Tab intro" width="720" /></a>
</p>
<p align="center"><a href="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/tab-brand-intro.mp4"><b>▶ Watch the 30-second intro</b></a></p>

**One balance. Two ways to spend it.** People check out with nothing but an email — no wallet,
no cards, no chains. Their AI agents pay their own way through **x402** (HTTP 402) paywalls —
on a budget you set, watch, and can pull at any moment. The machinery (Particle Universal
Accounts + EIP-7702, hosted Magic signer, multi-chain USDC floats) stays invisible on both sides.

> ⚠️ **Hackathon software.** Payments run end-to-end on **Base Sepolia sandbox funds** with the
> full safety layer — caps, kill switch, signed receipts, live monitoring. Mainnet money paths
> stay visibly blocked until the funded live spike lands (see `.thoughts/decisions/DECISIONS.md`).

## Live deployments

| Surface | URL |
|---|---|
| Marketing site | <https://runtab.xyz> |
| App — checkout, merchant + agent dashboards | <https://app.runtab.xyz> |
| Mobile monitor (any phone, read + revoke) | <https://app.runtab.xyz/mobile> |
| Documentation | <https://docs.runtab.xyz> |
| SDK on npm | <https://www.npmjs.com/package/@runtab/sdk> |
| MCP proxy on npm | <https://www.npmjs.com/package/@runtab/mcp> |

## Integrate in two snippets

**People pay** — drop the button into any React checkout:

```tsx
import { PayButton } from "@runtab/sdk";

<PayButton
  publishableKey="pk_test_…"
  intentUrl="/api/intent"
  onSuccess={(transactionId) => done(transactionId)}
/>
```

**Agents pay** — install the proxy, point any MCP client at Tab:

```bash
npm install -g @runtab/mcp   # provides the tab-mcp command
```

```json
{
  "mcpServers": {
    "tab": {
      "command": "tab-mcp",
      "env": {
        "TAB_API_BASE_URL": "https://app.runtab.xyz",
        "TAB_AGENT_KEY": "agent_sk_…"
      }
    }
  }
}
```

When the agent hits an x402 paywall, Tab pays it within your cap and the agent continues.
Every payment leaves a signed receipt (authorization nonce + expiry) in an auditable ledger.
Full walkthroughs: [docs.runtab.xyz](https://docs.runtab.xyz).

## How it works

- **Particle Universal Accounts + EIP-7702** turn an email login into one chain-abstracted
  account — a single balance across chains, no gas or bridges surfaced to the user.
- **x402** is the pay-per-call standard agents hit; Tab is the consumer-side auto-payer with
  the safety rails the ecosystem is missing — spend caps, kill switch, live monitoring.
- A **hosted signer** (Magic server wallets, TEE) holds the key and enforces the cap *outside*
  the agent, so a runaway agent cannot overspend.
- **Pre-positioned USDC floats** (Base + Arbitrum) settle payments in the hot path; Particle UA
  rebalances them asynchronously from the one treasury — a genuine cross-chain UA move.

## Quickstart (this repo)

Prerequisites: **Node 22+** and **pnpm 10**.

```bash
pnpm install
pnpm build          # turbo build across all workspaces
pnpm test           # 1,000+ tests across web, agent, sdk, faucet, ui
pnpm lint && pnpm typecheck
```

Run the surfaces:

```bash
pnpm dev            # all apps in parallel (web :3000, site :3001, docs :3002)
```

## Repository map

```
.thoughts/           context engineering: wiki, research, specs, stories,
                     design, decisions, verification audits
apps/
  web/               checkout, merchant + agent dashboards, backend, mobile
                     monitor PWA at app/mobile (read + revoke; signs nothing)
  site/              marketing site (runtab.xyz)
  docs/              documentation (docs.runtab.xyz, Fumadocs)
  agent/             @runtab/mcp — tab-mcp proxy, x402 wrapper, cap engine
packages/
  sdk/               @runtab/sdk — PayButton + Tab client
  ui/                brand system: TabMark, official partner marks, tokens
  faucet/            sandbox test-funds engine
assets/              README brand assets (logo, banner, intro video)
```

Built for the **Particle Network Universal Accounts** hackathon, targeting the Arbitrum and
Magic Labs bonuses.

---

<p align="center"><i>Tab — invisible payments for people and the AIs working for them.</i></p>
