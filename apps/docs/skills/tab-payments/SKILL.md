---
name: tab-payments
description: Integrate Tab payments into a merchant app — install @runtab/sdk, create API keys, wire the signed intent endpoint, drop in <PayButton>, register and verify the webhook. Use when a user asks to accept payments with Tab, add a pay button, take USDC payments by email, or set up Tab webhooks.
---

# Integrating Tab payments

Tab is one payment rail with two payers: humans check out with an email
(USDC settles on-chain behind the scenes), and AI agents pay x402 charges
under a hard cap. This skill covers the merchant (human-checkout) side.

## The five steps

1. **Install**: `npm install @runtab/sdk`.
2. **Keys**: create a test secret key (`sk_test_…`, server-only, shown once)
   and grab the publishable key (`pk_test_…`, browser-safe) at
   https://app.runtab.xyz/dashboard/keys.
3. **Intent endpoint** (server signs the amount — the browser can never
   change a price):

   ```ts
   import { Tab } from "@runtab/sdk";
   const tab = new Tab(process.env.TAB_SECRET_KEY!, { apiBaseUrl: "https://app.runtab.xyz" });

   export async function GET(request: Request) {
     const { intent, intentToken } = await tab.paymentIntents.create({
       amount: "1.00",
       intentUrl: request.url,
     });
     return Response.json({ intent, intentToken });
   }
   ```

4. **PayButton** (browser):

   ```tsx
   import { PayButton } from "@runtab/sdk";

   <PayButton
     apiBaseUrl="https://app.runtab.xyz"
     publishableKey={process.env.NEXT_PUBLIC_TAB_PUBLISHABLE_KEY!}
     intentUrl="/api/payment-intent"
     onSuccess={(transactionId) => showConfirmation(transactionId)}
   />
   ```

5. **Webhook** (the trusted fulfillment signal — `onSuccess` is UX only):

   ```ts
   const { signingSecret } = await tab.webhooks.configure({
     url: "https://your-server.example/webhooks/tab",
   });
   // whsec_… returned ONLY on first creation — store it immediately.
   ```

   Verify `X-Tab-Signature` (`t=<unix>,v1=<hmac-sha256 hex>`) on RAW bytes
   before parsing JSON; fulfill idempotently on `${event.type}:${event.id}`.
   Full verifier: https://docs.runtab.xyz/docs/webhooks

## Rules that prevent broken integrations

- Secret keys never reach the browser; publishable keys never mint intents.
- Testnet settles REAL Base Sepolia USDC (server-verified via RPC); buyers
  with empty wallets claim sandbox funds inside the checkout. Never label
  test money as real.
- Webhook signature verification is not optional — anyone can POST to the
  endpoint.
- Copy-paste examples: https://github.com/Blockchain-Oracle/tab/tree/master/examples

## Reference

- Quickstart: https://docs.runtab.xyz/docs/quickstart
- API + errors: https://docs.runtab.xyz/docs/api-reference
- LLM-ready docs: https://docs.runtab.xyz/llms-full.txt
