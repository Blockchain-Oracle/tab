import { describe, expect, it } from "vitest";

import { isPublicWebhookAddress, resolvePinnedWebhookAddress } from "./http-address-policy";

describe("outbound webhook address policy", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "64:ff9b::808:808",
    "100::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002::1",
    "3fff::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
  ])("rejects non-public destination %s", (address) => {
    expect(isPublicWebhookAddress(address)).toBe(false);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700::1111",
  ])("accepts public destination %s", (address) => {
    expect(isPublicWebhookAddress(address)).toBe(true);
  });

  it("rejects a mixed public/private answer after exactly one policy resolution", async () => {
    let calls = 0;
    const resolver = async () => {
      calls += 1;
      return [
        { address: "93.184.216.34", family: 4 as const },
        { address: "10.0.0.1", family: 4 as const },
      ];
    };

    await expect(resolvePinnedWebhookAddress("mixed.example", false, resolver)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("uses a deterministic IPv4-first preference across validated answers", async () => {
    const resolver = async () => [
      { address: "2606:4700::1111", family: 6 as const },
      { address: "1.1.1.1", family: 4 as const },
    ];

    await expect(resolvePinnedWebhookAddress("dual.example", false, resolver)).resolves.toEqual({
      address: "1.1.1.1",
      family: 4,
    });
  });
});
