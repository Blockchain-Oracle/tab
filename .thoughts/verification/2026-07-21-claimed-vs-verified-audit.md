# Gap Audit — Claimed vs Verified

Date: 2026-07-21
Branch: `codex/tab-experience-rebuild`
Method: read intent sources (surface map, stories, spec, DECISIONS, README), then verified
each user-visible claim against the **actual source** in `apps/site`, `apps/docs`, `apps/web`,
`apps/agent`, `packages/sdk` — plus the live npm registry for what is actually published.
`Reference/` and `node_modules` excluded. Every finding carries `file:line`.

Categories: **A WRONG** (factually incorrect on a live surface) · **B STALE** (was true, no
longer is) · **C INCONSISTENT** (two surfaces disagree) · **D UNVERIFIED CLAIM** (asserted done,
no code evidence) · **E MISSING** (spec/story requires it, not implemented).

Ground-truth facts established this pass:
- `@runtab/sdk@0.0.1` **is published on npm** (`npm view @runtab/sdk version` → `0.0.1`).
- `@runtab/mcp@0.0.1` **is published on npm**, bin = `{ "tab-mcp": "dist/cli.js" }`.
- The real MCP binary name is **`tab-mcp`** (`apps/agent/package.json` bin, and npm).
- Agent env vars are **`TAB_API_BASE_URL`** and **`TAB_AGENT_KEY`** (`apps/agent/src/cli-config.ts:32,45`).
- Money-movers remain legitimately BLOCKED pending the funded spike (`DECISIONS.md:53`) — so the
  README's "money paths blocked" paragraph is **accurate**, not stale.

---

## A — Landing page (`apps/site`, live: runtab.xyz) — HIGHEST user-visible impact

The marketing site's Developer section is the single worst surface: a developer who copies the
agent snippet gets a config that **cannot run**.

- **[A-WRONG] `apps/site/components/developer-section.tsx:14`** — agent `mcp.json` snippet uses
  `"command": "tab-agent"`. The real published binary is **`tab-mcp`**. Copy-pasting this yields
  `command not found: tab-agent`. Both other surfaces are correct: `apps/docs/content/docs/agents.mdx:53`
  and `apps/web/app/(agents)/agents/(control)/connect-config.ts:25` use `"tab-mcp"`. → also a
  **C-INCONSISTENT** (site disagrees with docs + app + npm).
- **[A-WRONG] `apps/site/components/developer-section.tsx:16`** — `"TAB_API_BASE_URL": "https://app.example.com"`.
  Placeholder domain shipped as if real; the live app origin is `https://app.runtab.xyz`
  (docs quickstart already uses `app.runtab.xyz`, `apps/docs/content/docs/quickstart.mdx:58`).
- **[B-STALE] `apps/site/components/developer-section.tsx:45`** — "Drop-in email checkout.
  **Package publication pending.**" `@runtab/sdk` is live on npm. False on the landing page.
- **[E-MISSING] `apps/site/components/developer-section.tsx:11-21`** — the agent snippet shows a
  bare `command` with no install step and no `--upstream` proxy mode. Docs (`agents.mdx:44`) and
  the app (`connect-config-panel.tsx:48-56`) both document `npm install -g @runtab/mcp` and the
  `--upstream` option; the landing page omits both, so a reader can't tell where the binary comes from.

## B — Docs (`apps/docs`, live: docs.runtab.xyz) — HIGH impact

- **[B-STALE / C-INCONSISTENT] `apps/docs/content/docs/quickstart.mdx:16-19`** — Callout: "Package
  publication is still pending — inside the monorepo, use the workspace package." Directly
  contradicts its own line 13 (`npm install @runtab/sdk`) and `agents.mdx:44`
  (`npm install -g @runtab/mcp`). The package is published; remove the callout.

`apps/docs/content/docs/agents.mdx` is **correct** (verified): `tab-mcp`, `@runtab/mcp`, install
shown, env vars right. Use it as the template when fixing the site.

## C — App (`apps/web`, live: app.runtab.xyz) — MEDIUM impact

- **[B-STALE] `apps/web/app/(agents)/agents/(control)/connect-config-panel.tsx:26-29`** — "**Package
  publish pending** — the public npm package is not released yet." `@runtab/mcp` is released.
- **[D-UNVERIFIED / test-locks-stale] `apps/web/app/(agents)/agents/(control)/connect-agent.test.tsx:58`** —
  a test asserts `toContain("Package publish pending")`, so the stale copy is guarded by a passing
  test. Fixing the copy requires updating this assertion; until then the test actively defends a
  false statement.

## D — README (repo root / GitHub — high visibility for judges & devs)

