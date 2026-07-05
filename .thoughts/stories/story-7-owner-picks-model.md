# Story: Owner connects their agent to Leash
> Traces to: R-LEASH-2, R-LEASH-1; AC-LEASH-1. Spec: .thoughts/specs/2026-07-02-tab-leash.md
> (File previously: story-7-owner-picks-model.md — repurposed 2026-07-02. Model-picker content removed; Leash has no LLM and no model picker.)

As an agent owner,
I want to install the Leash MCP server (or HTTP wrapper) into my agent host's config and paste my Leash API key,
so that any x402-gated tool call or HTTP resource my agent accesses is automatically paid — without modifying the agent's own code.

---

## Acceptance Criteria

- **[AC-LEASH-1 / R-LEASH-2]** The owner installs the Leash MCP server package and adds it to their agent host's MCP config (e.g., `claude_desktop_config.json` for Claude Desktop, `mcp.json` for Cursor, stdio config for OpenClaude). After pasting the Leash API key as the single credential, the MCP stdio proxy is active. No CA certificate installation is required for this path. (Primary interception method for Claude Code, Claude Desktop, Cursor, OpenClaude.)

- **[AC-LEASH-1 / R-LEASH-2]** Alternatively, the owner wraps their agent's HTTP client with `@x402/leash-fetch` (or the Leash-patched `@x402/fetch`) and passes the Leash API key at init. After this one-line change, all `fetch` calls that return 402 are automatically handled. (Covers all HTTP-based agents including Vercel-deployed agents.)

- **[AC-LEASH-1 / R-LEASH-1]** The Leash API key is the only secret the owner pastes. No private key, seed phrase, or wallet credential is stored on the agent host or in the owner's environment. The actual signing key is held by the Leash hosted signer (Magic Server Wallet TEE) and is never transmitted to the agent host.

- **[AC-LEASH-1]** After connecting, the owner makes an x402-gated call from their agent (via MCP tool invocation or HTTP fetch). The call succeeds — the agent receives the protected resource — without any explicit payment code in the agent. A receipt row appears in the Leash dashboard confirming the auto-payment occurred.

- **[AC-LEASH-1]** The MITM proxy (opt-in last resort with CA cert installation) is a third interception method documented for edge cases. It is not required or recommended for the primary connection flow.

---

## Scenarios

### Happy path — MCP stdio install (Claude Code / Cursor)

```
Given the owner has a Claude Code or Cursor agent host
When the owner installs the Leash MCP server package
  And adds the server block to their MCP config file with their Leash API key
  And starts (or restarts) the agent host
Then the MCP stdio proxy is active with no CA cert required
  And the owner's agent makes an MCP tool call that triggers an x402 challenge
  And the Leash proxy intercepts the challenge, auto-pays via the hosted signer
  And the agent receives the tool result (200 response)
  And a receipt row appears in the Leash dashboard within the polling interval
```

### Happy path — HTTP wrapper install (Vercel / custom agent)

```
Given the owner has an HTTP-based agent (e.g., Vercel serverless function)
When the owner wraps the agent's fetch client:
    import { leashFetch } from '@x402/leash-fetch'
    const fetch = leashFetch({ apiKey: process.env.LEASH_API_KEY })
  And deploys the updated agent (one-line change, no other modifications)
Then any fetch call that receives a 402 is intercepted by the wrapper
  And the Leash hosted signer auto-pays from the correct pre-positioned float
  And the agent receives the 200 response
  And a receipt row appears in the Leash dashboard
```

### Verification — first paid call confirms the connection is live

```
Given the owner has completed either the MCP stdio or HTTP wrapper install
When the owner triggers a test x402-gated resource from their agent
Then the call succeeds without any manual payment step
  And the dashboard shows a new receipt row with amount, resource URL, chain, and txHash
  And the spend bar increments by the payment amount
  And the owner confirms: "connection is live"
```

### Key stays server-side — no credential on the agent host

```
Given the owner has pasted only the Leash API key into the MCP config or wrapper init
When the agent makes an x402-gated call
Then the Leash hosted signer (Magic Server Wallet TEE) performs the signing
  And no private key, seed phrase, or wallet credential is present on the agent host at any point
  And the owner can rotate the Leash API key from the dashboard without touching the agent host
```

---

## Notes

- **No LLM, no model picker.** Leash is an x402 auto-payer. It does not embed an LLM, pick a model, or proxy LLM calls. The agent is the owner's own external agent; Leash only handles payment interception and settlement.
- **Primary interception method is MCP stdio.** This covers the largest surface (Claude Code, Claude Desktop, Cursor, OpenClaude) without requiring certificate authority trust. The HTTP fetch wrapper covers all remaining HTTP-based agents including Vercel-deployed ones.
- **One key, one onboarding step.** The Leash API key is a capability token — it authorizes the hosted signer to pay on the owner's behalf, within their cap. The owner never manages a private key.
- **MITM proxy is last resort.** The opt-in MITM proxy with CA cert installation is documented for edge cases where neither MCP nor fetch-wrapper can be used. It is not covered in this story's primary scenarios.
- **Cap enforcement is server-side.** Even after connection, the hosted signer checks the owner's cap before signing any payment. The cap is not enforced solely in the agent — it is enforced by the Leash server regardless of which interception method was used.

---

## Open Questions

- **Exact MCP server package name and install command.** The npm package name and the exact config block format for each supported agent host (Claude Desktop, Cursor, OpenClaude, Claude Code CLI) must be confirmed before the onboarding doc can be finalized.
- **API key rotation flow.** When the owner rotates the Leash API key from the dashboard, does the old key immediately stop working, or is there a grace period? The agent host's config must be updated with the new key; the zero-downtime rotation path is not specified.
- **Test resource for connection verification.** What x402-gated URL should the onboarding flow direct the owner to hit as a connection-verification call? A dedicated Leash ping endpoint, or Tab's own x402 endpoint (Story 9)?
