# Raw Research Notes: DX/UX Patterns + x402 Network Coverage
Date: 2026-07-02
Researcher: Claude Sonnet 4.6 subagent

---

## PART A: DEVELOPER EXPERIENCE UX PATTERNS

### Sources consulted
- https://docs.stripe.com/development
- https://docs.stripe.com/keys
- https://docs.stripe.com/sandboxes
- https://docs.stripe.com/workbench/overview
- https://docs.stripe.com/development/dashboard
- https://docs.stripe.com/get-started/development-environment?lang=node
- https://docs.stripe.com/quickstarts
- https://clerk.com/docs/nextjs/getting-started/quickstart
- https://clerk.com/docs
- https://resend.com/docs/send-with-nodejs
- https://resend.com/docs/create-an-api-key
- https://docs.lemonsqueezy.com/guides/developer-guide/getting-started
- https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- https://docs.cdp.coinbase.com/commerce/introduction/quickstart (404 returned)

---

### 1. STRIPE

#### Page Layout: Developer Resources Hub
- URL: https://docs.stripe.com/development
- Title: "Developer resources" / Subtitle: "Learn how to use SDKs, API keys, and integration tools."
- First CTA: "Install an SDK" under "Get Started" section
- Sections: Get Started / Versioning / Essentials (SDKs, APIs, Testing, Stripe CLI) / Tools (Workbench, Developers Dashboard, VS Code extension, Terraform, Discord) / Features (Workflows, Webhooks, Event destinations) / AI Solutions (MCP, agentic billing) / Security / Extend Stripe / Partners
- "(Private preview)" tags mark beta features visually throughout
- Workbench listed as new home replacing Developers Dashboard

#### Quickstart Structure (Node.js path)
- Total steps: 10
- Step 1: Create a Stripe account
- Step 2: Install Stripe CLI — first code shown: `brew install stripe/stripe-cli/stripe` (also apt/yum/Scoop/winget/Docker variants)
- Step 3: Authenticate — `stripe login`
- Step 4: Create a product — `stripe products create --name="My First Product" --description="Created with the Stripe CLI"`
- Step 5: Create a price — `stripe prices create --unit-amount=3000 --currency=usd --product="{{PRODUCT_ID}}"`
- Step 6: Check Node version — `node --version`
- Step 7: Init project — `npm init`
- Step 8: Install SDK — `npm install stripe --save`
- Step 9: Yarn alternative — `yarn add stripe`
- Step 10: Run first SDK request — create and run `create_price.js`
- Quickstarts page has 15 total quickstarts across 3 categories: Payments (10), Platforms and marketplaces (3), Developer resources (2)
- Quickstarts are described as "full end-to-end interactive code samples" with "step-by-step instructions that highlight lines of code as your scroll down"
- Option to "download or launch with Stripe's AI assistant in VS Code"

#### API Keys UX
- Located at dashboard.stripe.com/apikeys (sandbox mode) and dashboard.stripe.com/test/apikeys
- Key format table:
  - Sandbox publishable: `pk_test_`
  - Sandbox restricted: `rk_test_`
  - Sandbox secret: `sk_test_`
  - Live publishable: `pk_live_`
  - Live restricted: `rk_live_`
  - Live secret: `sk_live_`
  - Live organization: `sk_org_`
- Create secret key flow: click "Create secret key" → email/text verification code → enter name in "Key name" field → click "Create" → click key value to copy → enter note in "Add a note" field → click "Done"
- Copy mechanism: clicking the key value itself copies it (no separate copy button)
- Overflow menu (⋯) per key: Edit key / Manage IP restrictions / Expire key / Rotate key / Restore access / View request logs
- Microcopy warnings:
  - "Save the key value. You can't retrieve it later."
  - "Store sensitive keys in a secrets vault"
  - "Don't put keys in source code or configuration files checked into version control"
  - "Don't share keys over email, chat, or other unencrypted channels"
  - "It's safe to embed this key in your code or apps" (for publishable keys)
