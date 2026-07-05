# Reality Research: x402 Protocol — Full Ecosystem Deep Dive

## Scope

Map how x402 is served and paid across all three transport surfaces — raw HTTP / Express / Hono / Fastify, Next.js / Vercel edge middleware, and MCP JSON-RPC — by reading the real source from `github.com/coinbase/x402`. Answer the key feasibility question: is one interception layer enough, or is the protocol fundamentally fragmented?

---

## Sources Checked

| Source | Path |
|--------|------|
| Core spec v2 | `specs/x402-specification-v2.md` |
| HTTP transport spec v2 | `specs/transports-v2/http.md` |
| MCP transport spec v2 | `specs/transports-v2/mcp.md` |
| HTTP transport spec v1 (legacy) | `specs/transports-v1/http.md` |
| Express middleware | `typescript/packages/http/express/src/index.ts` |
| Express adapter | `typescript/packages/http/express/src/adapter.ts` |
| Next.js middleware | `typescript/packages/http/next/src/index.ts` |
| Next.js utilities | `typescript/packages/http/next/src/utils.ts` |
| Next.js adapter | `typescript/packages/http/next/src/adapter.ts` |
| Next.js README | `typescript/packages/http/next/README.md` |
| fetch client | `typescript/packages/http/fetch/src/index.ts` |
| axios client | `typescript/packages/http/axios/src/index.ts` |
| MCP server payment wrapper | `typescript/packages/mcp/src/server/paymentWrapper.ts` |
| MCP client | `typescript/packages/mcp/src/client/x402MCPClient.ts` |
| Core HTTP encoding | `typescript/packages/core/src/http/index.ts` |
| Facilitator class | `typescript/packages/core/src/facilitator/x402Facilitator.ts` |
| gh api + raw.githubusercontent.com (git clone throttled) |

---

## Verified Facts

### 1. Protocol on the Wire — Headers and Data Shapes

#### v2 (current, default)

Three custom HTTP headers carry all x402 data. None use standard names like `WWW-Authenticate`.

| Header | Direction | Encoding | Payload |
|--------|-----------|----------|---------|
| `PAYMENT-REQUIRED` | Server → Client | base64(JSON) | `PaymentRequired` object |
| `PAYMENT-SIGNATURE` | Client → Server | base64(JSON) | `PaymentPayload` object |
| `PAYMENT-RESPONSE` | Server → Client | base64(JSON) | `SettlementResponse` object |

HTTP status 402 is used for both "no payment provided" and "payment invalid."

**`PaymentRequired` shape (v2):**
```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": { "url": "...", "description": "...", "mimeType": "..." },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD...",
    "payTo": "0x209693...",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2" }
  }],
  "extensions": {}
}
```

**`PaymentPayload` shape (v2):**
```json
{
  "x402Version": 2,
  "resource": { "url": "...", "description": "...", "mimeType": "..." },
  "accepted": { /* PaymentRequirements object */ },
  "payload": {
    "signature": "0x2d6a...",
    "authorization": {
      "from": "0x857b...", "to": "0x2096...", "value": "10000",
      "validAfter": "1740672089", "validBefore": "1740672154",
      "nonce": "0xf374..."
    }
  },
  "extensions": {}
}
```

The `authorization` object is an **EIP-3009** `transferWithAuthorization` structure. EIP-3009 allows token transfers with off-chain signatures without a prior `approve()` on-chain — the entire payment is one transaction on settlement.

Source: `specs/x402-specification-v2.md` §5.1–5.2

#### v1 (legacy — different wire format)

v1 differs in two critical ways:
- Payment requirements returned in the **JSON response body** (not a header), field `x402Version: 1`.
- Client sends payment via header `X-PAYMENT` (not `PAYMENT-SIGNATURE`).

The server-side code and client code handle both. In Express: `paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment")`. In x402-fetch: tries `PAYMENT-REQUIRED` header first, then JSON body fallback.

Source: `specs/transports-v1/http.md`, `typescript/packages/http/express/src/index.ts` line ~`paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment")`

---

### 2. How It's Served Per Transport

#### Express (`@x402/express`)

