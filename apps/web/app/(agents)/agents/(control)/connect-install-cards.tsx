"use client";

import Image from "next/image";
import { useState } from "react";

import styles from "./connect-install-cards.module.css";

const KEY_PLACEHOLDER = "<YOUR_ONE_TIME_KEY>";

/** Per-client one-liners. The hosted control plane is the CLI default, so
 * commands stay short: only the agent key is required. */
function commands(key: string) {
  return [
    {
      command: `claude mcp add tab -e TAB_AGENT_KEY=${key} -- npx -y @runtab/mcp`,
      id: "claude-code",
      logo: "/marks/clients/claude.svg",
      name: "Claude Code",
    },
    {
      command: `codex mcp add tab --env TAB_AGENT_KEY=${key} -- npx -y @runtab/mcp`,
      id: "codex",
      logo: "/marks/clients/codex.svg",
      name: "Codex CLI",
    },
    {
      command: `gemini mcp add tab -e TAB_AGENT_KEY=${key} npx -y @runtab/mcp`,
      id: "gemini",
      logo: "/marks/clients/gemini.svg",
      name: "Gemini CLI",
    },
  ] as const;
}

function cursorDeeplink(key: string) {
  const config = btoa(
    JSON.stringify({ args: ["-y", "@runtab/mcp"], command: "npx", env: { TAB_AGENT_KEY: key } }),
  );
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=tab&config=${encodeURIComponent(config)}`;
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={styles.commandButton}
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      type="button"
    >
      <code>{command}</code>
      <span className={styles.copyBadge}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * One-tap installs for the clients people actually use. When the one-time
 * key is in memory (just generated) it is embedded directly — paste one
 * command and the agent can pay.
 */
export function ConnectInstallCards({ agentKey }: { agentKey: string | null }) {
  const key = agentKey ?? KEY_PLACEHOLDER;

  return (
    <div className={styles.cards}>
      {commands(key).map((client) => (
        <div className={styles.card} key={client.id}>
          <div className={styles.client}>
            <Image alt="" className={styles.logo} height={18} src={client.logo} width={18} />
            <b>{client.name}</b>
          </div>
          <CopyCommand command={client.command} />
        </div>
      ))}
      <div className={styles.card}>
        <div className={styles.client}>
          <Image
            alt=""
            className={styles.logo}
            height={18}
            src="/marks/clients/cursor.svg"
            width={18}
          />
          <b>Cursor</b>
        </div>
        <a className={styles.deeplink} href={cursorDeeplink(key)}>
          Add to Cursor →
        </a>
      </div>
      {agentKey ? null : (
        <p className={styles.keyNote}>
          Generate your key above and these commands fill in automatically — the key is shown once.
        </p>
      )}
    </div>
  );
}
