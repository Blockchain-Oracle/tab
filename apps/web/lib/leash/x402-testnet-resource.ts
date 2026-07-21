import type { FacilitatorClient, RouteConfig, SettleResultContext } from "@x402/core/server";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import type { SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getAddress, isAddress } from "viem";
import { BASE_SEPOLIA_INTEGRATION_PROFILE } from "./payment-profile";

export const X402_TESTNET_NETWORK = "eip155:84532" as const;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const X402_TESTNET_FACILITATOR = "https://x402.org/facilitator" as const;
export const X402_TESTNET_AMOUNT = "1000" as const;
export const X402_TESTNET_PATH = "/api/x402/testnet" as const;
export const TEST_FUNDS_LABEL = "Sandbox funds — no real value" as const;

const BYTES_32 = /^0x[\da-f]{64}$/i;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TRANSACTION_HASH = /^0x[\da-f]{64}$/i;
const UNSIGNED_INTEGER = /^(0|[1-9]\d*)$/;

export interface X402TestnetResourceConfig {
  amount: typeof X402_TESTNET_AMOUNT;
  asset: typeof BASE_SEPOLIA_USDC;
  facilitatorUrl: typeof X402_TESTNET_FACILITATOR;
  network: typeof X402_TESTNET_NETWORK;
  payee: `0x${string}`;
  resourceUrl: string;
}

export interface X402TestnetSettlement {
  amount: typeof X402_TESTNET_AMOUNT;
  asset: typeof BASE_SEPOLIA_USDC;
  authorizationValidAfter: string;
  authorizationValidBefore: string;
  endpoint: string;
  facilitatorResponse: SettleResponse;
  facilitatorUrl: typeof X402_TESTNET_FACILITATOR;
  network: typeof X402_TESTNET_NETWORK;
  nonce: `0x${string}`;
  payer: `0x${string}`;
  payee: `0x${string}`;
  testFunds: true;
  transactionHash: `0x${string}`;
}

export type X402TestnetSettlementAttempt = Omit<
  X402TestnetSettlement,
  "facilitatorResponse" | "transactionHash"
>;

export interface X402TestnetResourceDependencies {
  facilitator: FacilitatorClient;
}

export class X402TestnetConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402TestnetConfigurationError";
  }
}

function canonicalHttpsOrigin(value: string | undefined) {
  if (!value) throw new X402TestnetConfigurationError("The canonical app origin is missing.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new X402TestnetConfigurationError("The canonical app origin is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new X402TestnetConfigurationError(
      "The canonical app origin must be an HTTPS origin without credentials, path, or query.",
    );
  }
  return url.origin;
}

export function readX402TestnetResourceConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): X402TestnetResourceConfig {
  if (environment.TAB_AGENT_PROVISIONING_PROFILE !== BASE_SEPOLIA_INTEGRATION_PROFILE) {
    throw new X402TestnetConfigurationError(
      "The Base Sepolia x402 integration profile is not enabled.",
    );
  }
  const payee = environment.X402_TESTNET_PAYEE_ADDRESS;
  if (!payee || !isAddress(payee) || payee.toLowerCase() === ZERO_ADDRESS) {
    throw new X402TestnetConfigurationError("The Base Sepolia x402 payee is invalid.");
  }
  const origin = canonicalHttpsOrigin(environment.NEXT_PUBLIC_APP_URL);
  return {
    amount: X402_TESTNET_AMOUNT,
    asset: BASE_SEPOLIA_USDC,
    facilitatorUrl: X402_TESTNET_FACILITATOR,
    network: X402_TESTNET_NETWORK,
    payee: getAddress(payee),
    resourceUrl: `${origin}${X402_TESTNET_PATH}`,
  };
}

function requiredString(value: unknown, label: string, pattern?: RegExp) {
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    throw new Error(`The settled x402 ${label} is invalid.`);
  }
  return value;
}

function address(value: unknown, label: string) {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`The settled x402 ${label} is invalid.`);
  }
  return getAddress(value);
}

