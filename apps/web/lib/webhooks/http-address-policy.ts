import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

export type PinnedWebhookAddress = { address: string; family: 4 | 6 };
export type WebhookAddressResolver = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

export class UnsafeWebhookAddressError extends Error {
  constructor() {
    super("Unsafe webhook address");
    this.name = "UnsafeWebhookAddressError";
  }
}

function ipv4Octets(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  return octets.every((part, index) => /^\d{1,3}$/.test(parts[index] ?? "") && part <= 255)
    ? octets
    : null;
}

function isPublicIpv4(address: string) {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  return !(a === 203 && b === 0 && c === 113);
}

function ipv6Groups(address: string) {
  let value = address.toLowerCase();
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    const octets = ipv4Octets(value.slice(separator + 1));
    if (!octets) return null;
    value = `${value.slice(0, separator)}:${(((octets[0] ?? 0) << 8) | (octets[1] ?? 0)).toString(16)}:${(((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function mappedIpv4(groups: number[]) {
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return null;
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicIpv6(address: string) {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const mapped = mappedIpv4(groups);
  if (mapped) return isPublicIpv4(mapped);
  const [first = 0, second = 0] = groups;
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && second <= 0x01ff) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2002) return false;
  return !(first === 0x3fff && (second & 0xf000) === 0);
}

export function isPublicWebhookAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function isLoopbackWebhookAddress(address: string) {
  const octets = ipv4Octets(address);
  if (octets) return octets[0] === 127;
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const mapped = mappedIpv4(groups);
  if (mapped) return isLoopbackWebhookAddress(mapped);
  return groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
}

const systemResolver: WebhookAddressResolver = (hostname, options) => lookup(hostname, options);

export async function resolvePinnedWebhookAddress(
  hostname: string,
  loopbackOnly: boolean,
  resolver: WebhookAddressResolver = systemResolver,
) {
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  const allowed = loopbackOnly ? isLoopbackWebhookAddress : isPublicWebhookAddress;
  if (addresses.length === 0 || addresses.some(({ address }) => !allowed(address))) {
    throw new UnsafeWebhookAddressError();
  }
  const selected = addresses.find(({ family }) => family === 4) ?? addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new UnsafeWebhookAddressError();
  }
  return selected as PinnedWebhookAddress;
}

export function pinnedWebhookLookup(pinned: PinnedWebhookAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [pinned]);
    else callback(null, pinned.address, pinned.family);
  };
}
