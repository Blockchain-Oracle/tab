# Tab example — agent that pays its own way

Give any MCP agent (Claude Code, Cursor, or your own client) the ability to
pay x402 (`402 Payment Required`) APIs — under a spending cap you control.

## 1. Provision your agent

At [app.runtab.xyz/agents/start](https://app.runtab.xyz/agents/start): provision
the hosted signing wallet, set a per-cycle cap, fund it with sandbox USDC, and
copy the one-time `agent_sk_…` key.

## 2. Install the proxy

```bash
npm install -g @runtab/mcp   # provides the tab-mcp command
```

## 3. Point your MCP client at Tab

Copy `mcp.json` into your client's MCP config (for Claude Code:
`.mcp.json` in your project root) and replace `<YOUR_ONE_TIME_KEY>`.

With no arguments `tab-mcp` exposes one `paid_fetch` tool for direct HTTP
requests. To put an EXISTING MCP server behind the payment rail, add:

```json
"args": ["--upstream", "<ABSOLUTE_STREAMABLE_HTTP_MCP_URL>"]
```

## 4. First paid call

Ask the agent to fetch any x402-protected resource. The proxy pays the 402
within your cap, retries, and the resource answers 200. Every attempt —
settled, failed, or **blocked by the cap** — writes a receipt you can watch
live at [app.runtab.xyz/agents/payments](https://app.runtab.xyz/agents/payments).

Kill switch: Pause → Freeze → Cancel → Nuke, server-confirmed, from the
dashboard or the mobile monitor.
