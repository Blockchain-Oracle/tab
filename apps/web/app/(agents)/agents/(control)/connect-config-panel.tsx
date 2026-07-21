import { buildLeashMcpConfiguration, LEASH_UPSTREAM_PLACEHOLDER } from "./connect-config";
import styles from "./connect-config-panel.module.css";

function snippet(apiBaseUrl: string, upstreamUrl?: string) {
  return `// .mcp.json\n${JSON.stringify(
    buildLeashMcpConfiguration(apiBaseUrl, upstreamUrl),
    null,
    2,
  )}`;
}

export function ConnectConfigPanel({
  apiBaseUrl,
  configurationIssue,
}: {
  apiBaseUrl: string | null;
  configurationIssue?: string | null | undefined;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <span>2</span>
        <h2>Point your agent at Leash</h2>
      </div>
      <div className={styles.packageNote}>
        <b>Package publish pending</b>
        <span>
          The CLI is real in this workspace, but the public npm package is not released yet.
        </span>
      </div>
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
              With no arguments, Leash exposes one <code>paid_fetch</code> tool for direct HTTP
              requests.
            </p>
            <pre>
              <code>{snippet(apiBaseUrl)}</code>
            </pre>
          </article>
          <article>
            <h3>Proxy an existing MCP server</h3>
            <p>
              Pass <code>--upstream</code> with your existing absolute Streamable HTTP MCP URL.
              Replace the explicit placeholder below before use.
            </p>
            <pre>
              <code>{snippet(apiBaseUrl, LEASH_UPSTREAM_PLACEHOLDER)}</code>
            </pre>
          </article>
        </div>
      )}
    </section>
  );
}
