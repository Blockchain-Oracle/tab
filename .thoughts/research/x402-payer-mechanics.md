# x402 — how the PAYER (consumer agent) actually pays

> Scope: we are ALWAYS the payer/consumer, NEVER the host/seller. The user runs an agent
> on their own machine/server; when an HTTP call returns `402 Payment Required`, the agent
> pays and continues, and the user can see what it spent. Facts only, cited.
>
> x402 is recent (open-sourced by Coinbase May 2025; V2 in 2025–2026), so this is grounded
> in live docs + Context7, not memory.

## TL;DR (the payer's job)

The agent uses an **x402 HTTP-client wrapper** (a few lines around `fetch` or `axios`) plus a
**wallet/signer** holding **USDC**. The wrapper transparently: catches the `402`, reads the
seller's payment requirements, signs a **gasless USDC authorization (EIP-3009)**, retries the
request with an `X-PAYMENT` header, and returns the resource. A **facilitator** (hosted by
Coinbase/CDP or others) verifies the signature and settles on-chain. The agent never opens a
browser popup and never pays gas. ([CDP buyers quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers), [Context7 /coinbase/x402](https://github.com/coinbase/x402))

## 1. The protocol loop (real header / field names)

1. **Request** — agent calls the resource normally (`GET /paid-endpoint`).
2. **402 Payment Required** — seller responds `402` with **payment requirements**. Canonical
   V1 shape is a JSON body `{ x402Version, accepts: [ paymentRequirements ], error }`, where
   each `paymentRequirements` object carries:
   - `scheme` — payment method, usually `"exact"` (pay an exact amount).
   - `network` — e.g. `"base"`, `"base-sepolia"` (V2 also uses CAIP-2 like `eip155:8453`).
   - `maxAmountRequired` — price in the asset's atomic units (e.g. `"1000"` = 0.001 USDC).
   - `asset` — token contract address (USDC).
   - `payTo` — the seller's receiving address.
   - `resource`, `description`, `mimeType`, `maxTimeoutSeconds`, and `extra` (token `name`/`version` for EIP-712).
   (V2 introduces a `PAYMENT-REQUIRED` response header / signed "offers"; the V1 JSON-body +
   `accepts[]` form is what most docs and SDKs still show. ([CDP welcome](https://docs.cdp.coinbase.com/x402/welcome), [Context7 /coinbase/x402]))
3. **Client constructs payment** — picks a requirement it can satisfy, then signs a payment
   payload. For the EVM `exact` scheme this is an **EIP-3009 `transferWithAuthorization`**
   signature over USDC: an **off-chain signature**, so the payer spends **no gas**.
4. **Retry with `X-PAYMENT`** — agent re-sends the same request with the base64-encoded
   payment payload in the **`X-PAYMENT`** HTTP request header.
5. **Facilitator verifies + settles** — the seller hands the payload to a **facilitator**
   service (`/verify` then `/settle`); the facilitator checks the signature and **submits the
   USDC transfer on-chain** (the facilitator, not the agent, broadcasts the tx). CDP's hosted
   facilitator is `https://api.cdp.coinbase.com/platform/v2/x402`. ([CDP buyers quickstart])
6. **Resource returned** — on success the seller returns `200` + the content, plus a
   settlement header (**`X-PAYMENT-RESPONSE`** in V1; base64 JSON with `success`, `txHash`,
   `network`) so the client gets a **receipt** of what settled.
   ([Context7 /coinbase/x402], [CDP buyers quickstart])

## 2. Payer integration shapes that exist TODAY — and which is canonical

**The normal way is an SDK middleware around `fetch`/`axios`.** It is not a CLI and not
(by default) an MCP server. You wrap your HTTP client once and every 402 is handled
automatically. Two generations of packages exist:

- **V2 (current, scoped packages):** `@x402/fetch` (`wrapFetchWithPayment`) or `@x402/axios`
  (`wrapAxiosWithPayment`), plus a mechanism package `@x402/evm` (EVM) or `@x402/svm`
  (Solana). You build an `x402Client`, register a scheme (`registerExactEvmScheme(client, { signer })`
  or `client.register("eip155:*", new ExactEvmScheme(signer))`), then wrap fetch.
  ([Context7 /coinbase/x402], [CDP buyers quickstart])
- **V1 (still widely shown):** `x402-fetch` (`wrapFetchWithPayment(fetch, walletClient)`) or
  `x402-axios` (`withPaymentInterceptor(axios.create(...), walletClient)`) taking a viem
  `walletClient` directly. ([Context7 /coinbase/x402], [npm x402-fetch](https://www.npmjs.com/package/x402-fetch))

Minimal V2 buyer (the canonical agent shape):
```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPay = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPay("https://api.example.com/paid-endpoint"); // 402 handled inside
```

**Other shapes (use when the agent's tool surface demands it):**

- **MCP-tool agents → `x402-mcp`.** If the agent calls tools over the Model Context Protocol,
  you wrap the **MCP client** with `withPayment({ account })`; it adds tools that let the agent
  authorize payment when a server's `paidTool` (defined server-side via `createPaidMcpHandler`,
  with a `price`) returns a 402. This is the canonical path **only when the agent is an
  MCP-tool agent**; otherwise the fetch/axios wrapper is canonical. (Vercel `x402-mcp`,
  integrates with the Vercel AI SDK.) ([Vercel x402-mcp blog](https://vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools))
- **CLI.** Pay-from-the-terminal exists in the ecosystem (e.g. QuickNode's x402 RPC tooling)
  but is not the standard agent integration — it's for humans/scripts, not the inner agent loop. ([Context7 /llmstxt/x402_quicknode_llms_txt])
- **AgentKit / CDP.** Coinbase AgentKit and CDP wallets plug in as the **signer/wallet** behind
  the same fetch/axios/MCP wrappers (CDP "non-custodial wallet" is the recommended signer in the
  buyers quickstart). AgentKit is the wallet+framework layer, not a separate payment protocol. ([CDP buyers quickstart], [AgentKit](https://github.com/coinbase/agentkit))

## 3. What the agent needs to pay

- **Token:** **USDC** (an ERC-20 stablecoin). The EVM `exact` scheme uses **EIP-3009
  `transferWithAuthorization`**, which lets the payer authorize a USDC transfer with an
  **off-chain signature** — so the payment is **gasless for the agent** (the facilitator
  broadcasts and effectively covers the on-chain submission). ([CDP buyers quickstart], [CDP welcome], magic.md p.101)
- **Networks:** **Base** is the default/primary; **Base Sepolia** for testing. The CDP
  facilitator also settles on **Polygon, Arbitrum, World, and Solana** (Solana via `@x402/svm`).
  ([CDP welcome], [CDP buyers quickstart])
- **Signer/wallet:** any of —
  - a **private key** → viem `privateKeyToAccount` (Node) / `eth_account` (Python) / Solana Kit;
  - a **CDP non-custodial / server wallet** (recommended in the quickstart; `CDP_API_KEY_ID`,
    `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) — MPC-secured, headless-friendly;
  - any embedded/server wallet that can produce the EIP-3009 / EIP-712 signature (e.g. Magic
    Server Wallets sign in a TEE; Magic ships an x402 agentic-payments recipe). ([CDP buyers quickstart], magic.md p.101)
  The wallet just needs **USDC on the chosen network** (and, because settlement is gasless via
  EIP-3009, the agent itself doesn't need gas for the payment).

## 4. "See what my agent spent on my phone"

There is **no built-in consumer ledger UI in the protocol** — but there IS a standard,
machine-readable **receipt per payment**, which is what you build a phone view on top of:

- Every settled request returns a **settlement response header** (V1: `X-PAYMENT-RESPONSE`,
  base64 JSON with `success`, `txHash`, `network`). The client SDK parses it for you, e.g.
  `httpClient.getPaymentSettleResponse(name => response.headers.get(name))`, or
  `extractReceiptFromResponse(response)` with the offer/receipt extension. ([Context7 /coinbase/x402], [CDP buyers quickstart])
- So the standard pattern is **app-side bookkeeping**: the agent logs each `X-PAYMENT` it sends
  and each settlement receipt (amount, asset, network, `payTo`, `txHash`, timestamp, which
  tool/URL) to your own store, and your phone UI reads that log. Because every settlement is an
  on-chain USDC transfer, the `txHash` is also independently auditable on a block explorer.
- The MCP path surfaces the same "payment outcomes in a header"; Vercel's `x402-mcp` exposes the
  authorize/settlement info to the agent so a client can display it. ([Vercel x402-mcp blog])
- (unverified) Whether CDP/AgentKit ships a turnkey hosted "spend dashboard" for the payer — the
  receipt data and on-chain txHash exist, but a first-party consumer ledger screen was not
  confirmed in primary sources; treat the phone view as something you assemble from receipts.

## Key citations
- CDP buyers quickstart — https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
- CDP x402 welcome — https://docs.cdp.coinbase.com/x402/welcome
- x402 spec + SDK code — Context7 `/coinbase/x402` (github.com/coinbase/x402)
- x402-fetch (V1 package) — https://www.npmjs.com/package/x402-fetch
- Vercel x402-mcp (MCP-tool agent payments) — https://vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools
- Coinbase AgentKit (wallet/framework layer) — https://github.com/coinbase/agentkit
- Domain wiki: agent-wallets.md (x402 summary), magic.md p.101 (x402 EIP-3009 gasless USDC recipe)
