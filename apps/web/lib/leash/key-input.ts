const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidLeashKeyInputError extends Error {
  constructor() {
    super("Choose a valid Leash agent and key.");
    this.name = "InvalidLeashKeyInputError";
  }
}

function exactRecord(value: unknown, expectedKeys: string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidLeashKeyInputError();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== expectedKeys.sort().join("\0")) {
    throw new InvalidLeashKeyInputError();
  }
  return record;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new InvalidLeashKeyInputError();
  }
  return value;
}

export function parseLeashKeyScope(value: unknown) {
  const record = exactRecord(value, ["agentId"]);
  return { agentId: uuid(record.agentId) };
}

export function parseLeashKeyRotation(value: unknown) {
  const record = exactRecord(value, ["agentId", "keyId"]);
  return { agentId: uuid(record.agentId), keyId: uuid(record.keyId) };
}
