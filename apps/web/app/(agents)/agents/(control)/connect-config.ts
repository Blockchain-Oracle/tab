export const LEASH_KEY_PLACEHOLDER = "<YOUR_ONE_TIME_KEY>";
export const LEASH_UPSTREAM_PLACEHOLDER = "<ABSOLUTE_STREAMABLE_HTTP_MCP_URL>";

type TabMcpConfiguration = {
  mcpServers: {
    tab: {
      args?: ["--upstream", string];
      command: "tab-mcp";
      env: {
        TAB_API_BASE_URL: string;
        TAB_AGENT_KEY: string;
      };
    };
  };
};

export function buildTabMcpConfiguration(
  apiBaseUrl: string,
  upstreamUrl?: string,
): TabMcpConfiguration {
  return {
    mcpServers: {
      tab: {
        ...(upstreamUrl ? { args: ["--upstream", upstreamUrl] as ["--upstream", string] } : {}),
        command: "tab-mcp",
        env: {
          TAB_API_BASE_URL: apiBaseUrl,
          TAB_AGENT_KEY: LEASH_KEY_PLACEHOLDER,
        },
      },
    },
  };
}

export function resolveTabApiOrigin(value: string | undefined): {
  apiBaseUrl: string | null;
  issue: string | null;
} {
  if (!value) {
    return {
      apiBaseUrl: null,
      issue:
        "NEXT_PUBLIC_APP_URL is not configured. Set it to this deployed app's HTTPS origin before connecting an agent.",
    };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidOrigin();
  }
  const loopbackHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (
    value.trim() !== value ||
    (url.protocol !== "https:" && !loopbackHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    return invalidOrigin();
  }
  return { apiBaseUrl: url.origin, issue: null };
}

function invalidOrigin() {
  return {
    apiBaseUrl: null,
    issue:
      "NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin without credentials, a path, query, or fragment. HTTP is allowed only for explicit loopback development.",
  };
}
