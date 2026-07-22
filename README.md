<p align="center">
  <img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/logo.png" width="112" alt="Tab" />
</p>

<h1 align="center">Tab</h1>

<p align="center"><b>Invisible payments — for you, and for your AI.</b></p>

<p align="center">
  <a href="https://runtab.xyz">Website</a> ·
  <a href="https://app.runtab.xyz">App</a> ·
  <a href="https://docs.runtab.xyz">Docs</a> ·
  <a href="https://vimeo.com/1211240915">Demo video</a> ·
  <a href="https://www.npmjs.com/package/@runtab/sdk">@runtab/sdk</a> ·
  <a href="https://www.npmjs.com/package/@runtab/mcp">@runtab/mcp</a> ·
  <a href="https://github.com/Blockchain-Oracle/tab">Source</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/tab-banner.png" alt="Tab — invisible payments for you and your AI" width="960" />
</p>

<p align="center">
  <a href="https://vimeo.com/1211240915"><img src="https://raw.githubusercontent.com/Blockchain-Oracle/tab/master/assets/demo-thumbnail.png" alt="Watch the Tab intro" width="720" /></a>
</p>
<p align="center"><a href="https://vimeo.com/1211240915"><b>▶ Watch the 30-second intro</b></a></p>

## What is Tab?

Tab is a payments product with **one rail and two payers**:

- **Humans** check out with an email. No wallet extension, no seed phrase, no
  chain picker — a one-time code creates a wallet behind the scenes and the
  payment settles in USDC. It feels like a normal checkout; the buyer never
  has to know it's crypto.
- **AI agents** pay [x402](https://x402.org) `402 Payment Required` responses
  by themselves, through an MCP proxy that enforces a spending cap **outside
  the model**. The agent never holds a key, so a prompt-injected agent can
  *want* to overspend but cannot make the proxy sign the payment.

Both payers settle on the same rail and leave the same evidence: a **receipt**
with an amount, a network, a transaction hash, and (for agents) the full cap
context at the moment of the attempt — settled, failed, or blocked.

Why this matters: paying online is still clunky for people, and AI agents
doing real work hit paywalls and stop cold. The x402 ecosystem has server-side
tooling, but the consumer side — the thing that *pays* on your behalf with
real safety rails — is what's missing. Tab is that side: spend caps, a kill
switch, live monitoring, and signed receipts, wrapped around a checkout your
grandmother could use.

## The three surfaces

| Surface | Who it's for | What it does |
| --- | --- | --- |
| **`<PayButton>`** | Your customers | Embedded checkout: email → code → pay |
| **Merchant dashboard** | You | Keys, webhooks, transactions, go-live checks |
| **Agent dashboard** | Agent owners | Provision, cap, fund, connect, watch, revoke |

Plus a **mobile monitor** (installable PWA at [app.runtab.xyz/mobile](https://app.runtab.xyz/mobile)):
live receipts and cap burn on your phone, with a revoke button — and **no
signing code path at all**, by construction.

## Live deployments

| Surface | URL |
|---|---|
| Marketing site | <https://runtab.xyz> |
| App — checkout, merchant + agent dashboards | <https://app.runtab.xyz> |
| Mobile monitor | <https://app.runtab.xyz/mobile> |
| Documentation | <https://docs.runtab.xyz> |
| SDK on npm | <https://www.npmjs.com/package/@runtab/sdk> |
| MCP proxy on npm | <https://www.npmjs.com/package/@runtab/mcp> |

> ⚠️ **Honest Testnet.** Tab's Testnet runs on **Base Sepolia with real
> on-chain money movement** — real faucet funding, real balance reads, and
> real USDC settlement verified via RPC (the receipt carries the tx hash).
> Mainnet money movement stays visibly **blocked** until the production
> money-mover verification completes; no client-side flag can unblock it.

## How you take payments (merchant)

The in-app Quickstart tracks these steps from **real integration events** —
creating a key, receiving a webhook, settling a payment. Nothing checks
itself off.

**1. Install the SDK**

```bash
npm install @runtab/sdk
```

**2. Create API keys** in the [dashboard](https://app.runtab.xyz): a test
secret key (`sk_test_…`, shown once, stays on your server) and a publishable
key (`pk_test_…`, safe for the browser).

**3. Create an intent endpoint** — your server signs the amount, so the
browser can never decide what to charge:

```ts
// app/api/payment-intent/route.ts (your server)
export async function GET(request: Request) {
  const response = await fetch(`${process.env.TAB_API_BASE_URL}/api/v1/payment-intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAB_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: "1.00", intentUrl: request.url }),
  });
  return Response.json(await response.json(), { status: response.status });
}
```

**4. Drop in the button** — it handles identity (email + one-time code),
balance, an in-checkout test-funds claim for empty wallets, confirmation, and
completion:

```tsx
import { PayButton } from "@runtab/sdk";

<PayButton
  apiBaseUrl="https://app.runtab.xyz"
  publishableKey="pk_test_…"
  intentUrl="/api/payment-intent"
  onSuccess={(transactionId, tokenChanges) =>
    showOrderConfirmation(transactionId, tokenChanges)}
