import { constants } from "node:fs";
import { access } from "node:fs/promises";

const RED_MARKER = "[RED: motion policy]";
const implementationUrl = new URL("../src/flowline/stage-flowline.tsx", import.meta.url);

try {
  await access(implementationUrl, constants.R_OK);
} catch (error) {
  process.stderr.write(`${RED_MARKER}\n`);
  throw new Error("The semantic Flowline implementation is absent.", { cause: error });
}
