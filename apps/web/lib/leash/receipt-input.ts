const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const QUERY_KEYS = new Set(["agentId", "cursor", "limit"]);

export class InvalidReceiptInputError extends Error {
  constructor() {
    super("Choose a valid receipt feed query.");
    this.name = "InvalidReceiptInputError";
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export interface ReceiptCursor {
  createdAt: Date;
  id: string;
}

function parseCursor(value: string | null): ReceiptCursor | undefined {
  if (value === null) return undefined;
  if (value.length > 256 || !BASE64URL.test(value)) throw new InvalidReceiptInputError();
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw new InvalidReceiptInputError();
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
      throw new InvalidReceiptInputError();
    }
    return { createdAt, id: cursor.id };
  } catch (error) {
    if (error instanceof InvalidReceiptInputError) throw error;
    throw new InvalidReceiptInputError();
  }
}

export function encodeReceiptCursor(cursor: ReceiptCursor) {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function parseReceiptId(value: string) {
  if (!validUuid(value)) throw new InvalidReceiptInputError();
  return value;
}

export function parseReceiptQuery(params: URLSearchParams) {
  const keys = [...params.keys()];
  if (
    keys.some((key) => !QUERY_KEYS.has(key)) ||
    [...new Set(keys)].some((key) => params.getAll(key).length !== 1)
  ) {
    throw new InvalidReceiptInputError();
  }
  const agentId = params.get("agentId");
  const limitValue = params.get("limit");
  const limit = limitValue === null ? 50 : Number(limitValue);
  if (
    !validUuid(agentId) ||
    (limitValue !== null && !/^[1-9]\d{0,2}$/.test(limitValue)) ||
    limit > 100
  ) {
    throw new InvalidReceiptInputError();
  }
  return { agentId, cursor: parseCursor(params.get("cursor")), limit };
}