/>;
```

**5. Verify a webhook** — webhooks are the trusted fulfillment signal
(`onSuccess` is UX only). Every delivery is signed (`x-tab-signature`); the
dashboard sends a real signed test delivery, and go-live requires a `2xx`
from your endpoint.

**6. Pay yourself on Testnet** — any email works; an empty wallet claims
sandbox funds without leaving the checkout, and the payment settles as a
real Base Sepolia USDC transfer. You end up with a transaction row (real tx
hash), a signed webhook delivery, and a receipt. The **Go Live** page then
runs real readiness checks (live key, verified webhook, receiving address)
before enabling Mainnet.

Full walkthrough: [docs.runtab.xyz/docs/quickstart](https://docs.runtab.xyz/docs/quickstart).

## How your agent pays (agent owner)

The `/agents/start` wizard walks these steps and completes each one from
**real evidence** — a connection event, an on-chain grant, a settled receipt:

1. **Provision** — creates the agent's hosted signing wallet. You get an
   address you can verify on-chain.
2. **Set the cap** — a per-cycle USD ceiling. Payments that would exceed it
   are **blocked** and still leave a receipt saying exactly why.
3. **Fund** — x402 spends USDC already sitting at the signing address. On
   Base Sepolia the wizard grants test funds automatically.
4. **Connect your MCP client:**

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
           "TAB_AGENT_KEY": "<YOUR_ONE_TIME_KEY>"
         }
       }
     }
   }
   ```

   The `agent_sk_…` key is shown once at provisioning. The connect step
   completes when the proxy first sees your agent — a real connection event,
   not a checkbox.
5. **First paid call** — point the agent at any x402 resource. The proxy pays
   the `402`, retries, and the resource answers `200`. The receipt appears in
   the live feed as it happens.
6. **Review the evidence** — amount, network, transaction hash, and the cap
   context at the moment of the attempt.

When things go wrong, the **emergency ladder** escalates — each step
server-confirmed, never optimistic: **Pause** (block new payments) →
**Freeze** (plus key-rotation lockout) → **Cancel** (key revoked, signer
subject destroyed) → **Nuke** (plus credential destruction).

Full guide: [docs.runtab.xyz/docs/agents](https://docs.runtab.xyz/docs/agents).

## Architecture

```
 Buyer ──▶ <PayButton> ──▶ your /api/payment-intent (sk_)  ──▶ Tab v1 API
                 │                                              │
                 └────────── pk_ + signed intentToken ──────────┤
                                                                ▼
 AI agent ──▶ tab-mcp proxy (agent_sk_) ──▶ x402 resource   Postgres:
                 │      402 → authorize within cap → retry   payments,
                 └──▶ hosted signer (key never leaves) ◀──   receipts, caps
```

Three trust boundaries, three keys:

- **`sk_…`** never leaves your server — it mints signed payment intents, so
  the browser can never change a price.
- **`pk_…`** is public — it scopes the SDK's checkout calls; settlement
  reporting also demands the buyer's own identity token.
- **`agent_sk_…`** lives only in the `tab-mcp` proxy environment — the AI
  agent itself never sees a key, and the cap is enforced outside the model.

Under the hood:

- **Particle Universal Accounts + EIP-7702** turn an email login into one
  chain-abstracted account — a single balance across chains, no gas or
  bridges surfaced to the user.
- A **hosted signer** holds the agent key and signs EIP-3009 USDC
  authorizations; the key never appears in agent context, tool output, or
  environment dumps. (Tab-hosted encrypted custody today; the Magic TEE
  backend is implemented and flips on with account enablement.)
- **Pre-positioned USDC floats** (Base primary + Arbitrum) settle in the hot
  path; Particle UA rebalances them asynchronously from the one treasury.
- Merchant and agent-owner sessions are **separate principals** with separate
  cookies — a merchant session presented to an owner surface is rejected,
  even for the same human.

Diagrams with full sequence flows: [docs.runtab.xyz/docs/architecture](https://docs.runtab.xyz/docs/architecture).

## Run it locally

Prerequisites: **Node 22+**, **pnpm 10**.

```bash
pnpm install
pnpm dev            # web :3000 · site :3001 · docs :3002
```

Quality gates (all green on this tree):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
# 1,000+ tests across web, agent, sdk, faucet, ui
```

## Repository map

```
.thoughts/           context engineering: wiki, research, specs, stories,
                     design, decisions, verification audits
apps/
  web/               checkout, merchant + agent dashboards, v1 API, webhooks,
                     faucet, mobile monitor PWA at app/mobile
  site/              marketing site (runtab.xyz)
  docs/              documentation (docs.runtab.xyz, Fumadocs)
  agent/             @runtab/mcp — tab-mcp proxy, x402 wrapper, cap engine,
                     durable payment envelopes
packages/
  sdk/               @runtab/sdk — PayButton + Tab client (payments, intents, webhooks)
  ui/                brand system: TabMark, official partner marks, tokens
  faucet/            Base Sepolia test-funds engine (real on-chain transfers)
  networks/          chain registry (Base, Arbitrum — no Polygon)
examples/            runnable starters: storefront-next, webhook-node, agent-mcp
assets/              README brand assets (logo, banner, intro video)
```

Built for the **Particle Network Universal Accounts** hackathon (EIP-7702
chain abstraction), targeting the Arbitrum and Magic Labs bonuses.

---

<p align="center"><i>Tab — invisible payments for people and the AIs working for them.</i></p>
