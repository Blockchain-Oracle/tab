# Reality Brief — OpenRouter

**Date:** 2026-07-02 · **Author:** Research agent · **Status:** Verified facts only

---

## Scope

OpenRouter as a backend LLM gateway for a product where the end user picks their own model
(Claude / GPT / Gemini / etc.). Covers: what OpenRouter is, model catalog and ID format,
per-request user-selectable model mechanics, pricing/billing, TypeScript + Vercel AI SDK
integration, rate limits, and hackathon-relevant caveats.

---

## Sources Checked

- `https://openrouter.ai/` (homepage, July 2026)
- `https://openrouter.ai/pricing` (pricing page, July 2026)
- `https://openrouter.ai/docs/quickstart` (quickstart docs, July 2026)
- `https://ai-sdk.dev/providers/community-providers/openrouter` (Vercel AI SDK docs, July 2026)
- `https://tokenmix.ai/blog/openrouter-api` (third-party API overview, July 2026)
- Web search: "OpenRouter AI API unified gateway model catalog pricing 2026"
- Web search: "OpenRouter @openrouter/ai-sdk-provider Vercel AI SDK TypeScript setup"
- npm: `@openrouter/ai-sdk-provider`
- GitHub: `OpenRouterTeam/ai-sdk-provider`

---

## Verified Facts

### What OpenRouter is

OpenRouter is a unified API gateway — a single OpenAI-compatible HTTP endpoint
(`https://openrouter.ai/api/v1`) that routes requests to 70+ upstream providers
(Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, xAI, and more). Developers use one
API key and one credit balance instead of managing accounts per provider. It handles
automatic fallback: if the primary provider is down or rate-limited, it retries an alternate
provider transparently.

Scale as of July 2026: **400+ models**, **70+ providers**, **100 trillion tokens/month**
processed, **10M+ global users** (all from the OpenRouter homepage).

### Model catalog and ID format

Model IDs follow the pattern `{provider-slug}/{model-slug}`, e.g.:

- `anthropic/claude-opus-4.8`
- `anthropic/claude-sonnet-4.6`
- `openai/gpt-5.5`
- `openai/gpt-5.2`
- `google/gemini-3.1-pro-preview`
- `google/gemini-3-flash-preview`
- `meta-llama/llama-3.1-405b-instruct`
- `openai/text-embedding-3-small` (embedding model)

The full browsable catalog is at `https://openrouter.ai/models`. A programmatic list of all
model slugs is also available via the API.

### How end-user model selection works in practice

**The mechanism is: you pass the model ID as a string per request. That is the entire
mechanism.** There is no global lock; each API call takes a `model` field.

With the Vercel AI SDK provider (`@openrouter/ai-sdk-provider`):

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText } from 'ai';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// To switch models, change this string — nothing else changes:
const result = await generateText({
  model: openrouter.chat('anthropic/claude-sonnet-4.6'),
  prompt: 'Hello',
});
```

For a product with user-selectable models: the product maintains a dropdown of model ID
strings. The user's selection is passed as the `model` argument on each request. The server
does not need to reinitialize a client; the `openrouter` instance is reusable across all
models.

With `streamText` for streaming responses:

```typescript
const result = streamText({
  model: openrouter.chat(userSelectedModelId), // e.g. 'openai/gpt-5.5'
  prompt: userPrompt,
});
```

**Confirmed:** this is the idiomatic pattern. The Vercel AI SDK docs state "switch between
hundreds of models without changing your code or managing multiple API keys."

### Pricing and billing model

- **Token pricing:** Passthrough — OpenRouter does not mark up provider pricing. The rate per
  token in the model catalog matches what providers charge directly.
- **Platform fee:** 5.5% on credit purchases (pay-as-you-go). A $100 credit purchase yields
  ~$94.50 of inference credits.
- **Credits system:** Prepaid credit balance. Buy credits; they are consumed per token as you
  call models. Auto-top-up is available. No subscriptions or per-model contracts.
- **Enterprise:** Volume commitments, custom fee discounts, negotiable.
- **Free models:** 25+ models available at $0/token. These have strict rate limits (see below).
- **BYOK (Bring Your Own Key):** Available. You link your own provider keys to OpenRouter.
  Pay-as-you-go users get 1M free requests/month via BYOK; after that, a 5% fee applies.
  Enterprise users get 5M free requests/month. BYOK gives provider-side billing control.

### TypeScript + Vercel AI SDK integration (minimal setup)

**Package:** `@openrouter/ai-sdk-provider`  
**Install:** `pnpm add @openrouter/ai-sdk-provider`

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText } from 'ai';

// Initialize once (reusable across all model IDs):
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Chat model:
openrouter.chat('anthropic/claude-sonnet-4.6')

// Completion model:
openrouter.completion('meta-llama/llama-3.1-405b-instruct')

// Embedding model:
openrouter.textEmbeddingModel('openai/text-embedding-3-small')
```

