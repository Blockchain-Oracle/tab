import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { Agent, buildConnector } from "undici";

import {
  isLoopbackPaymentHostname,
  PaymentTargetPolicyError,
  safePaymentRequestInit,
  validatePaymentTarget,
} from "./payment-target-policy.js";

const DNS_TIMEOUT_MS = 3_000;
const MAX_DNS_ANSWERS = 16;
const MAX_PINNED_HOSTS = 128;

export interface PaymentTargetAddress {
  address: string;
  family: 4 | 6;
}

export type PaymentTargetLookup = (hostname: string) => Promise<readonly PaymentTargetAddress[]>;

interface PinnedPaymentFetchOptions {
  allowDevelopmentLoopback?: boolean;
  fetch: typeof globalThis.fetch;
  lookup?: PaymentTargetLookup;
  maxPinnedHosts?: number;
}

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(value: string) {
  const lower = value.toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

function loopbackAddress(value: string) {
  const address = normalizeHostname(value);
  if (address === "::1") return true;
  return isIP(address) === 4 && Number(address.split(".")[0]) === 127;
}

function publicAddress(value: string, family: 4 | 6) {
  const address = normalizeHostname(value);
  if (isIP(address) !== family) return false;
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  return /^[23]/.test(address) && !blockedIpv6.check(address, "ipv6");
}

const defaultLookup: PaymentTargetLookup = async (hostname) => {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.flatMap((answer) =>
    answer.family === 4 || answer.family === 6
      ? [{ address: answer.address, family: answer.family }]
      : [],
  );
};

async function boundedLookup(lookup: PaymentTargetLookup, hostname: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new PaymentTargetPolicyError()), DNS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([lookup(hostname), deadline]);
  } catch {
    throw new PaymentTargetPolicyError();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createPinnedPaymentFetch(options: PinnedPaymentFetchOptions) {
  const allowDevelopmentLoopback = options.allowDevelopmentLoopback === true;
  const lookup = options.lookup ?? defaultLookup;
  const maxPinnedHosts = options.maxPinnedHosts ?? MAX_PINNED_HOSTS;
  if (!Number.isSafeInteger(maxPinnedHosts) || maxPinnedHosts < 1 || maxPinnedHosts > 1_024) {
    throw new Error("Payment target pin capacity is invalid");
  }
  const pins = new Map<string, PaymentTargetAddress>();
  const resolving = new Map<string, Promise<PaymentTargetAddress>>();
  const connector = buildConnector({ timeout: 10_000 });
  const dispatcher = new Agent({
    connections: 4,
    connect(connectOptions, callback) {
      const hostname = normalizeHostname(connectOptions.hostname);
      const pin = pins.get(hostname);
      if (!pin) {
        callback(new PaymentTargetPolicyError(), null);
        return;
      }
      connector(
        {
          ...connectOptions,
          hostname: pin.address,
          ...(connectOptions.protocol === "https:" && isIP(hostname) === 0
            ? { servername: hostname }
            : {}),
        },
        callback,
      );
    },
    pipelining: 1,
  });

  async function resolve(url: URL) {
    const hostname = normalizeHostname(url.hostname);
    const existing = pins.get(hostname);
    if (existing) return existing;
    const active = resolving.get(hostname);
    if (active) return active;
    const occupiedHosts = new Set([...pins.keys(), ...resolving.keys()]);
    if (occupiedHosts.size >= maxPinnedHosts) throw new PaymentTargetPolicyError();

    const task = (async () => {
      const family = isIP(hostname);
      const lexicalLoopback = isLoopbackPaymentHostname(hostname);
      let answers: readonly PaymentTargetAddress[];
      if (family === 4 || family === 6) {
        answers = [{ address: hostname, family }];
      } else {
        answers = await boundedLookup(lookup, hostname);
      }
      const developmentTarget =
        allowDevelopmentLoopback && url.protocol === "http:" && lexicalLoopback;
      if (
        answers.length < 1 ||
        answers.length > MAX_DNS_ANSWERS ||
        answers.some((answer) =>
          developmentTarget
            ? !loopbackAddress(answer.address)
            : !publicAddress(answer.address, answer.family),
        )
      ) {
        throw new PaymentTargetPolicyError();
      }
      const selected = answers[0];
      if (!selected) throw new PaymentTargetPolicyError();
      pins.set(hostname, selected);
      return selected;
    })();
    resolving.set(hostname, task);
    try {
      return await task;
    } finally {
      resolving.delete(hostname);
    }
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(
      validatePaymentTarget(rawUrl, {
        allowDevelopmentLoopback,
      }),
    );
    await resolve(url);
    const requestInit = {
      ...safePaymentRequestInit(init),
      dispatcher,
    } as unknown as RequestInit;
    return options.fetch(input, requestInit);
  };

  let closePromise: Promise<void> | undefined;
  return {
    close() {
      closePromise ??= dispatcher.close();
      return closePromise;
    },
    fetch,
  };
}
