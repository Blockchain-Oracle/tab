import { createRequire } from "node:module";

// The MCP handshake reports the real published version — never a hardcoded
// string that drifts from package.json at publish time.
const require = createRequire(import.meta.url);
export const TAB_MCP_VERSION: string = require("../package.json").version;
