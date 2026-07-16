import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
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
  splitting: false,
  target: "es2022",
  treeshake: true,
});
