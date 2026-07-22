// Diagnostic: reproduce the exact TEE wallet call the app makes.
// Run from apps/web. Reads .env.local. Deleted after diagnosis.
import { readFileSync } from "node:fs";
import { createPrivateKey, randomBytes } from "node:crypto";
import { SignJWT } from "jose";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const key = createPrivateKey({
  format: "der",
  key: Buffer.from(env.MAGIC_OIDC_PRIVATE_KEY_B64, "base64"),
  type: "pkcs8",
});

const now = Math.floor(Date.now() / 1000);
const subject = `agent_${randomBytes(32).toString("base64url")}`;
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "RS256", kid: env.MAGIC_OIDC_KEY_ID, typ: "JWT" })
  .setIssuer(env.MAGIC_OIDC_ISSUER)
  .setAudience(env.MAGIC_OIDC_AUDIENCE)
  .setSubject(subject)
  .setIssuedAt(now - 5)
  .setExpirationTime(now - 5 + 300)
  .sign(key);

console.log("subject:", subject);
console.log("claims:", { iss: env.MAGIC_OIDC_ISSUER, aud: env.MAGIC_OIDC_AUDIENCE, kid: env.MAGIC_OIDC_KEY_ID });

for (const path of ["/v2/wallet", "/v1/wallet"]) {
  const res = await fetch(`https://tee.express.magiclabs.com${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
      "x-magic-chain": "ETH",
      "x-magic-secret-key": env.MAGIC_SECRET_KEY,
      "x-oidc-provider-id": env.MAGIC_OIDC_PROVIDER_ID,
    },
    body: "{}",
  });
  const body = await res.text();
  console.log(`\n${path} → ${res.status}`);
  console.log(body.slice(0, 800));
  if (res.ok) break;
}