- Live mode restrictions: "You can reveal only live-mode RAKs that we created for you. If you create a RAK yourself, you can't reveal it after you've seen it once."
- Reveal flow for live mode: "Reveal live key" → click to copy → "Hide live key"

#### Test vs Live Mode Toggle
- Toggle in top navigation bar to switch between Test and Live mode
- In sandbox mode: all API keys always visible
- In live mode: only pre-generated keys can be revealed after creation
- Sandboxes (separate feature from test mode toggle): accessed via "Sandboxes" in the Dashboard account picker; separate isolated environments; cannot test IC+ pricing in sandbox
- Test mode toggle is simpler: same account, different key prefix (sk_test_ vs sk_live_)

#### Workbench (Merchant/Developer Dashboard)
- URL: https://docs.stripe.com/workbench
- Replaces older Developers Dashboard for new accounts; enabled by default on new accounts
- 8 tabs: Overview / Errors / Inspector / Logs / Health / Events / Webhooks / Shell
- UI controls: resize handle (drag top) / Maximize icon (↔) / Minimize / Expand (chevron) / Collapse (❌) / Copy link (shareable URL) / Send feedback / Refresh logs / Refresh events / Add destination / Manage (API keys) / Upgrade available (API version) / Run (execute API request) / API Explorer / Auto-inspect toggle
- Inspector: enter object ID → see Data map (left pane, hierarchy of related objects) / Overview tab (JSON) / Logs tab (related request logs) / Events tab (recently generated events). "Edit in API Explorer" button in sandbox only.
- Health tab: 30-day account health history
- Shell: command line interface for API commands directly in browser
- Logs: records every successful or failed request — includes original request, success/failure, response, related API resources

---

### 2. CLERK

#### Docs Homepage Structure
- URL: https://clerk.com/docs
- Top-level nav: Quickstarts & Tutorials / UI Components / SDK Reference / Customizing Clerk
- Feature explorer: "Explore by feature" / "Explore by backend framework" / "Build with community-maintained SDKs"
- 11 official frontend framework quickstarts: Next.js, React, Vue, Nuxt, Astro, React Router, Expo, Android, iOS, Chrome Extension, JavaScript
- First CTA: Quickstarts & Tutorials section — "end-to-end tutorials and getting started guides for different application stacks"
- Homepage value prop: "Add sign up, sign in, and profile management to your application in minutes"
- Prebuilt components described as: "a beautiful, fully-functional user management experience in minutes"

#### Next.js Quickstart Steps
- URL: https://clerk.com/docs/nextjs/getting-started/quickstart
- Preliminary checklist (shown before steps, presented as CLI dialog):
  "Here's what I'll do to get you set up with Clerk. 1. Install or update the Clerk CLI 2. Sign in to Clerk (opens your browser) 3. Set up Clerk in this project, or scaffold a new Next.js app with Clerk if this directory is empty 4. Start your app with Clerk installed. Shall I proceed?"
- Step 1: Install or update the Clerk CLI
  - `command -v clerk && clerk --version || echo "Clerk CLI not installed"`
  - `clerk update --yes` or `npm install -g clerk`
- Step 2: Sign in — `clerk auth login`
- Step 3: Initialize Clerk — `clerk init` (existing project) or `clerk init --framework next --pm <pm>` (empty dir) or `clerk init --app <application_id>`
- Step 4: Manual fallback — install `@clerk/nextjs`, create middleware calling `clerkMiddleware()`, wrap with `<ClerkProvider>`
- Step 5: Ensure auth controls visible — layout with `ClerkProvider`, `SignInButton`, `SignUpButton`, `Show`, `UserButton` components
- Step 6: Verify setup — `clerk doctor` (health check command that reports issues)
- Step 7: shadcn/ui integration — `npm install @clerk/ui` + `@import '@clerk/ui/themes/shadcn.css'`
- Total: 7 steps

---

### 3. RESEND

