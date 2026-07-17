import { createHash } from "node:crypto";

export type ResourceIdentityKind = "http_host" | "mcp_resource";

function digest(taggedIdentity: string) {
  return createHash("sha256").update(taggedIdentity).digest("hex");
}

export function canonicalResourceIdentity(resourceUrl: string, resourceHost: string) {
  const url = new URL(resourceUrl);
  if (
    url.toString() !== resourceUrl ||
    url.hostname !== resourceHost ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Resource identity requires a canonical redacted URL");
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return {
      resourceIdentityKind: "http_host" as const,
      resourceKey: digest(`http-host:${resourceHost}`),
    };
  }
  if (url.protocol === "mcp:") {
    return {
      resourceIdentityKind: "mcp_resource" as const,
      resourceKey: digest(`mcp-resource:${resourceUrl}`),
    };
  }
  throw new Error("Unsupported resource identity protocol");
}
