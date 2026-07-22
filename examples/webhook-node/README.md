# Tab example — webhook receiver

Verify-then-fulfill, in one file with zero dependencies beyond the SDK.

```bash
pnpm install
# expose local port 4100 publicly (e.g. cloudflared tunnel --url http://localhost:4100)
TAB_SECRET_KEY=sk_test_… WEBHOOK_URL=https://your-tunnel/webhooks pnpm setup-webhook
# copy the printed TAB_WEBHOOK_SECRET, then:
TAB_WEBHOOK_SECRET=whsec_… pnpm start
```

`setup-webhook` registers your endpoint via the API (`tab.webhooks.configure`),
prints the `whsec_` signing secret exactly once, and fires a signed test
delivery. `server.mjs` shows the two invariants every webhook consumer needs:

1. **Verify the signature on raw bytes** before parsing JSON.
2. **Fulfill idempotently** — key on `${event.type}:${event.id}`; retries and
   manual resends reuse the same delivery UUID.
