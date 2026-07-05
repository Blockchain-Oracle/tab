# Reality Research: x402 Detection and Interception Mechanics

## Scope

How does a tool actually detect and intercept an x402 payment challenge from an AI agent's HTTP
traffic, and pay it? Covers: exact wire format (v2 spec), HTTPS interception reality, how
cascade-protocol/x402-proxy works, the non-MITM paths (SDK wrapper and MCP), and the definitive
interception method for Leash (a local AI agent payment autopilot).

---

## Sources Checked

| Source | Method | Notes |
|--------|--------|-------|
| `github.com/coinbase/x402/specs/transports-v2/http.md` | `gh api` raw | Authoritative v2 HTTP transport spec |
| `github.com/coinbase/x402/specs/transports-v2/mcp.md` | `gh api` raw | Authoritative v2 MCP transport spec |
| `github.com/coinbase/x402/specs/schemes/exact/scheme_exact_evm.md` | WebFetch | EVM "exact" scheme details |
| `github.com/cascade-protocol/x402-proxy` README | `gh api` raw | Full README — installation, modes |
| `github.com/cascade-protocol/x402-proxy/.../handler.ts` | `gh api` raw | Primary source: `detectProtocols()` function |
| `docs.x402.org/core-concepts/http-402` | WebFetch | Secondary doc confirmation |
| `x402.org` homepage | WebFetch | Marketing, thin on protocol detail |
| Web search: "x402 protocol HTTP 402 header format 2026" | WebSearch | Corroboration, v1→v2 migration note |

---

## Verified Facts

### 1. x402 v2 Wire Format — the 402 Response

**Status + body.** The server sends `HTTP 402 Payment Required`. The response body is `{}` — an
empty JSON object. All protocol information travels in a **response header**, not the body.

**Detection header.** An x402 402 is identified exclusively by the presence of the
`PAYMENT-REQUIRED` response header. Generic 402s do not carry this header.
(Source: `specs/transports-v2/http.md` — "Mechanism: HTTP 402 status code with `PAYMENT-REQUIRED`
header".)

**`PAYMENT-REQUIRED` value.** A base64-encoded JSON `PaymentRequired` object. Decoded example from
the canonical spec:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}
```

Fields in `accepts[]`:
- `scheme` — payment scheme (`"exact"`, `"upto"`, `"batch-settlement"`)
- `network` — CAIP-2 format, e.g. `"eip155:84532"` (Base Sepolia) or `"eip155:8453"` (Base
  mainnet). NOT the old casual strings like `"base"` — that was v1.
- `amount` — token amount in base units as a string (e.g. `"10000"` = $0.01 USDC at 6 decimals)
- `asset` — token contract address
- `payTo` — facilitator's receiving address (not the resource server itself)
- `maxTimeoutSeconds` — payment validity window (window for EIP-3009/permit2 authorization)
- `extra.name`, `extra.version` — asset metadata; `extra.assetTransferMethod` optionally specifies
  `eip3009|permit2|erc7710`

**Client follow-up.** Client retries the same request, adding:

```http
PAYMENT-SIGNATURE: <base64-encoded PaymentPayload>
```

Decoded `PaymentPayload`:

```json
{
  "x402Version": 2,
  "resource": { "url": "...", "description": "...", "mimeType": "..." },
  "accepted": { /* the chosen item from accepts[] */ },
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x<payer>",
      "to": "0x<payTo>",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0x..."
    }
  }
}
```

The `authorization` block is an EIP-3009 `transferWithAuthorization` permit. The signature
authorizes the facilitator to pull the exact amount from `from` within the time window.

**Server settlement response.** On success, the server returns `200 OK` with:

```http
PAYMENT-RESPONSE: <base64-encoded SettlementResponse>
```

Decoded:

```json
{ "success": true, "transaction": "0x...", "network": "eip155:8453", "payer": "0x..." }
```

On settlement failure, server re-issues `402` with `PAYMENT-RESPONSE` containing
`{ "success": false, "errorReason": "insufficient_funds", ... }`.

**How to distinguish x402 from generic 402:**
Check `response.status === 402 && response.headers.has("PAYMENT-REQUIRED")`. If that header is
present and its base64 decodes to an object containing `x402Version` and an `accepts` array, it is
x402. No other signal is required. The body cannot be relied upon (it is always `{}`).

---

### 2. Version History: v1 → v2 (critical for Leash)

x402 v1 shipped **May 6, 2025** with `X-PAYMENT` (client) and `X-PAYMENT-RESPONSE` (server)
headers — the `X-` prefix convention. x402 v2 shipped **December 11, 2025** and dropped the `X-`
prefix:

| v1 header | v2 header |
|-----------|-----------|
| `X-PAYMENT-REQUIRED` | `PAYMENT-REQUIRED` |
| `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |

Cascade-protocol/x402-proxy's `detectProtocols()` checks **both** for backward compat:

```ts
const pr = response.headers.get("PAYMENT-REQUIRED") ?? response.headers.get("X-PAYMENT-REQUIRED");
```

