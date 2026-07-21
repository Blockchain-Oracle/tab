import type { ReactNode } from "react";

import styles from "./code-block.module.css";

export type CodeLang = "json" | "ts" | "shell" | "http" | "text";

type TokenClass = "cmt" | "key" | "kw" | "num" | "str";

/** Ordered regex rules per language. First match at each position wins. */
const RULES: Record<Exclude<CodeLang, "text">, [TokenClass, RegExp][]> = {
  http: [["key", /^[A-Za-z][A-Za-z0-9-]*(?=:)/]],
  json: [
    ["cmt", /^\/\/[^\n]*/],
    ["key", /^"(?:[^"\\]|\\.)*"(?=\s*:)/],
    ["str", /^"(?:[^"\\]|\\.)*"/],
    ["kw", /^(?:true|false|null)\b/],
    ["num", /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/],
  ],
  shell: [
    ["cmt", /^#[^\n]*/],
    ["str", /^(?:"(?:[^"\\]|\\.)*"|'[^']*')/],
    ["kw", /^(?:npm|npx|pnpm|node|install|curl)\b/],
    ["num", /^--?[A-Za-z][\w-]*/],
  ],
  ts: [
    ["cmt", /^\/\/[^\n]*/],
    ["str", /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/],
    [
      "kw",
      /^(?:import|from|export|const|let|return|await|async|function|new|if|else|throw|type|interface)\b/,
    ],
    ["num", /^-?\d+(?:\.\d+)?/],
    ["key", /^[A-Za-z_$][\w$]*(?=\s*[:=]\s*["'`{[])/],
  ],
};

const WORD = /^(?:[\w$]+|\s+|[^\w$\s])/;

function tokenize(code: string, lang: CodeLang): ReactNode[] {
  if (lang === "text") return [code];

  const rules = RULES[lang];
  const out: ReactNode[] = [];
  let plain = "";
  let at = 0;

  while (at < code.length) {
    const rest = code.slice(at);
    const hit = rules.map(([cls, re]) => ({ cls, match: re.exec(rest)?.[0] })).find((r) => r.match);

    if (hit?.match) {
      if (plain) {
        out.push(plain);
        plain = "";
      }
      out.push(
        <span className={styles[hit.cls]} key={at}>
          {hit.match}
        </span>,
      );
      at += hit.match.length;
      continue;
    }

    const step = WORD.exec(rest)?.[0] ?? rest[0] ?? "";
    plain += step;
    at += step.length;
  }

  if (plain) out.push(plain);
  return out;
}

/**
 * The one code-block treatment: canvas panel, ink-on-ink in dark mode,
 * warm-white primary text, hand-rolled token colors from the brand palette.
 * Scrollable, selectable, keyboard-focusable.
 */
export function CodeBlock({ code, lang = "text" }: { code: string; lang?: CodeLang }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: horizontally scrollable code region needs keyboard access
    <pre className={styles.block} tabIndex={0}>
      <code>{tokenize(code, lang)}</code>
    </pre>
  );
}