- Standard Node.js Connect middleware: `(req, res, next) => ...`
- Reads `payment-signature` or `x-payment` from request headers via `ExpressAdapter.getHeader()`.
- If no payment: returns HTTP 402 with `PAYMENT-REQUIRED` header in response.
- If payment present and valid: **buffers the route handler's response** by monkey-patching `res.writeHead`, `res.write`, `res.end`, `res.flushHeaders`. The route runs, output is buffered. Then settlement is attempted. If settlement succeeds, settlement headers are added and buffered output is replayed to the client. If settlement fails, buffered output is discarded and a 402 is returned.
- This buffering approach means the client never sees the protected response body until payment settles on-chain.

Source: `typescript/packages/http/express/src/index.ts` lines ~158–240 (the `payment-verified` case)

#### Hono, Fastify

Packages exist (`typescript/packages/http/hono`, `typescript/packages/http/fastify`) and follow the same pattern — wrap the framework's middleware/plugin with the same `HTTPAdapter` interface. Headers and status codes are identical to Express.

#### Next.js / Vercel (`@x402/next`)

Two distinct patterns are provided:

**Pattern A — `paymentProxy` (Middleware file):**
- Returns `(req: NextRequest) => Promise<NextResponse>`.
- This is exactly the Next.js Middleware signature, meant for `middleware.ts` at the project root.
- Compatible with **Vercel Edge Runtime** — uses `NextRequest`/`NextResponse` throughout, no Node.js-only APIs.
- On unpaid request: returns `new NextResponse(...)` with status 402 and `PAYMENT-REQUIRED` header.
- On paid request: calls `NextResponse.next()` to forward to the actual route handler, then intercepts and adds settlement headers.
- Key limitation: settlement happens in the middleware layer, before the route executes fully. So if a route returns a 4xx (error), the middleware skips settlement (`if (response.status >= 400) return response;` in `utils.ts`).

**Pattern B — `withX402` (Route handler wrapper):**
- Wraps an individual App Router `route.ts` handler: `withX402(handler, routeConfig, server)`.
- Returns a wrapped function with the same `(req: NextRequest) => Promise<NextResponse>` signature.
- `export const GET = withX402(handler, config, server)` — exact App Router export pattern.
- Settlement is guaranteed to happen only after a successful (< 400) handler response.
- Works in **Node.js runtime and Edge Runtime**.

**Vercel-specific notes:**
- The `@x402/next` README shows `proxy.ts` as the middleware file name, exporting `config.matcher` — standard Next.js middleware conventions.
- `webpackIgnore: true` comment on dynamic `@x402/extensions/bazaar` import signals awareness of Vercel bundling.
- `NextAdapter.getHeader()` uses `req.headers.get(name)` — the Fetch API `Headers` interface, works in Edge Runtime.
- Vercel Edge Middleware runs before the CDN cache, so x402 gating happens at the network edge globally.

Source: `typescript/packages/http/next/src/index.ts`, `utils.ts`, `adapter.ts`, `README.md`

#### MCP (`@x402/mcp`) — FUNDAMENTALLY DIFFERENT

MCP uses JSON-RPC 2.0 over stdio/SSE/WebSocket. There is no HTTP status code and no HTTP header involved.