Leash must do the same.

---

### 3. HTTPS Interception Reality for a Forward Proxy

**How CONNECT tunnels work.** When an HTTP client uses `HTTP_PROXY` / `HTTPS_PROXY` for an HTTPS
request, the client sends `CONNECT api.example.com:443 HTTP/1.1` to the proxy first. The proxy
opens a raw TCP tunnel. The TLS handshake then happens end-to-end between the client and the origin
server — the proxy sees only encrypted bytes.

**Consequence.** A proxy sitting at the OS-level `HTTP_PROXY`/`HTTPS_PROXY` env var cannot read
response headers (including `PAYMENT-REQUIRED`) from HTTPS endpoints **without TLS termination**.

**What TLS termination requires.** The proxy must perform a TLS MITM (mitmproxy-style):
intercept the CONNECT, present a forged leaf cert signed by its own CA, terminate TLS, read the
plain traffic, then re-establish TLS to the origin. This requires the proxy's root CA certificate
to be installed in the host OS trust store (or the agent process's trust store). Without the CA,
the agent's TLS library will throw a certificate validation error and the connection will fail.

**Cert-pinned clients.** Any HTTP client that pins the origin's certificate (many mobile apps,
some SDK implementations, mTLS endpoints) will reject the MITM cert regardless of the OS trust
store.

**Plain text (HTTP) exception.** For plain `http://` endpoints, a CONNECT tunnel is not used.
The proxy relays the full HTTP request/response in clear text and CAN read and modify headers.
This is a narrow exception; virtually all production paid APIs run HTTPS.

---

### 4. How cascade-protocol/x402-proxy Actually Works

Source: `packages/x402-proxy/src/handler.ts` (read in full via `gh api`).

**It is NOT an HTTP_PROXY / transparent proxy.** It does not intercept traffic at the OS network
layer. There is no TLS MITM. There is no CA cert installation step.

**CLI mode.** `npx x402-proxy <url>` makes direct HTTPS calls using Node's native `fetch` (via
`@x402/fetch`'s `wrapFetchWithPayment()` wrapper). It sees the 402 response in-process because
it IS the HTTP client. Detection:

```ts
export function detectProtocols(response: Response): DetectedProtocols {
  const pr = response.headers.get("PAYMENT-REQUIRED") ?? response.headers.get("X-PAYMENT-REQUIRED");
  const wwwAuth = response.headers.get("WWW-Authenticate");
  return {
    x402: !!pr,
    mpp: !!(wwwAuth && /^Payment\b/i.test(wwwAuth.trim())),
  };
}
```

Payment is automatic: on 402 detection, `wrapFetchWithPayment()` constructs the `PaymentPayload`,
signs the EIP-3009 authorization with the wallet key, adds `PAYMENT-SIGNATURE` header, and
retries.

**MCP proxy mode.** `npx x402-proxy mcp <url>` starts a stdio MCP proxy. The agent's MCP host
(Claude Code, Cursor, etc.) connects to it as a standard MCP server. The proxy forwards tool calls
to the upstream paid MCP server over HTTPS — again as the HTTP client, seeing responses
in-process. No CA cert.

**`serve` / `claude` commands.** These start a local HTTP inference proxy server on localhost.
The agent points at localhost (plain HTTP). The proxy then makes the upstream HTTPS call
in-process. No CA cert needed; the agent-to-proxy leg is plain HTTP.

**Setup:** One BIP-39 mnemonic, stored at `~/.config/x402-proxy/wallet.json`. Supported via env
vars (`X402_PROXY_WALLET_MNEMONIC`, `X402_PROXY_WALLET_EVM_KEY`). No cert installation in any
mode.

---

### 5. The MCP Transport's x402 Mechanism (different from HTTP)

Source: `specs/transports-v2/mcp.md` (read in full via `gh api`).

When an MCP tool requires payment, the MCP server does NOT respond with HTTP 402. Instead it
returns a normal MCP `tools/call` result with:
- `isError: true`
- `structuredContent` containing the full `PaymentRequired` object (same schema)
- `content[0].text` containing the same as a JSON string (fallback)

The client detects this by checking `result.isError && result.structuredContent.x402Version` (or
parsing `content[0].text`).

The client retries the tool call with payment in:
```json
{ "params": { "_meta": { "x402/payment": { /* PaymentPayload */ } } } }
```

Settlement response comes back in `result._meta["x402/payment-response"]`.

**Key implication for Leash:** If the AI agent uses MCP tools (as Claude Code and Claude Desktop
do), the 402 signal is in the MCP layer JSON, not in raw HTTP headers. An HTTP-level transparent
proxy would never see it. Detection must be done inside the MCP proxy layer.

---

### 6. Which Agent Runtime Fits Which Detection Method

