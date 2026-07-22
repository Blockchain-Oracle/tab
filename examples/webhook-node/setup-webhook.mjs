// One command to register your webhook endpoint with Tab.
// Usage: TAB_SECRET_KEY=sk_test_… WEBHOOK_URL=https://your-host/webhooks node setup-webhook.mjs
import { Tab } from "@runtab/sdk";

const url = process.env.WEBHOOK_URL;
if (!url) {
  console.error("Set WEBHOOK_URL to your publicly reachable webhook endpoint.");
  process.exit(1);
}

const tab = new Tab(process.env.TAB_SECRET_KEY, {
  apiBaseUrl: process.env.TAB_API_BASE_URL ?? "https://app.runtab.xyz",
});

const { endpoint, signingSecret } = await tab.webhooks.configure({ url });

console.log(`✓ webhook endpoint set: ${endpoint.url} (env: ${endpoint.env})`);
if (signingSecret) {
  console.log("\nYour signing secret — shown ONCE, store it now:");
  console.log(`  TAB_WEBHOOK_SECRET=${signingSecret}\n`);
} else {
  console.log(`URL updated. Existing signing secret (…${endpoint.secretLast4}) unchanged.`);
}

const test = await tab.webhooks.sendTest();
console.log(
  test.delivered ? "✓ signed test delivery got a 2xx" : "⚠ test delivery did not get a 2xx yet",
);
