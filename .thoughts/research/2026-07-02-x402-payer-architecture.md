# x402 Payer Architecture Research
**Date**: 2026-07-02
**Product framing**: Leash — agent wallet that auto-pays HTTP-402 (x402) paywalls; always the CONSUMER/PAYER; no LLM; installs wherever agent runs; universal (any x402 resource); spend cap + monitoring + kill switch.

---

## Scope

Compare four delivery patterns for "auto-pay x402 for ANY agent, install anywhere":
1. HTTP client wrapper (code-level)
2. MCP server
3. Local HTTP forward proxy (transparent)
4. CLI

Determine which pattern(s) best fit Leash's stated goals.

---

## Sources Checked

- `github.com/coinbase/x402` — official monorepo (TypeScript 50.5%, Python 29.3%, Go 19.1%)
- `docs.cdp.coinbase.com/x402/quickstart-for-buyers` — Coinbase official buyer quickstart
- `docs.x402.org/guides/mcp-server-with-x402` — x402 Foundation MCP guide
- `vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools` — Vercel x402-mcp announcement
- `developers.cloudflare.com/agents/agentic-payments/x402/` — Cloudflare Agents x402 docs
- `github.com/cloudflare/templates/tree/main/x402-proxy-template` — Cloudflare proxy template
- `github.com/xpaysh/awesome-x402` — community curated list (consumer tools, MCP servers, proxy solutions)
- `www.xpay.sh/smart-proxy/` — Smart Proxy product (edge-deployed spend controls)
- `zuplo.com/blog/mcp-api-payments-with-x402` — MCP + x402 integration tutorial
- `npmjs.com/@x402-api/mcp-server` — specific MCP server package
- `x402.org` whitepaper
- Search: "x402 proxy transparent forward consumer payer" and "x402 CLI"

---

## Verified Facts

### Protocol fundamentals

- x402 adds a standard 402 Payment Required → pay → retry cycle over plain HTTP.
- Server returns `402` with payment requirements in a `PAYMENT-REQUIRED` header; client signs a stablecoin transfer authorization (EIP-3009, usually USDC on Base) and retries with an `X-PAYMENT` header; a facilitator (Coinbase or Cloudflare) verifies on-chain and the server delivers the resource.
- The entire round-trip is one extra HTTP round-trip; gasless via facilitator.
- Open-sourced by Coinbase May 2025, donated to x402 Foundation (Linux Foundation) April 2026. As of late April 2026: 69,000 active agents, 165 million transactions, ~$50M cumulative volume.

### Pattern 1 — HTTP client wrapper

**Official packages (Coinbase / x402 Foundation):**
- `@x402/fetch` — wraps native `fetch`; intercepts 402, signs, retries automatically
- `@x402/axios` — adds a response interceptor to Axios instances
- `x402` (PyPI) — Python; backends: `httpx` (async) or `requests` (sync)
- `github.com/x402-foundation/x402/go/v2` — Go; wraps `http.Client`

**Notable third-party client packages (from awesome-x402):**
- `x402-axios` (standalone, npm)
- `cipher-x402-client` — zero-runtime-deps TS, ESM+CJS
- `x402-got` — Got HTTP client wrapper
- `x402-payment-harness` (PyPI) — works with any Ethereum EOA
- `Routeweiler` (PyPI) — handles HTTP 402 across x402, L402, MPP-Tempo, Stripe SPT (multi-protocol middleware, not a standalone proxy)

**How it works:** Intercepts at the HTTP client object level. The agent's code must use the wrapped client. The wrapper handles detection, wallet signing, and retry transparently to the caller.

**Fits:** Node.js agents using fetch or Axios; Python agents using requests/httpx; Go agents. Each language has at least one working package. 

**Limitations:** Language-bound. Requires the agent's code to be modified to use the wrapped client. Does not work for agents in other languages without a matching package. Does not work for agents running as subprocesses, Docker containers, or any black-box runtime.

### Pattern 2 — MCP server (two sub-patterns)

**Sub-pattern A — Resource-as-tool** (`@x402-api/mcp-server`, npm, installable globally):
- MCP server holds a wallet (private key via env var); bundles paid API calls as named MCP tools; agent calls e.g. `get_btc_price` and the server transparently pays via `@x402/axios`.
- Install: `npm install -g @x402-api/mcp-server`, set `X402_WALLET_PRIVATE_KEY`.
- Agent never sees the 402 or the payment; it just calls a tool and gets data back.
- **Not universal**: only serves the specific paid resources this MCP server is configured to access. Does not intercept arbitrary 402 responses.

