import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RED_MARKER = "[RED: shared state primitives]";
const IMPLEMENTATION_URL = new URL("../src/primitives/index.ts", import.meta.url);
const IMPLEMENTATION_PATH = fileURLToPath(IMPLEMENTATION_URL);

try {
  await access(IMPLEMENTATION_PATH);
} catch (error) {
  if (
    error &&
    typeof error === "object" &&
    error.code === "ENOENT" &&
    error.path === IMPLEMENTATION_PATH
  ) {
    process.stderr.write(`${RED_MARKER}\n`);
    throw new Error("Shared state-primitive implementation exports are absent.", { cause: error });
  }
  throw error;
}
