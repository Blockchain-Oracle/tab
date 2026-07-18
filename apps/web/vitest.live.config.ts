import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["lib/leash/**/*.live.integration.test.ts"],
  },
});
