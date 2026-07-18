import { withX402 } from "@x402/next";
import { type NextRequest, NextResponse } from "next/server";

import {
  buildX402TestnetServer,
  type X402TestnetResourceConfig,
  type X402TestnetResourceDependencies,
  x402TestnetRouteConfig,
  x402TestnetSuccessBody,
} from "./x402-testnet-resource";

export function buildX402TestnetNextGet(
  config: X402TestnetResourceConfig,
  dependencies: X402TestnetResourceDependencies,
) {
  const handler = async (_request: NextRequest) =>
    NextResponse.json(x402TestnetSuccessBody(config), {
      headers: { "cache-control": "no-store" },
    });
  return withX402(
    handler,
    x402TestnetRouteConfig(config),
    buildX402TestnetServer(config, dependencies),
  );
}