#### Node.js Quickstart
- URL: https://resend.com/docs/send-with-nodejs
- Total: 4 steps
- Step 1 title: "Install" — "Get the Resend Node.js SDK." — shows npm/yarn/pnpm/bun install commands
- Step 2 title: "Set your API key" — "Store your API key in an environment variable in your .env file." — `RESEND_API_KEY=re_xxxxxxxxx` format, passed via `process.env.RESEND_API_KEY`
- Step 3 title: "Send email using HTML" — "The easiest way to send an email is by using the html parameter." — complete TypeScript example with init, `resend.emails.send()`, `{ data, error }` destructuring pattern
- Step 4 title: "Try it yourself" — links to 9 example implementations: Express apps, attachments, templates, scheduling, audiences, domains, webhooks, subscription flows

#### API Key Creation UX
- URL: https://resend.com/docs/create-an-api-key
- Steps: Navigate to API keys page → click "Create API Key" button → provide name (max 50 chars) → select permission → optionally restrict to domain
- Permissions: "Sending access" (email-sending only) vs "Full access" (create/delete/get/update any resource) — "can be updated at any time"
- Modal title: "Add API Key modal in the Resend Dashboard"
- Warning microcopy: "For security reasons, you can only view the API Key once."
- Key format starts with: `re_` prefix (visible in env var example)
- Best practice note: store as env var, pass explicitly to constructor rather than relying on automatic availability
- TypeScript-first SDK with full type safety

---

### 4. LEMONSQUEEZY

#### Developer Integration
- URL: https://docs.lemonsqueezy.com/guides/developer-guide/getting-started
- Page returned 403 — details below from search results
- API key creation: navigate to Settings > API → submit form → key shown once → copy and save immediately
- Warning: "never saved in your code or GitHub" — use environment files with regular key rotation
- No separate key format prefix documented in search results

