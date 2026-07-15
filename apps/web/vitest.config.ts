import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