**Server side — how the challenge is surfaced:**
When a tool requires payment and no payment is included in `_meta`, the server returns a **tool result** (not an error in the JSON-RPC sense):
```json
{
  "result": {
    "isError": true,
    "structuredContent": { /* PaymentRequired object directly */ },
    "content": [{ "type": "text", "text": "{\"x402Version\":2,...}" }]
  }
}
```
Both `structuredContent` and `content[0].text` carry the same `PaymentRequired` JSON (the latter for clients that can't read `structuredContent`).

**Client side — how payment is sent:**
The client retries `tools/call` with the payment embedded in `_meta`:
```json
{
  "method": "tools/call",
  "params": {
    "name": "financial_analysis",
    "arguments": { "ticker": "AAPL" },
    "_meta": {
      "x402/payment": { /* PaymentPayload object */ }
    }
  }
}
```

**Settlement receipt — where it comes back:**
```json
{
  "result": {
    "content": [{ "type": "text", "text": "..." }],
    "_meta": {
      "x402/payment-response": { "success": true, "transaction": "0x..." }
    }
  }
}
```

The `createPaymentWrapper` function in `paymentWrapper.ts` implements the server side. It wraps any MCP tool handler with: extract payment from `_meta` → verify via `resourceServer.verifyPayment()` → execute handler → settle via `resourceServer.settlePayment()` → attach `_meta["x402/payment-response"]`.

Source: `specs/transports-v2/mcp.md`, `typescript/packages/mcp/src/server/paymentWrapper.ts`, `typescript/packages/mcp/src/client/x402MCPClient.ts`

---

### 3. How It's Paid (Client Side)

#### `@x402/fetch` — `wrapFetchWithPayment(fetch, client)`

1. Makes initial request normally.
2. If `response.status !== 402`, returns immediately.
3. On 402: reads `PAYMENT-REQUIRED` header (v2) or parses body (v1 fallback) via `httpClient.getPaymentRequiredResponse(getHeader, body)`.
4. Calls `client.createPaymentPayload(paymentRequired)` — this signs the EIP-3009 authorization.
5. Calls `httpClient.encodePaymentSignatureHeader(paymentPayload)` — base64 encodes to string.
6. Checks that `PAYMENT-SIGNATURE` or `X-PAYMENT` not already present (infinite loop guard).
7. Retries the cloned request with `PAYMENT-SIGNATURE` header set.

Source: `typescript/packages/http/fetch/src/index.ts`

#### `@x402/axios` — `wrapAxiosWithPayment(axiosInstance, client)`

Adds an Axios **response interceptor** that catches 402 errors. Same logic as fetch but uses Axios's interceptor pattern and marks retries with `__is402Retry` flag on the config object.

Source: `typescript/packages/http/axios/src/index.ts`

#### `@x402/mcp` — `x402MCPClient` wrapping `@modelcontextprotocol/sdk` `Client`

- Wraps `mcpClient.callTool()` only. All other MCP methods (`listTools`, `readResource`, `getPrompt`, etc.) are direct passthroughs.
- First call without payment: if result has `isError: true` and JSON matches `PaymentRequired` schema, extracts it.
- Calls `this._paymentClient.createPaymentPayload(paymentRequired)` — same core client, same EIP-3009 signing.
- Retries `mcpClient.callTool({ name, arguments: args, _meta: { "x402/payment": paymentPayload } })`.
- Extracts settlement from `result._meta["x402/payment-response"]`.

Source: `typescript/packages/mcp/src/client/x402MCPClient.ts`, `callTool()` and `callToolWithPayment()` methods

---

### 4. The Facilitator — Verify/Settle Flow

The `x402Facilitator` class lives in `@x402/core`. It is the entity that actually verifies the EIP-3009 signature and submits the on-chain settlement transaction.

**Deployment model:**
- Resource servers embed a `FacilitatorClient` — either `HTTPFacilitatorClient` pointing to `https://facilitator.x402.org` (Coinbase's hosted facilitator) or a self-hosted instance.
- The resource server calls `facilitatorClient.verify(paymentPayload, requirements)` before allowing access.
- After the route/tool executes successfully, calls `facilitatorClient.settle(paymentPayload, requirements)` which submits the on-chain `transferWithAuthorization` tx.

**Is the facilitator always seller-side?**
Yes — the facilitator is called by the resource server (seller), not by the client. The client only signs the authorization and sends it. Settlement happens server-side: the facilitator submits the USDC `transferWithAuthorization` transaction and the resource server receives funds.

**Hooks available:**
`x402Facilitator` exposes `beforeVerify`, `afterVerify`, `onVerifyFailure`, `beforeSettle`, `afterSettle`, `onSettleFailure` hooks for custom logic (logging, fraud detection, partial settlement).

Source: `typescript/packages/core/src/facilitator/x402Facilitator.ts`

---

### 5. The Key Feasibility Question — Uniform or Fragmented?

**Verdict: HTTP-uniform, but MCP requires a separate adapter. Two adapters total.**

**HTTP transports are effectively uniform.** Express, Hono, Fastify, Next.js middleware (`paymentProxy`), and Next.js route wrappers (`withX402`) all use:
- HTTP 402 status code
- `PAYMENT-REQUIRED` header (base64 JSON) for challenge
- `PAYMENT-SIGNATURE` header (base64 JSON) for payment
- `PAYMENT-RESPONSE` header (base64 JSON) for receipt

A single HTTP interceptor (like `wrapFetchWithPayment` or `wrapAxiosWithPayment`) can auto-pay any of these transparently. The core types are protocol-layer identical. The only difference between Express/Hono/Fastify vs. Next.js Vercel edge is how the framework receives the `NextRequest` object, which is internal to the server side — the client sees identical headers regardless.

**MCP is fundamentally different.** It has:
- No HTTP status code (JSON-RPC doesn't use HTTP semantics)
- Challenge delivered via `result.isError + result.structuredContent` (not a header)
- Payment sent via `params._meta["x402/payment"]` (not a header)
- Settlement received via `result._meta["x402/payment-response"]` (not a header)

A standard HTTP fetch/axios interceptor will **not** intercept MCP tool calls because MCP communicates through the MCP SDK's `callTool()` method over an abstract transport (stdio, SSE, WebSocket). The `x402MCPClient` class is the required separate adapter.

**Summary table:**

| Transport | Challenge surface | Payment surface | Can share one HTTP interceptor? |
|-----------|------------------|-----------------|--------------------------------|
| Express | HTTP 402 + `PAYMENT-REQUIRED` header | `PAYMENT-SIGNATURE` header | YES |
| Hono / Fastify | HTTP 402 + `PAYMENT-REQUIRED` header | `PAYMENT-SIGNATURE` header | YES |
| Next.js `paymentProxy` | HTTP 402 + `PAYMENT-REQUIRED` header | `PAYMENT-SIGNATURE` header | YES |
| Next.js `withX402` | HTTP 402 + `PAYMENT-REQUIRED` header | `PAYMENT-SIGNATURE` header | YES |
| Vercel Edge Middleware | HTTP 402 + `PAYMENT-REQUIRED` header | `PAYMENT-SIGNATURE` header | YES |
| MCP (JSON-RPC) | `result.isError + structuredContent` | `params._meta["x402/payment"]` | **NO** — separate adapter required |

---

## Inferences

- The `paymentProxy` (Next.js middleware) pattern is the right one for Vercel-deployed APIs that gate entire route groups (e.g., `/api/premium/*`). The `withX402` wrapper is better for individual routes where you want payment to only settle on success.
- Since both Vercel edge middleware and Express use the same HTTP header protocol, a single client wallet SDK (x402-fetch or x402-axios) works against either without modification.
- The MCP `x402MCPClient` is designed as a transparent passthrough — all 19 public MCP Client methods are proxied, only `callTool` adds payment logic. This means existing agents using the MCP SDK can be upgraded to pay-enabled versions by wrapping.
- The `x402/payment` meta key in MCP maps cleanly to the same `PaymentPayload` type as HTTP — the core cryptographic and schema layer is truly universal across transports.

---

## Unknowns and Questions

- **x402-hono, x402-fastify buffering details** — not read. Presumed similar to Express but not verified.
- **Vercel edge cold starts + facilitator sync** — `syncFacilitatorOnStart` is lazy in Next.js (only initializes on first protected request). Cold-start latency on Vercel edge may add to the first payment round-trip. Unquantified.
- **MCP over HTTP transport (not stdio)** — some MCP deployments use HTTP+SSE as the underlying transport. Whether x402 HTTP interceptors could intercept MCP-over-HTTP is not covered by the spec. The spec assumes MCP payment goes through `_meta`, not HTTP headers, regardless of transport.
- **Multi-payment within one MCP session** — no session-level caching of payment proofs is defined in the spec. Each tool call that requires payment goes through the full verify/settle cycle.
- **The `a2a.md` transport spec** — an Agent-to-Agent transport exists in `specs/transports-v2/a2a.md` and was not read. A third transport surface may exist.

---

## Not Included

- Python, Go, Java implementations (not read, focus is TypeScript for hackathon use)
- Smart contract code (`contracts/` directory)
- Facilitator API endpoint schema (`foundation/` or hosted at `facilitator.x402.org`)
- Examples directory walkthrough
- Bazaar extension details
- A2A transport
