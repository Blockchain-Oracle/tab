export type LiveRead =
  | { state: "loading" }
  | { health?: "partial" | "unavailable"; readAt?: string; state: "unavailable" }
  | { readAt: string; state: "available"; totalAtomic: string };

type FloatRead = { balanceAtomic: string | null; label: string; network: string };

export function parseLiveRead(value: unknown, agentId: string): LiveRead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { state: "unavailable" };
  }
  const body = value as Record<string, unknown>;
  const readAt = typeof body.readAt === "string" ? body.readAt : "";
  const timestamp = new Date(readAt);
  const health = body.health;
  const floats = body.floats;
  if (
    body.agentId !== agentId ||
    Number.isNaN(timestamp.getTime()) ||
    timestamp.toISOString() !== readAt ||
    !["healthy", "partial", "unavailable"].includes(String(health))
  ) {
    return { state: "unavailable" };
  }
  if (!Array.isArray(floats) || floats.length !== 2) {
    return { health: "unavailable", readAt, state: "unavailable" };
  }
  const expected = [
    ["Base", "eip155:8453"],
    ["Arbitrum", "eip155:42161"],
  ];
  const valid = floats.every((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const row = item as FloatRead;
    return (
      row.label === expected[index]?.[0] &&
      row.network === expected[index]?.[1] &&
      (row.balanceAtomic === null || /^\d+$/.test(row.balanceAtomic))
    );
  });
  if (!valid) return { state: "unavailable" };
  if (health !== "healthy" || floats.some((item) => (item as FloatRead).balanceAtomic === null)) {
    return {
      health: health === "partial" ? "partial" : "unavailable",
      readAt,
      state: "unavailable",
    };
  }
  const total = floats.reduce(
    (sum, item) => sum + BigInt((item as FloatRead).balanceAtomic ?? "0"),
    BigInt(0),
  );
  return { readAt, state: "available", totalAtomic: total.toString() };
}

export function readLabel(read: LiveRead) {
  if (read.state === "loading") return null;
  const health = read.state === "available" ? "healthy" : (read.health ?? "unavailable");
  const timestamp = read.readAt
    ? `Read ${read.readAt.slice(0, 19).replace("T", " ")} UTC`
    : "No verified read time";
  return `RPC ${health} · ${timestamp}`;
}
