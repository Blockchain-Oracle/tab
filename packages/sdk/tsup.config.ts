import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: { index: "src/index.ts", showcase: "src/showcase.ts", ua: "src/ua.ts" },
  external: [
    "@particle-network/universal-account-sdk",
    "magic-sdk",
    "react",
    "react/jsx-runtime",
    "viem",
    "viem/utils",
  ],
  format: ["esm", "cjs"],
  platform: "browser",
  sourcemap: true,
  splitting: true,
  target: "es2022",
  treeshake: true,
});
