import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message) {
  throw new Error(`packed artifact verification failed: ${message}`);
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? packageDirectory,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== (options.expectedStatus ?? 0)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(
      `${command} ${arguments_.join(" ")} exited ${result.status}${output ? `\n${output}` : ""}`,
    );
  }
  return result;
}

function parsePackManifest(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    fail("pnpm pack --dry-run did not return JSON");
  }
  const manifest = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!manifest || !Array.isArray(manifest.files)) fail("dry-run manifest has no file list");
  return manifest;
}

function verifyPackedPaths(paths) {
  const required = [
    "package.json",
    "dist/cli.js",
    "dist/fetch.js",
    "dist/fetch.d.ts",
    "dist/index.js",
    "dist/index.d.ts",
  ];
  for (const path of required) {
    if (!paths.has(path)) fail(`required file is missing: ${path}`);
  }
  for (const path of paths) {
    if (path !== "package.json" && !path.startsWith("dist/")) {
      fail(`unexpected non-runtime file is packed: ${path}`);
    }
    if (path.endsWith(".map")) fail(`source map is packed: ${path}`);
    if (/(^|[./-])(test|tests|test-support|fixture|fixtures)([./-]|$)/i.test(path)) {
      fail(`test-only file is packed: ${path}`);
    }
  }
}

function verifyPackageContract() {
  const packageJson = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  if (packageJson.private !== true)
    fail("package must remain private while publication is deferred");
  if (packageJson.bin?.["leash-mcp"] !== "./dist/cli.js") fail("leash-mcp bin target changed");
  if (packageJson.exports?.["./fetch"]?.import !== "./dist/fetch.js") {
    fail("@tab/agent/fetch import export is missing");
  }
}

function verifyExternalConsumer(tarballPath, temporaryDirectory) {
  const consumerDirectory = join(temporaryDirectory, "consumer");
  const manifest = {
    name: "tab-agent-packed-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { "@tab/agent": `file:${tarballPath}` },
  };
  mkdirSync(consumerDirectory);
  writeFileSync(join(consumerDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  run("pnpm", ["install", "--ignore-workspace", "--ignore-scripts", "--frozen-lockfile=false"], {
    cwd: consumerDirectory,
  });

  const installedPackage = realpathSync(join(consumerDirectory, "node_modules/@tab/agent"));
  if (installedPackage.startsWith(realpathSync(packageDirectory))) {
    fail("consumer resolved the workspace package instead of the tarball");
  }

  const executable = join(consumerDirectory, "node_modules/.bin/leash-mcp");
  const executableStats = lstatSync(executable);
  if (!executableStats.isFile() && !executableStats.isSymbolicLink()) {
    fail("node_modules/.bin/leash-mcp is not executable content");
  }
  accessSync(executable, fsConstants.X_OK);
  const cli = run(executable, [], {
    cwd: consumerDirectory,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    expectedStatus: 1,
  });
  if (cli.stderr.trim() !== "leash-mcp: LEASH_API_BASE_URL is required.") {
    fail("packed leash-mcp did not start and fail closed on missing configuration");
  }

  const imported = run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "const m=await import('@tab/agent/fetch');if(typeof m.createLeashFetch!=='function')process.exit(2);process.stdout.write('fetch-export-ok')",
    ],
    { cwd: consumerDirectory },
  );
  if (imported.stdout !== "fetch-export-ok")
    fail("@tab/agent/fetch import returned an invalid export");

  const paidE2e = run(
    process.execPath,
    [
      join(packageDirectory, "scripts/packed-paid-e2e.mjs"),
      executable,
      consumerDirectory,
      join(temporaryDirectory, "payment-state"),
    ],
    { cwd: consumerDirectory },
  );
  if (paidE2e.stdout !== "packed paid_fetch restart E2E verified\n") {
    fail("packed leash-mcp did not pass the paid restart E2E");
  }

  const upstreamE2e = run(
    process.execPath,
    [
      join(packageDirectory, "scripts/packed-upstream-restart-e2e.mjs"),
      executable,
      consumerDirectory,
      join(temporaryDirectory, "upstream-payment-state"),
    ],
    { cwd: consumerDirectory },
  );
  if (upstreamE2e.stdout !== "packed upstream restart E2E verified\n") {
    fail("packed leash-mcp did not pass the upstream restart E2E");
  }
}

verifyPackageContract();
run("pnpm", ["run", "build"]);
const dryRun = run("pnpm", ["pack", "--dry-run", "--json"]);
const packManifest = parsePackManifest(dryRun.stdout);
verifyPackedPaths(new Set(packManifest.files.map(({ path }) => path)));

const temporaryDirectory = mkdtempSync(join(tmpdir(), "tab-agent-pack-"));
try {
  const tarballPath = join(temporaryDirectory, "tab-agent.tgz");
  run("pnpm", ["pack", "--out", tarballPath]);
  verifyExternalConsumer(tarballPath, temporaryDirectory);
  process.stdout.write(
    `packed artifact verified: ${packManifest.files.length} files; leash-mcp executable; paid and upstream restart E2E; @tab/agent/fetch import\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
