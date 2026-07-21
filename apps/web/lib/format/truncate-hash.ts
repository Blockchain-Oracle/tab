/**
 * Canonical middle-ellipsis for hashes/addresses: one truncation width
 * everywhere, no CSS double-truncation. `0x` prefixes are preserved inside
 * the head so `0x1234…abcd` stays recognizable.
 */
export function truncateHash(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
