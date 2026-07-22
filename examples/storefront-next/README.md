# Tab example — Next.js storefront

A one-product storefront that takes a $1.00 test payment with `<PayButton>`.

```bash
cp .env.example .env.local   # fill in your keys from app.runtab.xyz/dashboard/keys
pnpm install
pnpm dev                     # http://localhost:4000
```

Pay with any email on Testnet — an empty wallet claims sandbox funds inside
the checkout. Three files matter:

- `app/page.tsx` — the `<PayButton>` (browser, publishable key)
- `app/api/payment-intent/route.ts` — the signed intent (server, secret key)
- `.env.example` — the configuration contract

Webhooks are the trusted fulfillment signal — see `../webhook-node`.
