import { CodeBlock } from "../../../../components/code-block";
import { buildTabMcpConfiguration, LEASH_UPSTREAM_PLACEHOLDER } from "./connect-config";
import styles from "./connect-config-panel.module.css";
import { ConnectInstallCards } from "./connect-install-cards";

function snippet(apiBaseUrl: string, upstreamUrl?: string, agentKey?: string | null) {
  return `// .mcp.json\n${JSON.stringify(
    buildTabMcpConfiguration(apiBaseUrl, upstreamUrl, agentKey ?? undefined),
    null,
    2,
  )}`;
}

export function ConnectConfigPanel({
  agentKey = null,
  apiBaseUrl,
  configurationIssue,
}: {
  agentKey?: string | null;
  apiBaseUrl: string | null;
  configurationIssue?: string | null | undefined;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <span>2</span>
        <h2>Point your agent at Tab</h2>
      </div>
      <div className={styles.packageNote}>
        <b>One command, no install</b>
        <span>
          Pick your client — <code>npx</code> fetches <code>@runtab/mcp</code> on demand, and the
          hosted Tab is the default, so the agent key is all it needs.
        </span>
      </div>
      {apiBaseUrl ? <ConnectInstallCards agentKey={agentKey} /> : null}
      {!apiBaseUrl ? (
        <div className={styles.configBlocked} role="status">
          <b>Configuration blocked</b>
          <span>{configurationIssue ?? "The deployed Tab origin is unavailable."}</span>
        </div>
      ) : (
        <div className={styles.modes}>
          <article>
            <h3>Standalone paid_fetch</h3>
            <p>
              With no arguments, Agent exposes one <code>paid_fetch</code> tool for direct HTTP
              requests.
            </p>
            <CodeBlock code={snippet(apiBaseUrl, undefined, agentKey)} lang="json" />
          </article>
          <article>
            <h3>Proxy an existing MCP server</h3>
            <p>
              Pass <code>--upstream</code> with your existing absolute Streamable HTTP MCP URL.
              Replace the explicit placeholder below before use.
            </p>
            <CodeBlock
              code={snippet(apiBaseUrl, LEASH_UPSTREAM_PLACEHOLDER, agentKey)}
              lang="json"
            />
          </article>
        </div>
      )}
    </section>
  );
}
