import { describe, expect, it, vi } from "vitest";

import { createTabFetch } from "./fetch-wrapper.js";
import { createPinnedPaymentFetch } from "./payment-target-network.js";
import { PaymentTargetPolicyError } from "./payment-target-policy.js";

describe("pinned payment target networking", () => {
  it("rejects DNS answers containing private or rebinding-capable addresses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const policy = createPinnedPaymentFetch({
      fetch,
      lookup: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ],
    });

    await expect(policy.fetch("https://seller.example/pay")).rejects.toBeInstanceOf(
      PaymentTargetPolicyError,
    );
    expect(fetch).not.toHaveBeenCalled();
    await policy.close();
  });

  it("pins one validated public DNS answer and reuses it without re-resolution", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    const lookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]);
    const policy = createPinnedPaymentFetch({ fetch, lookup });

    await expect(policy.fetch("https://seller.example/first")).resolves.toBeInstanceOf(Response);
    await expect(policy.fetch("https://seller.example/second")).resolves.toBeInstanceOf(Response);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    expect(fetch.mock.calls[0]?.[1]).toHaveProperty("dispatcher");
    await policy.close();
  });

  it("atomically bounds delayed concurrent lookups for distinct hosts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    const resolvers = new Map<
      string,
      (answers: readonly [{ address: string; family: 4 }]) => void
    >();
    const lookup = vi.fn(
      (hostname: string) =>
        new Promise<readonly [{ address: string; family: 4 }]>((resolve) => {
          resolvers.set(hostname, resolve);
        }),
    );
    const policy = createPinnedPaymentFetch({ fetch, lookup, maxPinnedHosts: 2 });

    const requests = ["one", "two", "three", "four"].map((host) =>
      policy.fetch(`https://${host}.example/pay`).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ error, ok: false as const }),
      ),
    );

    expect(lookup).toHaveBeenCalledTimes(2);
    expect([...resolvers.keys()]).toEqual(["one.example", "two.example"]);
    resolvers.get("one.example")?.([{ address: "8.8.8.8", family: 4 }]);
    resolvers.get("two.example")?.([{ address: "1.1.1.1", family: 4 }]);

    const results = await Promise.all(requests);
    expect(results.slice(0, 2)).toEqual([{ ok: true }, { ok: true }]);
    for (const result of results.slice(2)) {
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error).toBeInstanceOf(PaymentTargetPolicyError);
    }
    await expect(policy.fetch("https://five.example/pay")).rejects.toBeInstanceOf(
      PaymentTargetPolicyError,
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    await policy.close();
  });

  it("keeps numeric loopback default-off and requires the development opt-in", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    const production = createPinnedPaymentFetch({ fetch, lookup: async () => [] });
    await expect(production.fetch("http://127.0.0.1:8787/pay")).rejects.toBeInstanceOf(
      PaymentTargetPolicyError,
    );
    await production.close();

    const development = createPinnedPaymentFetch({
      allowDevelopmentLoopback: true,
      fetch,
      lookup: async () => [],
    });
    await expect(development.fetch("http://127.0.0.1:8787/pay")).resolves.toBeInstanceOf(Response);
    await development.close();
  });

  it("protects the exported fetch wrapper before its transport can reach a private DNS answer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const leashFetch = createTabFetch({
      address: "0x1111111111111111111111111111111111111111",
      apiBaseUrl: "https://tab.example.test",
      apiKey: "agent_sk_test",
      fetch,
      lookup: async () => [{ address: "169.254.169.254", family: 4 }],
      paymentProfile: "mainnet",
    });

    await expect(leashFetch("https://seller.example/pay")).rejects.toBeInstanceOf(
      PaymentTargetPolicyError,
    );
    expect(fetch).not.toHaveBeenCalled();
    await leashFetch.close();
  });

  it.each([
    "169.254.169.254",
    "192.0.2.10",
    "240.0.0.1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("rejects reserved DNS answer %s", async (address) => {
    const policy = createPinnedPaymentFetch({
      fetch: vi.fn<typeof globalThis.fetch>(),
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    });
    await expect(policy.fetch("https://seller.example/pay")).rejects.toBeInstanceOf(
      PaymentTargetPolicyError,
    );
    await policy.close();
  });
});
