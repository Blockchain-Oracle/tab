import { describe, expect, it } from "vitest";

import { readBaseSepoliaRpcUrl } from "./x402-testnet-rpc";

describe("explicit Base Sepolia settlement RPC", () => {
  it("requires an explicitly configured HTTPS RPC without credentials", () => {
    expect(() => readBaseSepoliaRpcUrl({})).toThrow("missing");
    expect(() => readBaseSepoliaRpcUrl({ BASE_SEPOLIA_RPC_URL: "http://rpc.example" })).toThrow(
      "HTTPS",
    );
    expect(() =>
      readBaseSepoliaRpcUrl({ BASE_SEPOLIA_RPC_URL: "https://user:secret@rpc.example" }),
    ).toThrow("credentials");
  });

  it("keeps provider path and query material opaque", () => {
    expect(
      readBaseSepoliaRpcUrl({
        BASE_SEPOLIA_RPC_URL: "https://rpc.example/provider-path?key=opaque",
      }),
    ).toBe("https://rpc.example/provider-path?key=opaque");
  });
});
