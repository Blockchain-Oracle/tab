const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`missing ${name}`);
  return value;
}

async function boundedJson(response) {
  if (!response.body) throw new Error("empty response");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("oversized response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function request(url, secretKey) {
  const response = await fetch(url, {
    headers: { "x-magic-secret-key": secretKey },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await boundedJson(response);
  if (!response.ok) throw new Error(`provider preflight returned ${response.status}`);
  return body;
}

function records(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    if (
      value.whitelist_info &&
      typeof value.whitelist_info === "object" &&
      Array.isArray(value.whitelist_info.domains)
    ) {
      return value.whitelist_info.domains.map((domain) => ({
        access_type: "domain",
        value: domain,
      }));
    }
    for (const key of ["data", "providers", "access_whitelist", "items"]) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  throw new Error("provider preflight returned an unknown schema");
}

function providerMatches(provider, expected) {
  return (
    provider &&
    typeof provider === "object" &&
    provider.id === expected.id &&
    provider.issuer === expected.issuer &&
    provider.audience === expected.audience &&
    provider.jwks_uri === expected.jwksUri
  );
}

function allowlisted(entry, appUrl) {
  if (!entry || typeof entry !== "object" || entry.access_type !== "domain") return false;
  if (typeof entry.value !== "string") return false;
  const expected = new URL(appUrl);
  const normalized = entry.value.replace(/\/$/, "").toLowerCase();
  return normalized === expected.origin.toLowerCase() || normalized === expected.host.toLowerCase();
}

const secretKey = required("MAGIC_SECRET_KEY");
const appUrl = required("NEXT_PUBLIC_APP_URL");
const issuer = required("MAGIC_OIDC_ISSUER");
const expectedProvider = {
  audience: required("MAGIC_OIDC_AUDIENCE"),
  id: required("MAGIC_OIDC_PROVIDER_ID"),
  issuer,
  jwksUri: `${issuer}/.well-known/jwks.json`,
};

const [providersBody, allowlistBody] = await Promise.all([
  request("https://tee.express.magiclabs.com/v1/identity/provider", secretKey),
  request("https://api.dashboard.magic.link/v1/admin/access_whitelist", secretKey),
]);
const providerList = records(providersBody);
const allowlist = records(allowlistBody);
const providerExactMatch = providerList.some((provider) =>
  providerMatches(provider, expectedProvider),
);
const productionOriginAllowlisted = allowlist.some((entry) => allowlisted(entry, appUrl));
if (!providerExactMatch || !productionOriginAllowlisted) {
  process.stdout.write(
    `${JSON.stringify({
      providerExactMatch,
      productionOriginAllowlisted,
      providerCount: providerList.length,
    })}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      providerExactMatch: true,
      productionOriginAllowlisted: true,
      providerCount: providerList.length,
    })}\n`,
  );
}
