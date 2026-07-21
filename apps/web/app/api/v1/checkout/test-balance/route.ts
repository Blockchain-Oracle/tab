import { FaucetConfigError, readTestBalances } from "@tab/faucet";
import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiKeyError, NO_STORE_HEADERS } from "../../../../../lib/auth/api-key-http";
import { authenticatePublishableKey } from "../../../../../lib/auth/pk-auth";
import { getServerDatabase } from "../../../../../lib/db/server";

const CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-max-age": "86400",
};

function withCors(response: NextResponse) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS, status: 204 });
}

/**
 * The test-mode checkout balance is the buyer's REAL Base Sepolia USDC —
 * read on-chain server-side. Testnet never shows a Mainnet figure under
 * a testnet label.
 */
export async function GET(request: NextRequest) {
  try {
    const database = getServerDatabase().db;
    const principal = await authenticatePublishableKey(
      database,
      request.headers.get("authorization"),
    );
    if (principal.env !== "test") {
      return withCors(
        apiError("LIVE_MODE_NO_TEST_BALANCE", "Test balances exist only on Testnet.", 403),
      );
    }

    const address = request.nextUrl.searchParams.get("address") ?? "";
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
    if (!rpcUrl) {
      return withCors(
        apiError("TEST_BALANCE_UNAVAILABLE", "The test balance read is not configured.", 503),
      );
    }

    let balances: Awaited<ReturnType<typeof readTestBalances>>;
    try {
      balances = await readTestBalances(rpcUrl, address);
    } catch (readError) {
      if (readError instanceof FaucetConfigError) throw readError;
      // A cross-origin 500 without CORS headers reads as an opaque network
      // failure in the SDK — answer honestly instead.
      console.error("test balance read failed", readError);
      return withCors(
        apiError("TEST_BALANCE_UNAVAILABLE", "The test balance could not be read.", 503),
      );
    }
    return withCors(
      NextResponse.json(
        {
          balance: {
            gasWei: balances.gasWei.toString(),
            usdcAtomic: balances.usdcAtomic.toString(),
          },
        },
        { headers: NO_STORE_HEADERS },
      ),
    );
  } catch (error) {
    if (error instanceof FaucetConfigError) {
      return withCors(apiError("INVALID_TEST_BALANCE_REQUEST", error.message, 400));
    }
    return withCors(apiKeyError(error));
  }
}
