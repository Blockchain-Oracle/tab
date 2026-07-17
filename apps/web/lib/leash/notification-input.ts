const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIERS = new Set(["2", "3"]);
const READ_STATES = new Set(["all", "read", "unread"]);
const RESOLUTION_STATES = new Set(["active", "all", "resolved"]);
const NOTIFICATION_TYPES = new Set([
  "cap_75",
  "cap_blocked",
  "unusual_domain",
  "cap_lowered_halt",
  "float_low",
  "float_empty",
]);
const QUERY_KEYS = new Set(["agentId", "cursor", "limit", "tier", "read", "resolution", "type"]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type NotificationTier = "2" | "3";
export type NotificationReadState = "all" | "read" | "unread";
export type NotificationResolutionState = "active" | "all" | "resolved";
export type NotificationType =
  | "cap_75"
  | "cap_blocked"
  | "unusual_domain"
  | "cap_lowered_halt"
  | "float_low"
  | "float_empty";

export class InvalidNotificationInputError extends Error {
  constructor() {
    super("Choose valid notification filters or a valid read action.");
    this.name = "InvalidNotificationInputError";
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

function parseCursor(value: string | null): NotificationCursor | undefined {
  if (value === null) return undefined;
  if (value.length > 256 || !BASE64URL.test(value)) throw new InvalidNotificationInputError();

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw new InvalidNotificationInputError();
    }
    const cursor = decoded as Record<string, unknown>;
    const createdAt = typeof cursor.createdAt === "string" ? new Date(cursor.createdAt) : null;
    if (
      Object.keys(cursor).sort().join("\0") !== "createdAt\0id" ||
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== cursor.createdAt ||
      !validUuid(cursor.id)
    ) {
      throw new InvalidNotificationInputError();
    }
    return { createdAt, id: cursor.id };
  } catch (error) {
    if (error instanceof InvalidNotificationInputError) throw error;
    throw new InvalidNotificationInputError();
  }
}

export function encodeNotificationCursor(cursor: NotificationCursor) {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function parseNotificationQuery(params: URLSearchParams) {
  const keys = [...params.keys()];
  if (
    keys.some((key) => !QUERY_KEYS.has(key)) ||
    [...new Set(keys)].some((key) => params.getAll(key).length !== 1)
  ) {
    throw new InvalidNotificationInputError();
  }

  const agentId = params.get("agentId");
  const limitValue = params.get("limit");
  const limit = limitValue === null ? 50 : Number(limitValue);
  const tier = params.get("tier");
  const read = params.get("read") ?? "all";
  const resolution = params.get("resolution") ?? "all";
  const type = params.get("type");
  if (
    !validUuid(agentId) ||
    (limitValue !== null && !/^[1-9]\d{0,2}$/.test(limitValue)) ||
    limit > 100 ||
    (tier !== null && !TIERS.has(tier)) ||
    !READ_STATES.has(read) ||
    !RESOLUTION_STATES.has(resolution) ||
    (type !== null && !NOTIFICATION_TYPES.has(type))
  ) {
    throw new InvalidNotificationInputError();
  }

  return {
    agentId,
    cursor: parseCursor(params.get("cursor")),
    limit,
    read: read as NotificationReadState,
    resolution: resolution as NotificationResolutionState,
    tier: (tier ?? undefined) as NotificationTier | undefined,
    type: (type ?? undefined) as NotificationType | undefined,
  };
}

function exactKeys(record: Record<string, unknown>, expected: string[]) {
  return Object.keys(record).sort().join("\0") === expected.sort().join("\0");
}

export function parseNotificationMutation(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidNotificationInputError();
  }
  const input = value as Record<string, unknown>;
  if (!validUuid(input.agentId)) throw new InvalidNotificationInputError();

  if (input.action === "read_all" && exactKeys(input, ["action", "agentId"])) {
    return { action: "read_all" as const, agentId: input.agentId };
  }
  if (
    input.action === "read_one" &&
    validUuid(input.notificationId) &&
    exactKeys(input, ["action", "agentId", "notificationId"])
  ) {
    return {
      action: "read_one" as const,
      agentId: input.agentId,
      notificationId: input.notificationId,
    };
  }
  throw new InvalidNotificationInputError();
}