| Runtime | Payment trigger location | Detection method | CA cert needed? |
|---------|--------------------------|-----------------|-----------------|
| MCP host (Claude Code, Claude Desktop, Cursor, VS Code) | MCP tool result `isError: true` + `structuredContent.x402Version` | MCP stdio proxy (intercepts JSON-RPC in-process) | No |
| Node.js / Deno script making `fetch()` calls | HTTP response header `PAYMENT-REQUIRED` | Wrap `fetch` with `@x402/fetch` or equivalent | No |
| Python script using `httpx`/`requests` | HTTP response header `PAYMENT-REQUIRED` | Intercept at the client wrapper level (middleware / session hook) | No |
| Arbitrary process using HTTPS_PROXY env var | HTTP response header `PAYMENT-REQUIRED` in TLS tunnel | Transparent MITM proxy + CA cert install | YES — unavoidable |
| Arbitrary process using HTTP_PROXY env var (HTTP only) | HTTP response header in clear text | Standard HTTP proxy — no cert | No (HTTP only) |
| LLM agent calling `x402-proxy` CLI as a subprocess | n/a — proxy handles it | subprocess call pattern | No |

---

## Inferences

1. **Leash's primary surface is MCP, not raw HTTP.** Claude Code, Claude Desktop, OpenClaw,
   Cursor — all of the most common local AI agent hosts — use MCP for tool calls. The 402
   challenge in an MCP context is an `isError: true` tool result, not an HTTP header. A
   transparent HTTP proxy watching HTTPS_PROXY would miss these entirely because the MCP host
   communicates with the MCP server over a separate HTTPS connection that the proxy sees as a
   CONNECT tunnel.

2. **The SDK-wrapper / MCP-proxy pattern is the correct primary path.** Both cascade-protocol
   and Coinbase's own reference implementations use in-process detection: wrap the fetch/call
   function, observe the 402/isError signal, construct and sign the payment payload, retry. This
   requires no OS-level hook, no cert install, no TLS termination.

3. **For Leash specifically:**
   - **PRIMARY (MCP hosts):** MCP stdio proxy. Leash registers itself as an MCP server in the
     agent's config. It proxies tool calls to upstream paid MCP servers, detects the x402
     `isError: true` signal in the JSON-RPC response, signs with the user's capped wallet, and
     retries with `_meta["x402/payment"]`. No cert. Works with any MCP host.
   - **SECONDARY (HTTP agents with SDK):** Provide an `@x402/fetch`-style wrapper library
     (Node.js/Python) that detects `PAYMENT-REQUIRED` header and auto-pays. Agent authors drop
     in one line. No cert.
   - **FALLBACK (opaque HTTPS processes):** Local MITM proxy (mitmproxy-style) + CA cert install.
     This is the only path for arbitrary third-party agent processes that can't be wrapped. It
     requires one-time `mitmproxy ca-cert` install in the OS trust store. Cert-pinned clients
     will break.

4. **x402 servers may still serve on plain HTTP** (localhost, private networks). For those,
   an HTTP proxy without TLS termination is sufficient — but this is not the common production case.

5. **v1 APIs still exist** (launched May 2025). Any production Leash implementation must handle
   both `X-PAYMENT-REQUIRED` (v1) and `PAYMENT-REQUIRED` (v2), matching cascade-protocol's
   dual-check pattern.

---

## Unknowns and Questions

- **Does `@x402/fetch`'s `wrapFetchWithPayment()` handle the v1 `X-PAYMENT-REQUIRED` header?**
  The cascade-protocol handler does, but the upstream coinbase library's behavior on v1 headers
  was not confirmed from source (404 on the TypeScript types file).

- **Does Claude Code's MCP host forward x402 `isError: true` results back to the model, or does
  it swallow them?** If Claude Code doesn't surface `isError` to the model and doesn't have a
  hook for x402 interception, the Leash MCP proxy must handle retries fully transparently before
  the tool result reaches Claude Code.

- **Facilitator vs. direct settlement.** The `payTo` in `accepts[]` is the facilitator's address
  (Coinbase or a third party), not the resource server. The facilitator broadcasts the on-chain
  transfer. Whether Leash can act as its own facilitator (to avoid third-party trust) is not
  confirmed from these sources.

- **Payment amount denomination.** Amount `"10000"` with USDC (6 decimals) = $0.01. But the spec
  uses raw base units without always stating decimals. The `extra.name` and `extra.version` fields
  identify the token; decimals must be looked up from the token contract or assumed from context.

- **Kill switch / cap mechanics in a capped wallet.** The research confirms Leash can maintain a
  separate funded address with a fixed USDC balance. What is not confirmed: whether the EIP-3009
  `validBefore` window alone is sufficient as a kill switch, or whether Leash needs a separate
  revocation mechanism.

---

## Not Included

- Specific mitmproxy configuration steps (out of scope — fallback only)
- ERC-7710 and Permit2 as alternate transfer methods (same detection path, different payload)
- MPP (Micro-Payment Protocol) / Tempo streaming payments (cascade-protocol also supports these
  via `WWW-Authenticate: Payment` — separate protocol, not x402)
- On-chain settlement latency / Base finality characteristics
- Leash UI / kill switch UX design
- Solana x402 (separate network path; EVM-specific facts verified here)