**Sub-pattern B — paidTool / payment-authorization wrapper** (`x402-mcp` by Vercel / `@x402/mcp`):
- MCP server wraps endpoints as `paidTool` with pricing metadata.
- Client side uses a `withPayment` wrapper that "adds additional tools which enable agents to decide when and how to authorize tool payments over MCP."
- The MCP server acts as a payment-aware bridge; agent can call any wrapped tool.
- Still not universal: tools must be pre-declared in the MCP server config.

**Confirmed MCP hosts:** Claude Desktop (explicitly documented). Other MCP-compatible clients (Claude Code, Cursor, Windsurf) should work per protocol spec but are not individually documented in x402 guides.

**Other MCP packages found (awesome-x402):** `ClawPay MCP` (non-custodial, agent signs locally), `ShieldAPI MCP` (9-tool security suite with x402), `agent402-tollbooth` (pay-per-crawl).

**Limitations:** Agent must run inside an MCP-capable host. Each MCP server covers a fixed set of paid resources, not arbitrary URLs on the internet. Not truly "any x402 resource."

### Pattern 3 — Local HTTP forward proxy

**Key finding: No canonical consumer-side local forward proxy exists in the x402 ecosystem as of 2026-07-02.**

Things that exist but are NOT a consumer-side local forward proxy:
- **Cloudflare x402-proxy-template**: A Cloudflare Worker that gates INCOMING traffic (producer-side). It responds with 402 to clients, not the other way around. Not a consumer payer.
- **swerver**: A high-performance gateway proxy for the producer side ("point it at any upstream API, set per-route USDC pricing"). Not a consumer payer.
- **xpay.sh Smart Proxy**: Described as "edge-deployed enforcement layer" with spend limits, rate limiting, budget tracking, and "sub-200ms policy enforcement." Protocol-agnostic. Has consumer-side spend controls. However: appears to be a REMOTE cloud service (not a local binary), and the integration method is "replace your x402 endpoint" — not a transparent `HTTP_PROXY=localhost:9402` pattern. Architecture details not publicly confirmed in docs.
- **Routeweiler** (PyPI): Python middleware that handles 402 across multiple payment protocols. Operates as Python middleware, not as a standalone OS-level proxy.

**What a true consumer-side local forward proxy would look like:**
- Agent sets `HTTP_PROXY=http://localhost:9402`
- All HTTP traffic routes through the Leash proxy process
- Proxy passes non-402 responses through unchanged
- On 402: proxy reads payment requirements, signs USDC transfer using stored wallet, retries to the origin, returns 200 to the agent
- Agent is completely unaware; works in ANY language, ANY runtime, ANY framework

