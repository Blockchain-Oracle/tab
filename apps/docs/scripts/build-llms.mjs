// Generates llms.txt (index) and llms-full.txt (all content) from content/docs,
// so AI agents can consume the documentation directly.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const contentDir = path.join(root, "content/docs");
const site = process.env.NEXT_PUBLIC_DOCS_ORIGIN ?? "http://localhost:3002";

const pages = [];
for await (const entry of glob("**/*.mdx", { cwd: contentDir })) {
  const raw = readFileSync(path.join(contentDir, entry), "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/u);
  const title = fm?.[1].match(/^title:\s*(.+)$/mu)?.[1] ?? entry;
  const description = fm?.[1].match(/^description:\s*(.+)$/mu)?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/u, "").trim();
  const slug = entry.replace(/\.mdx$/u, "").replace(/(^|\/)index$/u, "");
  const url = `${site}/docs${slug ? `/${slug}` : ""}`;
  pages.push({ body, description, entry, title, url });
}
pages.sort((a, b) => a.entry.localeCompare(b.entry));

const index = [
  "# Tab",
  "",
  "> Invisible payments — for you, and for your AI. Humans check out with an email; AI agents pay x402 under a hard cap enforced outside the model. One rail, shared receipts.",
  "",
  "## Docs",
  "",
  ...pages.map((page) => `- [${page.title}](${page.url}): ${page.description}`),
].join("\n");

const full = pages
  .map((page) => `# ${page.title}\nURL: ${page.url}\n${page.description}\n\n${page.body}`)
  .join("\n\n---\n\n");

for (const dir of ["public", ".next/static"]) {
  const target = path.join(root, dir);
  if (!existsSync(target)) continue;
  writeFileSync(path.join(target, "llms.txt"), `${index}\n`);
  writeFileSync(path.join(target, "llms-full.txt"), `${full}\n`);
}

console.log(`llms.txt: ${pages.length} pages indexed`);
