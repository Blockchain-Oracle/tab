import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Database } from "../../../../lib/db/client";
import { getServerDatabase } from "../../../../lib/db/server";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";
import { createMagicExpressClient, MagicExpressError } from "../../../../lib/leash/magic-express";
import {
  type PaymentProfile,
  provisioningPaymentProfile,
} from "../../../../lib/leash/payment-profile";
import {
  AgentProvisionConflictError,
  AgentProvisionNotFoundError,
  AgentProvisionQuotaExceededError,
  AgentProvisionRateLimitedError,
  InvalidAgentProvisionRequestError,
  MAX_PROVISION_BODY_BYTES,
  provisionAgentWallet,
} from "../../../../lib/leash/provision-agent";

export const PROVISION_BODY_READ_TIMEOUT_MS = 5_000;

interface ProvisionDependencies {
  bodyReadTimeoutMs?: number;
  client: { getOrCreateWallet(subject: string): Promise<string> };
  database: Database;
  paymentProfile: PaymentProfile;
}

class ProvisionBodyReadTimeoutError extends Error {
  constructor() {
    super("The provision request body timed out.");
    this.name = "ProvisionBodyReadTimeoutError";
  }
}

function magicError(error: MagicExpressError) {
  console.warn("Magic Express provisioning failed", {
    code: error.code,
    providerHints: error.providerHints,
    providerStage: error.providerStage ?? null,
    providerStatus: error.providerStatus ?? null,
    providerTraceId: error.providerTraceId ?? null,
  });
  const status =
    error.code === "SIGNER_PROVIDER_RATE_LIMITED"
      ? 429
      : error.code === "SIGNER_NOT_CONFIGURED" ||
          error.code === "SIGNER_PROVIDER_TIMEOUT" ||
          error.code === "SIGNER_PROVIDER_UNAVAILABLE"
        ? 503
        : 502;
  // Self-explaining failures: include the provider's stage/status so the
  // owner (and the next debugging session) sees WHERE Magic rejected it.
  const stage = error.providerStage ? ` Provider stage: ${error.providerStage}.` : "";
  const providerStatus = error.providerStatus ? ` Provider HTTP ${error.providerStatus}.` : "";
  return leashError(
    error.code,
    `The wallet provider request could not be completed.${stage}${providerStatus}`,
    status,
  );
}

function bestEffortCancel(cancel: () => Promise<unknown>) {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // The invalid request remains the response even if its transport cannot be cancelled.
  }
}

function bodyReadDeadline(signal: AbortSignal, timeoutMs: number) {
  let rejectDeadline: (error: ProvisionBodyReadTimeoutError) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const expire = () => rejectDeadline(new ProvisionBodyReadTimeoutError());
  const timer = setTimeout(expire, timeoutMs);
  signal.addEventListener("abort", expire, { once: true });
  if (signal.aborted) expire();
  return {
    deadline,
    dispose() {
      clearTimeout(timer);
      signal.removeEventListener("abort", expire);
    },
  };
}

async function boundedBody(request: NextRequest, timeoutMs: number) {
  const body = request.body;
  if (request.signal.aborted) {
    if (body) bestEffortCancel(() => body.cancel());
    throw new ProvisionBodyReadTimeoutError();
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PROVISION_BODY_BYTES)) {
    if (body) bestEffortCancel(() => body.cancel());
    throw new InvalidAgentProvisionRequestError();
  }
  if (!body) return "";
  const reader = body.getReader();
  const timeout = bodyReadDeadline(request.signal, timeoutMs);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), timeout.deadline]);
      } catch (error) {
        if (error instanceof ProvisionBodyReadTimeoutError || request.signal.aborted) {
          bestEffortCancel(() => reader.cancel());
          throw new ProvisionBodyReadTimeoutError();
        }
        throw error;
      }
      const { done, value } = result;
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PROVISION_BODY_BYTES) {
        bestEffortCancel(() => reader.cancel());
        throw new InvalidAgentProvisionRequestError();
      }
      chunks.push(value);
    }
  } finally {
    timeout.dispose();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidAgentProvisionRequestError();
  }
}

export async function handleProvisionRequest(
  request: NextRequest,
  dependencies: ProvisionDependencies,
) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  try {
    const agent = await provisionAgentWallet({
      client: dependencies.client,
      database: dependencies.database,
      ownerId: owner.userId,
      paymentProfile: dependencies.paymentProfile,
      rawBody: await boundedBody(
        request,
        dependencies.bodyReadTimeoutMs ?? PROVISION_BODY_READ_TIMEOUT_MS,
      ),
    });
    const testFunds = agent.paymentProfile === "base_sepolia_integration";
    return NextResponse.json(
      {
        agent: {
          address: agent.agentAddress,
          id: agent.id,
          name: agent.name,
          paymentProfile: agent.paymentProfile,
        },
        ...(testFunds ? { label: "Sandbox funds — no real value" } : {}),
        testFunds,
      },
      { headers: LEASH_RESPONSE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ProvisionBodyReadTimeoutError) {
      return leashError("PROVISION_REQUEST_TIMEOUT", "The provision request timed out.", 408);
    }
    if (error instanceof InvalidAgentProvisionRequestError) {
      return leashError("INVALID_PROVISION_REQUEST", error.message, 400);
    }
    if (error instanceof AgentProvisionNotFoundError) {
      return leashError("AGENT_NOT_FOUND", error.message, 404);
    }
    if (error instanceof AgentProvisionConflictError) {
      return leashError("AGENT_WALLET_CONFLICT", error.message, 409);
    }
    if (error instanceof AgentProvisionRateLimitedError) {
      const response = leashError("AGENT_PROVISION_RATE_LIMITED", error.message, 429);
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof AgentProvisionQuotaExceededError) {
      return leashError("AGENT_PROVISION_QUOTA_EXCEEDED", error.message, 409);
    }
    if (error instanceof MagicExpressError) return magicError(error);
    throw error;
  }
}

export function POST(request: NextRequest) {
  return handleProvisionRequest(request, {
    client: createMagicExpressClient(),
    database: getServerDatabase().db,
    paymentProfile: provisioningPaymentProfile(),
  });
}
