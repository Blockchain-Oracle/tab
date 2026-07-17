import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const commonJs = require("../dist/index.cjs");
const commonJsUa = require("../dist/ua.cjs");
const modules = await import("../dist/index.js");
const modulesUa = await import("../dist/ua.js");

for (const candidate of [commonJs, modules]) {
  if (typeof candidate.PayButton !== "function") {
    throw new Error("The packaged PayButton export is unavailable");
  }
  if (typeof candidate.CheckoutApiError !== "function") {
    throw new Error("The packaged CheckoutApiError export is unavailable");
  }
  if (typeof candidate.Tab !== "function") {
    throw new Error("The packaged Tab export is unavailable");
  }
  if (typeof candidate.TabApiError !== "function") {
    throw new Error("The packaged TabApiError export is unavailable");
  }
}

for (const candidate of [commonJsUa, modulesUa]) {
  if (typeof candidate.createUniversalAccountClient !== "function") {
    throw new Error("The packaged Universal Account client export is unavailable");
  }
  if (typeof candidate.readAccountSnapshot !== "function") {
    throw new Error("The packaged Universal Account reader export is unavailable");
  }
}