**Building blocks exist to build this:** `@x402/core` and `@x402/evm` contain the full payment signing and facilitator interaction logic. A proxy server wrapping these (e.g., via Go's `net/http` reverse proxy + x402 Go SDK, or Node.js `http-proxy` + `@x402/fetch`) would realize this pattern. The pattern is well-precedented in HTTP tooling (mitmproxy, Burp Suite, corporate CONNECT proxies).

**This is the gap Leash can fill.**

### Pattern 4 — CLI

- No official x402 CLI for consumer-side one-off payments found.
- `@x402-api/mcp-server` installs a CLI binary, but it is an MCP server daemon, not a one-shot payment tool.
- No `x402 curl https://example.com/paid-resource` pattern exists.
- Would require: shell script that calls the x402 SDK, signs a payment, constructs the X-PAYMENT header, and runs curl with that header — doable but not packaged.
- **Usefulness for Leash:** Lowest transparency. Only relevant if the agent explicitly shells out a CLI command to pay a URL, then uses the result. Not "install anywhere" friendly.

---

## Inferences

1. **The proxy gap is intentional from the ecosystem perspective, not an oversight.** The official x402 SDK takes a "wrap your HTTP client" philosophy. This is fine for developers building agents, but leaves operators (people who run third-party agents) with no option.

2. **Leash's core value proposition maps exactly to the forward-proxy gap.** The product framing — "installs wherever the agent runs, works for ANY x402 resource, zero code change" — is the definition of the forward proxy pattern.

3. **MCP is Leash's best secondary delivery channel.** For agents running inside MCP hosts (Claude Desktop, Claude Code, Cursor), a Leash MCP tool exposing `fetch_paid_url(url) → response` gives the same "agent doesn't need to know" UX. The wallet lives in the MCP server; spend cap and kill switch live in the MCP server's configuration. This is not the proxy pattern but achieves the same user experience for MCP-native agents.

4. **HTTP client wrappers are a fallback, not the primary.** They require code changes by the agent developer. Leash's goal is to NOT require that. Wrapper SDKs are how Leash's eventual SDK exports look if a developer wants to embed rather than proxy.

5. **Spend cap + kill switch are natural at the proxy layer.** A local proxy has full visibility of all outgoing requests. Budget tracking, per-domain allowlists, and a kill switch (stop issuing payments) are trivial to implement at the proxy intercept point. This is harder with code-level wrappers where each agent instance carries its own wallet logic.

6. **Protocol complexity is low.** The x402 payment handshake is one extra round-trip; the signing math is EIP-3009 (widely supported). Building a proxy around `@x402/core` is a weekend project, not a research problem.

7. **AWS Bedrock AgentCore Payments (Preview, May 2026)** is a managed x402 wallet for Bedrock agents — not a proxy, but signals enterprise demand for exactly this "invisible payment infrastructure" concept.

---

## Unknowns

- **xpay.sh Smart Proxy architecture**: Whether it supports `HTTP_PROXY`-style transparent interception or requires explicit SDK integration was not confirmed in available docs. May be closest existing product to Leash.
- **MCP host compatibility matrix**: Only Claude Desktop is explicitly confirmed in x402 docs. Claude Code, Cursor, Windsurf compatibility is inferred from MCP spec compatibility, not tested per these sources.
- **CONNECT tunneling and TLS**: A true forward proxy intercepting HTTPS (not just HTTP) would require MITM TLS, which adds complexity (CA cert installation). x402 resources could be HTTP or HTTPS; this is an open engineering question for Leash.
- **Facilitator latency**: The extra payment round-trip adds latency (Coinbase facilitator). Unclear if this is sub-100ms or 200-500ms in practice at scale.
- **Python ecosystem**: `Routeweiler` (multi-protocol 402 middleware) and `switchboard` (gas budget tracker) are mentioned in awesome-x402 but neither repo was inspected directly; may be nascent or unmaintained.

---

## Not Included

- Producer/server-side integration (`@x402/express`, `@x402/fastify`, `@x402/hono`, `@x402/next`) — Leash is always the payer.
- Facilitator setup (Coinbase CDP, Cloudflare facilitator) — infrastructure concern, not delivery architecture.
- L402 / Lightning Network — separate protocol; not x402.
- Multi-chain beyond Base/USDC — current x402 usage is predominantly USDC on Base.
- Security attacks on x402 (replay, sybil, PII) — separate research surface.

---

## Recommendation

### Primary: Local HTTP forward proxy (Build it — this is the product)

Leash should implement a local HTTP/HTTPS proxy that agents route through via the standard `HTTP_PROXY` / `HTTPS_PROXY` environment variables (or system proxy settings). The proxy:

1. Passes all non-402 responses through unchanged.
2. On 402: reads `PAYMENT-REQUIRED` header, checks spend cap, signs payment using `@x402/core` + `@x402/evm` (or the Go SDK for a single-binary distribution), retries to origin, returns the 200 to the agent.
3. Exposes a local dashboard (or CLI) showing spend, per-domain costs, and kill switch.

**Why primary:**
- Zero code change for the agent — works for Python, Node.js, Go, Ruby, Rust, shell scripts, Docker containers, any runtime that respects `HTTP_PROXY`
- Spend cap and kill switch are trivially enforced at the proxy intercept point
- Truly universal: any x402 resource on the internet, not just pre-declared tools
- Building blocks already exist (`@x402/core`, `@x402/evm`, Go SDK); the proxy shell is known engineering
- No canonical competitor exists today — this is the gap

**Implementation approach:** Go binary (single static binary, easy distribution, x402 Go SDK available) wrapping Go's `net/http/httputil.ReverseProxy`. For HTTPS: distribute a local CA cert or use `CONNECT` passthrough for non-402 HTTPS resources only.

### Secondary: MCP server tool (`fetch_paid_url`)

For agents running inside MCP-capable hosts (Claude Desktop, Claude Code, Cursor), expose a single Leash MCP tool:

```
fetch_paid_url(url: string, max_spend_usdc: number) → { status, body, spent_usdc }
```

Wallet lives in the MCP server process. Spend cap is a per-call parameter. Kill switch is process-level. Install: one entry in `claude_desktop_config.json` or `claude_code_settings.json`.

**Why secondary:** MCP hosts are growing fast (Claude Code, Cursor have millions of users) but the universe is still smaller than "all HTTP clients." The proxy covers everything MCP covers plus more.

### Not recommended as primary: HTTP client wrappers

Require the agent developer to modify their code. Violates the "install anywhere, zero code change" goal. Valid as a Leash SDK export for developers who want embedded payment, but not the core delivery.

### Not recommended: CLI

Too low-level. No existing package. Only useful if the agent explicitly calls a shell command per payment, which breaks the "auto-pay" promise.
