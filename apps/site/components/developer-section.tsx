import type { CSSProperties } from "react";

import { Reveal } from "./reveal";

/** One colored token: `c` is a `tok-*` class from sections.css, absent = plain. */
type Token = { t: string; c?: string };

/** Hand-tokenized so the palette stays ours — no highlighter dependency. */
const PAY_BUTTON_LINES: Token[][] = [
  [
    { t: "import", c: "tok-kw" },
    { t: " { " },
    { t: "PayButton", c: "tok-cmp" },
    { t: " } " },
    { t: "from", c: "tok-kw" },
    { t: " " },
    { t: '"@runtab/sdk"', c: "tok-str" },
    { t: ";" },
  ],
  [],
  [{ t: "<" }, { t: "PayButton", c: "tok-cmp" }],
  [{ t: "  publishableKey", c: "tok-prop" }, { t: "=" }, { t: '"pk_test_…"', c: "tok-str" }],
  [{ t: "  intentUrl", c: "tok-prop" }, { t: "=" }, { t: '"/api/intent"', c: "tok-str" }],
  [
    { t: "  onSuccess", c: "tok-prop" },
    { t: "={(transactionId) " },
    { t: "=>", c: "tok-kw" },
    { t: " done(transactionId)}" },
  ],
  [{ t: "/>" }],
];

const AGENT_LINES: Token[][] = [
  [{ t: "{" }],
  [{ t: '  "mcpServers"', c: "tok-prop" }, { t: ": {" }],
  [{ t: '    "tab"', c: "tok-prop" }, { t: ": {" }],
  [{ t: '      "command"', c: "tok-prop" }, { t: ": " }, { t: '"npx"', c: "tok-str" }, { t: "," }],
  [
    { t: '      "args"', c: "tok-prop" },
    { t: ": [" },
    { t: '"-y"', c: "tok-str" },
    { t: ", " },
    { t: '"@runtab/mcp"', c: "tok-str" },
    { t: "]," },
  ],
  [{ t: '      "env"', c: "tok-prop" }, { t: ": {" }],
  [
    { t: '        "TAB_AGENT_KEY"', c: "tok-prop" },
    { t: ": " },
    { t: '"agent_sk_…"', c: "tok-str" },
  ],
  [{ t: "      }" }],
  [{ t: "    }" }],
  [{ t: "  }" }],
  [{ t: "}" }],
];

/** ids fixed at module scope so render keys never come from a map index. */
function withIds(prefix: string, lines: Token[][]) {
  return lines.map((tokens, index) => ({
    id: `${prefix}-${index}`,
    index,
    tokens: tokens.map((token, at) => ({ ...token, id: `${prefix}-${index}-${at}` })),
  }));
}

const PAY_BUTTON_CODE = withIds("pay", PAY_BUTTON_LINES);
const AGENT_CODE = withIds("mcp", AGENT_LINES);

function CodeBlock({ lines }: { lines: typeof PAY_BUTTON_CODE }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: horizontally scrollable code region needs keyboard access
    <pre className="dev-code mono" tabIndex={0}>
      <code>
        {lines.map((line) => (
          <span
            className="dev-code-line"
            key={line.id}
            style={{ "--code-line": line.index } as CSSProperties}
          >
            {line.tokens.map((token) =>
              token.c ? (
                <span className={token.c} key={token.id}>
                  {token.t}
                </span>
              ) : (
                token.t
              ),
            )}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Developer surface: the two integrations, verbatim shapes from the docs. */
export function DeveloperSection() {
  return (
    <section
      aria-labelledby="developers-title"
      className="band band-ink developer-band"
      id="developers"
    >
      <div className="container">
        <p className="eyebrow">Developers</p>
        <h2 className="section-title" id="developers-title">
          A component for people.
          <br />A config for agents.
        </h2>

        <div className="dev-grid">
          <Reveal className="reveal dev-panel" delayMs={0}>
            <p className="dev-panel-title mono">checkout.tsx</p>
            <CodeBlock lines={PAY_BUTTON_CODE} />
            <p className="dev-panel-note">
              Drop-in email checkout. <span className="mono">npm install @runtab/sdk</span>
            </p>
          </Reveal>

          <Reveal className="reveal dev-panel" delayMs={140}>
            <p className="dev-panel-title mono">mcp.json</p>
            <CodeBlock lines={AGENT_CODE} />
            <p className="dev-panel-note">
              No install — <span className="mono">npx</span> fetches it. Point any MCP client at
              Tab. The agent pays x402 bills within its cap.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
