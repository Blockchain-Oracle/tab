import { describe, expect, it } from "vitest";

import { readBoundedMagicJson } from "./magic-express-response";

const MAXIMUM_BYTES = 16_384;

function oversizedJsonStream(
  options: { declareLength?: boolean; contentType?: string | null } = {},
) {
  const payload = new TextEncoder().encode(JSON.stringify({ value: "x".repeat(17_000) }));
  let cancelled = false;
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    pull(controller) {
      if (offset >= payload.byteLength) return;
      const end = Math.min(offset + 4_096, payload.byteLength);
      controller.enqueue(payload.slice(offset, end));
      offset = end;
    },
  });
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.declareLength) headers.set("content-length", String(payload.byteLength));
  return {
    cancelled: () => cancelled,
    response: new Response(body, { headers, status: 200 }),
  };
}

describe("bounded Magic Express responses", () => {
  it.each([
    true,
    false,
  ])("cancels an oversized JSON stream with declared length %s", async (declareLength) => {
    const stream = oversizedJsonStream({ declareLength });

    await expect(readBoundedMagicJson(stream.response, MAXIMUM_BYTES)).rejects.toMatchObject({
      code: "SIGNER_PROVIDER_INVALID_RESPONSE",
    });
    expect(stream.cancelled()).toBe(true);
  });

  it.each([
    null,
    "text/plain",
  ])("cancels the response body when JSON content type is %s", async (contentType) => {
    const stream = oversizedJsonStream({ contentType });

    await expect(readBoundedMagicJson(stream.response, MAXIMUM_BYTES)).rejects.toMatchObject({
      code: "SIGNER_PROVIDER_INVALID_RESPONSE",
    });
    expect(stream.cancelled()).toBe(true);
  });

  it("rejects a successful JSON response with no body", async () => {
    const response = new Response(null, {
      headers: { "content-type": "application/json" },
      status: 200,
    });

    await expect(readBoundedMagicJson(response, MAXIMUM_BYTES)).rejects.toMatchObject({
      code: "SIGNER_PROVIDER_INVALID_RESPONSE",
    });
  });
});