export function normalizeX402TestnetSettlement(
  config: X402TestnetResourceConfig,
  context: SettleResultContext,
): X402TestnetSettlement {
  const { paymentPayload, requirements, result } = context;
  if (!result.success) throw new Error("An unsuccessful x402 result cannot be recorded.");
  const attempt = normalizeX402TestnetSettlementAttempt(config, paymentPayload, requirements);
  if (result.network !== config.network) {
    throw new Error("The settled x402 network is outside the integration profile.");
  }
  if (result.payer && address(result.payer, "facilitator payer") !== attempt.payer) {
    throw new Error("The settled x402 payer does not match the authorization.");
  }
  const settledAmount = result.amount ?? requirements.amount;
  if (settledAmount !== config.amount) {
    throw new Error("The settled x402 amount does not match the canonical amount.");
  }
  return {
    ...attempt,
    facilitatorResponse: result as SettleResponse,
    transactionHash: requiredString(
      result.transaction,
      "transaction hash",
      TRANSACTION_HASH,
    ).toLowerCase() as `0x${string}`,
  };
}

export function normalizeX402TestnetSettlementAttempt(
  config: X402TestnetResourceConfig,
  paymentPayload: SettleResultContext["paymentPayload"],
  requirements: SettleResultContext["requirements"],
): X402TestnetSettlementAttempt {
  if (
    requirements.network !== config.network ||
    requirements.asset.toLowerCase() !== config.asset.toLowerCase() ||
    requirements.amount !== config.amount ||
    paymentPayload.accepted.network !== requirements.network ||
    paymentPayload.accepted.asset.toLowerCase() !== requirements.asset.toLowerCase() ||
    paymentPayload.accepted.amount !== requirements.amount ||
    paymentPayload.accepted.payTo.toLowerCase() !== requirements.payTo.toLowerCase()
  ) {
    throw new Error("The x402 authorization is outside the integration profile.");
  }
  const authorization = paymentPayload.payload.authorization;
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    throw new Error("The settled x402 authorization is invalid.");
  }
  const fields = authorization as Record<string, unknown>;
  const payer = address(fields.from, "payer");
  const payee = address(fields.to, "payee");
  const requirementPayee = address(requirements.payTo, "required payee");
  if (payee !== config.payee || requirementPayee !== config.payee) {
    throw new Error("The settled x402 payee does not match the canonical payee.");
  }
  const amount = requiredString(fields.value, "amount", UNSIGNED_INTEGER);
  if (amount !== config.amount) {
    throw new Error("The settled x402 amount does not match the canonical amount.");
  }
  return {
    amount: config.amount,
    asset: config.asset,
    authorizationValidAfter: requiredString(
      fields.validAfter,
      "valid-after value",
      UNSIGNED_INTEGER,
    ),
    authorizationValidBefore: requiredString(
      fields.validBefore,
      "valid-before value",
      UNSIGNED_INTEGER,
    ),
    endpoint: config.resourceUrl,
    facilitatorUrl: config.facilitatorUrl,
    network: config.network,
    nonce: requiredString(fields.nonce, "nonce", BYTES_32).toLowerCase() as `0x${string}`,
    payer,
    payee,
    testFunds: true,
  };
}

export function buildX402TestnetServer(
  config: X402TestnetResourceConfig,
  dependencies: X402TestnetResourceDependencies,
) {
  return new x402ResourceServer(dependencies.facilitator).register(
    config.network,
    new ExactEvmScheme(),
  );
}

export function x402TestnetRouteConfig(config: X402TestnetResourceConfig): RouteConfig {
  return {
    accepts: {
      extra: { name: "USDC", version: "2" },
      maxTimeoutSeconds: 120,
      network: config.network,
      payTo: config.payee,
      price: {
        amount: config.amount,
        asset: config.asset,
        extra: { name: "USDC", version: "2" },
      },
      scheme: "exact",
    },
    description: `${TEST_FUNDS_LABEL}. Tab's canonical x402 integration target.`,
    mimeType: "application/json",
    resource: config.resourceUrl,
    serviceName: "Tab",
    tags: ["tab", "x402", "base-sepolia", "test-funds"],
    unpaidResponseBody: () => ({
      body: {
        error: "PAYMENT_REQUIRED",
        label: TEST_FUNDS_LABEL,
        testFunds: true,
      },
      contentType: "application/json",
    }),
  };
}

export function buildX402TestnetHttpServer(
  config: X402TestnetResourceConfig,
  dependencies: X402TestnetResourceDependencies,
) {
  return new x402HTTPResourceServer(buildX402TestnetServer(config, dependencies), {
    [`GET ${X402_TESTNET_PATH}`]: x402TestnetRouteConfig(config),
  });
}

export function x402TestnetSuccessBody(config: X402TestnetResourceConfig) {
  return {
    label: TEST_FUNDS_LABEL,
    network: config.network,
    ok: true,
    service: "Tab canonical x402 integration target",
    testFunds: true,
  } as const;
}
