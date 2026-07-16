import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const commonJs = require("../dist/index.cjs");
const modules = await import("../dist/index.js");

for (const candidate of [commonJs, modules]) {
  if (typeof candidate.PayButton !== "function") {
    throw new Error("The packaged PayButton export is unavailable");
  }
  if (typeof candidate.CheckoutApiError !== "function") {
    throw new Error("The packaged CheckoutApiError export is unavailable");
  }
}