- **[B-STALE] `README.md:43-45`** — "**Phase 1 foundation is scaffolded** and locally verified…
  **Product behavior begins in Phase 2.**" The web app ships **26 `page.tsx` routes** across merchant
  dashboard, buyer checkout, agent control plane, mobile PWA, plus separate marketing and docs apps.
  Product behavior is far past Phase 2. (The following paragraph about blocked money paths is
  accurate — keep it; only the phase framing is stale.)
- **[A-WRONG] `README.md` repository map (`apps/` block, ~lines 63-68)** — lists `apps/mobile/`
  which **does not exist** (`ls apps/mobile` → No such file; the PWA lives at `apps/web/app/mobile`),
  and **omits the real `apps/site` (marketing) and `apps/docs` apps entirely.**

## E — Internal docs (low user impact, same error class)

- **[A-WRONG] `CLAUDE.md` Stack section** — `apps/mobile — PWA monitor …`. No such app; mobile is
  under `apps/web/app/mobile`. Also omits `apps/site` and `apps/docs`. Internal, but it's the same
  wrong mental model that produced the README map error, so worth correcting together.

---

## Verified-GOOD (claims that hold up)

- Env var names consistent across all four surfaces (site/docs/app/agent): `TAB_API_BASE_URL`,
  `TAB_AGENT_KEY`.
- Published package names match code and npm: `@runtab/sdk`, `@runtab/mcp` (both `0.0.1`, both live).
- **No "Leash" brand leaks in user-visible copy** — `apps/site/components` and `apps/docs/content`
  are clean; remaining `leash` hits in `apps/web` are internal identifiers (`lib/leash/*`,
  `LEASH_UPSTREAM_PLACEHOLDER` which renders as `<ABSOLUTE_STREAMABLE_HTTP_MCP_URL>`, `leash-owner-email`
  htmlFor id) — never shown to users.
- Site header now links to **Docs** (`site-header.tsx:27`) and the signup CTA is present in the hero
  and CTA sections (`hero.tsx:46`, `cta-section.tsx:14`). (An earlier read this session showed the
  header without a Docs link; it appears to have been fixed mid-audit — current source is correct.)
- `apps/docs/content/docs/agents.mdx` is fully correct and can seed the site fix.
- Three demo-critical flows have real routes present (checkout, agent control/connect, mobile
  revocation controls) — route scaffolding exists; deep behavior not re-verified in this pass.

---

## Prioritized fix list (top 10)

1. `apps/site/components/developer-section.tsx:14` — `tab-agent` → `tab-mcp`.
2. `apps/site/components/developer-section.tsx:16` — `https://app.example.com` → `https://app.runtab.xyz`.
3. `apps/site/components/developer-section.tsx:45` — delete "Package publication pending."
4. `apps/site/components/developer-section.tsx:11-21` — add `npm install -g @runtab/mcp` and the
   `--upstream` proxy note so the snippet matches `agents.mdx`.
5. `apps/docs/content/docs/quickstart.mdx:16-19` — remove the "publication is still pending" callout.
6. `apps/web/app/(agents)/agents/(control)/connect-config-panel.tsx:26-29` — remove "Package publish pending" note.
7. `apps/web/app/(agents)/agents/(control)/connect-agent.test.tsx:58` — update the assertion paired with fix #6 (otherwise the test defends the stale copy).
8. `README.md:43-45` — rewrite the Status "Phase 1 / Phase 2" framing to reflect the shipped product; keep the accurate money-blocked paragraph.
9. `README.md` repo map — replace `apps/mobile/` with `apps/web/app/mobile` note; add `apps/site` and `apps/docs`.
10. `CLAUDE.md` Stack list — fix the `apps/mobile` line and add `apps/site` / `apps/docs`.

## Honest summary

Overall claimed-vs-verified health is **good on the deep product, weak on the top-of-funnel copy**.
The engineering is real and internally consistent — env vars, package names, the app, and the docs
agents page all agree with each other and with what's actually published on npm; there are no
"Leash" brand leaks in user-facing text. The failures are concentrated in the exact place a
first-time developer or judge lands: the **marketing site's Developer snippet is factually broken**
(wrong binary name `tab-agent`, placeholder `app.example.com`, a false "publication pending" note),
and a set of "package publish pending" claims across the site, docs quickstart, and app are stale
now that both packages are published — one of them locked in place by a passing test. The README
compounds this by describing a "Phase 1 scaffold" that is really a 26-route product and by mapping
apps that don't exist while omitting the two apps a visitor actually browses. None of these are hard
fixes; all ten are copy/config edits, and `docs/agents.mdx` already contains the correct text to
copy from.