The provider is fully compatible with all Vercel AI SDK primitives (`generateText`,
`streamText`, `generateObject`, `streamObject`). No other configuration is needed for
basic usage. Model-specific parameters (temperature, top-p, etc.) are passed via
`providerOptions` or `extraBody`.

### Rate limits

- **Free tier (no credits):** 50 requests/day, 20 requests/minute.
- **Pay-as-you-go (with $10+ credits):** 1,000 requests/day on free models, 20 RPM. No
  stated platform-level cap on paid models — upstream provider limits apply.
- **Paid models:** OpenRouter does not impose its own RPM ceiling beyond provider upstream
  limits. Throttling comes from the upstream provider.
- **BYOK:** When using your own provider keys, rate limits are governed by your agreement
  with the upstream provider, not OpenRouter's platform limits.

### How user-selectable models would work in our product

The product needs:
1. A static or API-fetched list of model IDs (e.g. from `openrouter.ai/models`).
2. A UI dropdown (or settings page) where the user picks a model ID.
3. The server reads the selected model ID and passes it as the `model` string to
   `openrouter.chat(selectedModelId)` on each LLM call.
4. One OpenRouter API key on the server; one credit balance; one SDK instance.

No per-model initialization, no per-provider credential swap, no code-path branching.
Switching from Claude to GPT-5 to Gemini is a string substitution.

---

## Inferences

- The 5.5% platform fee is low enough to be invisible in a hackathon or early-product
  context; it is only relevant at significant token volume.
- The BYOK option is useful if the product wants to let **power users** supply their own
  Anthropic/OpenAI key (passing cost to them), though this adds complexity and is not
  necessary for the hackathon build.
- Fallback routing (the `models` array param) is more useful for production reliability
  than for a hackathon demo, but worth knowing exists.
- The 20 RPM cap on free-tier and free-model requests is a real constraint for a demo
  with concurrent users hitting free models.

---

## Unknowns and Questions

- **Exact model availability at demo time:** The model catalog changes (models are added,
  deprecated, versioned). The list should be fetched dynamically or confirmed at build time,
  not hardcoded from this brief.
- **Latency overhead:** OpenRouter adds a routing hop. The tokenmix source does not quantify
  the added latency. For streaming, this is likely imperceptible; for first-token latency,
  there may be a measurable margin vs. calling providers directly. Not quantified here.
- **Per-model provider options:** Some models accept provider-specific parameters that may
  require `extraBody` configuration not covered in the basic setup above.
- **Context-window limits per model:** Each model has its own max context. If the product
  lets users swap models mid-session, context truncation must be handled by the product,
  not OpenRouter.
- **Free model list stability:** The 25+ free models can change. Build the free-model list
  from the live API, not a snapshot.

---

## Not Included

- Specific per-token pricing for individual models (changes frequently; use `openrouter.ai/pricing`).
- OpenRouter's model comparison / ranking / arena features (not relevant to the integration).
- Agent SDK (`@openrouter/agent`) — separate package for agentic tool use; not evaluated here.
- Any OpenRouter features beyond LLM inference (image models, audio, etc.).
- Self-hosting or on-prem options (none found; OpenRouter is SaaS only).