#### Test Mode vs Live
- URL: https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- Default state: stores placed in Test mode
- Toggle location: bottom left of admin panel (vs Stripe's top nav)
- Separate test environment: "separate products, customers and purchases"
- "Simulate event" option in each subscription's side panel to trigger test events
- Going live: create new API key in live mode

---

### 5. COINBASE COMMERCE

- Quickstart URL 404'd (docs.cdp.coinbase.com/commerce/introduction/quickstart)
- From search results:
  - Settings > API Keys → Create new API key → store securely
  - Webhook URL configuration + shared secret for signature verification
  - Step-by-step: account setup (commerce.coinbase.com) → verify business docs → configure name/logo → API key → webhook URL → select accepted cryptocurrencies (including stablecoins like USDC)
  - Endpoints: create charges, manage checkouts, handle webhooks, retrieve transaction data

---

### COMMON DX PATTERNS ACROSS ALL PRODUCTS

#### Pattern 1: "Single snippet" hero / minimal-code claim
- Resend: 4 steps, hero is `resend.emails.send()`
- x402: claims "1 line for the server, 1 function for the client"
- Clerk: "in minutes" claim with CLI scaffolding
- Stripe: 10 steps full environment, but CLI abstracts complexity

#### Pattern 2: API key one-time-view warning
- Stripe: "Save the key value. You can't retrieve it later."
- Resend: "For security reasons, you can only view the API Key once."
- LemonSqueezy: key "shown once" — copy and save immediately
- Universal: env var pattern, never commit to source control

#### Pattern 3: Key format as visual mode indicator
- Stripe `pk_test_` / `sk_test_` vs `pk_live_` / `sk_live_` — prefix encodes mode
- Resend `re_` prefix
- These prefixes allow at-a-glance mode verification in .env files

#### Pattern 4: Test/sandbox mode toggle
- Stripe: top nav toggle (same account, different key prefix); separate Sandboxes option in account picker
- LemonSqueezy: bottom-left toggle; default is test mode
- All products: separate environments prevent accidental live charges during dev

#### Pattern 5: CLI-first quickstart
- Stripe: `stripe login` → `stripe products create` before touching SDK
- Clerk: `clerk init` / `clerk doctor` (health check)
- Pattern: CLI authenticates + scaffolds, then SDK installs to already-configured project

#### Pattern 6: Granular permission scoping
- Resend: "Sending access" vs "Full access" per key
- Stripe: Restricted API Keys (RAKs) with exact permission sets; "reduces risk if the key is compromised"
- Pattern: least-privilege keys labeled as security best practice

#### Pattern 7: Health/observability tab in developer dashboard
- Stripe Workbench: 8 tabs including Health (30-day history) and Errors (with resolution guidance)
- Clerk: `clerk doctor` command for health check
- Pattern: passive monitoring + active diagnostic command

#### Pattern 8: Framework-specific quickstarts with step highlighting
- Clerk: 11 framework quickstarts
- Stripe: 10+ quickstarts
- Pattern: developer selects framework → numbered steps → code highlighted as you scroll

---

## PART B: x402 NETWORK AND ASSET COVERAGE

### Sources consulted
- https://docs.x402.org/core-concepts/network-and-token-support
- https://docs.cdp.coinbase.com/x402/network-support
- https://github.com/coinbase/x402
- https://www.x402.org
- https://www.x402.org/writing/x402-v2-launch
- https://developers.stellar.org/docs/build/agentic-payments/x402
- https://developers.cloudflare.com/agents/agentic-payments/x402
- https://stellar.org/blog/foundation-news/x402-on-stellar

---

### CORRECTING THE "BASE-PRIMARILY" CLAIM

The earlier claim that x402 is primarily Base/USDC is outdated. As of mid-2026:

**Protocol spec (docs.x402.org):** 9 ecosystem types registered; 18 EVM chains with pre-configured default stablecoins; all non-EVM networks (Solana, TON, Algorand, Stellar, Aptos, Hedera, Keeta, Concordium) have default token configurations in the spec.

**Coinbase CDP Facilitator (production, public, free):**
- Base mainnet (`eip155:8453`) — USDC via EIP-3009 — V1 + V2
- Base Sepolia (`eip155:84532`) — USDC — V1 + V2 (testnet)
- Polygon (`eip155:137`) — USDC — V1 + V2
- Arbitrum One (`eip155:42161`) — USDC — V1 + V2
- World (`eip155:480`) — USDC — V1 + V2
- World Sepolia (`eip155:4801`) — testnet
- Solana Mainnet (`solana:5eykt4...`) — USDC SPL — V1 + V2
- Solana Devnet — testnet

**Stellar Facilitator (production, OpenZeppelin Relayer):**
- Mainnet: https://channels.openzeppelin.com/x402 — live as of March 2026
- Testnet: https://channels.openzeppelin.com/x402/testnet
- Token: any SEP-41 compliant; default USDC (7 decimals)
- Also accessible via Coinbase CDP facilitator for Stellar Testnet

**x402.org default facilitator (testnet only — free public):**
- Base Sepolia, Solana Devnet, Stellar Testnet, Aptos Testnet, Hedera Testnet

---

### FULL EVM CHAIN LIST (x402 spec defaults — facilitator-dependent for production)

| Chain | Chain ID | Default Token | Transfer |
|-------|----------|---------------|----------|
| Base | 8453 | USDC | EIP-3009 |
| Base Sepolia | 84532 | USDC | EIP-3009 |
| Polygon | 137 | USDC | EIP-3009 |
| Arbitrum One | 42161 | USDC | EIP-3009 |
| Arbitrum Sepolia | 421614 | USDC | EIP-3009 |
| Monad | 143 | USDC | EIP-3009 |
| Stable (chain) | 988 | USDT0 | EIP-3009 |
| Stable Testnet | 2201 | USDT0 | EIP-3009 |
| MegaETH | 4326 | MegaUSD | Permit2 + EIP-2612 |
| Mezo | 31612 | Mezo USD | Permit2 + EIP-2612 |
| Mezo Testnet | 31611 | Mezo USD | Permit2 + EIP-2612 |
| Radius | 723487 | Stable Coin | Permit2 + EIP-2612 |
| Radius Testnet | 72344 | Stable Coin | Permit2 + EIP-2612 |
| ADI Chain | 36900 | USDC.e | EIP-3009 |
| HPP | 190415 | Bridged USDC | EIP-3009 |
| HPP Sepolia | 181228 | Bridged USDC | EIP-3009 |
| XDC Network | 50 | USDC | EIP-3009 |
| XDC Apothem Testnet | 51 | USDC | EIP-3009 |

Note: Ethereum mainnet (eip155:1), Optimism (eip155:10), Avalanche (eip155:43114) appear in CDP docs as "Reference only" — not active in CDP facilitator.

---

### NON-EVM COVERAGE

| Network | Mainnet Token | Testnet Token | Notes |
|---------|---------------|---------------|-------|
| Solana | USDC SPL | USDC | CDP facilitator covers both |
| TON | USDT (TEP-74) | USDT | Spec registered; no public facilitator yet confirmed |
| Algorand | USDC (ASA) | USDC | Spec registered; testnet via x402.org |
| Stellar | USDC (SEP-41) | USDC | Production via OpenZeppelin; testnet via CDP + OZ |
| Aptos | USDC | USDC | Testnet via x402.org; mainnet facilitator status unclear |
| Hedera | USDC + HBAR | USDC + HBAR | Testnet via x402.org; HBAR is the native token, not a stablecoin |
| Keeta | USDC | USDC | Spec registered; facilitator status unclear |
| Concordium | (not configured) | (not configured) | Protocol-level support only per spec |

---

### STABLECOINS / ASSETS SUPPORTED (BEYOND USDC ON BASE)

- USDC: canonical on Base, Polygon, Arbitrum, World, Solana, Stellar, Algorand, Aptos, Hedera, Keeta (most chains)
- EURC: supported on EVM chains via EIP-3009 (same interface as USDC; both implement transferWithAuthorization)
- USDT0: on "Stable" network (eip155:988)
- USDT: on TON mainnet (TEP-74 standard)
- HBAR: Hedera native token (alongside USDC) — listed explicitly in spec
- MegaUSD: on MegaETH (eip155:4326)
- Mezo USD: on Mezo (eip155:31612)
- USDC.e: on ADI Chain (bridged variant)
- Bridged USDC: on HPP chain (eip155:190415)
- Generic ERC-20: any ERC-20 works on EVM facilitators via EIP-3009 or Permit2
- Solana: any SPL or Token-2022 token supported in protocol
- TON: any TEP-74 jetton
- Algorand: any ASA
- Stellar: any SEP-41 compliant token

---

### SDK PACKAGE STRUCTURE

TypeScript packages in coinbase/x402 repo:
- `@x402/core` — protocol logic
- `@x402/evm` — EVM chain support
- `@x402/svm` — Solana (SVM) support
- `@x402/stellar` — Stellar support
- `@x402/axios` — Axios client wrapper
- `@x402/fastify` — Fastify middleware
- `@x402/fetch` — Fetch wrapper (auto payment handling)
- `@x402/express` — Express middleware
- `@x402/hono` — Hono middleware (Cloudflare Workers)
- `@x402/next` — Next.js support
- `@x402/paywall` — Modular paywall package (V2, extracted)
- `@x402/extensions` — Discovery + service metadata

Python and Go implementations also available in repo.

---

### V2 FEATURES (shipping as of late 2025 / early 2026)

- Multi-chain by default (plugin-driven architecture)
- Reusable wallet sessions (skip full payment flow on repeated access)
- Automatic service discovery (facilitators auto-index available endpoints)
- Dynamic `payTo` routing (per-request routing to addresses, roles, or callbacks)
- Dynamic pricing based on inputs
- Lifecycle hooks for custom logic injection
- `@x402/paywall` extracted as standalone modular package
- Sign-In-With-X (SIWx) wallet identity — listed as "immediate fast-follow launch item" at V2 release (not in initial V2 release)

---

### CLOUDFLARE INTEGRATION NOTE

Cloudflare Agents SDK includes native x402 support:
- Server: `x402-hono` npm package for Hono middleware on Workers
- Client: `@x402/fetch` as Fetch wrapper
- Agents: `agents/x402` MCP client in agents SDK
- Testing: base-sepolia with free test USDC from Circle Faucet
