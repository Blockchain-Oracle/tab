import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../lib/db/server";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";
import { InvalidReceiptInputError, parseReceiptQuery } from "../../../../lib/leash/receipt-input";
import { LeashReceiptNotFoundError, listOwnerReceipts } from "../../../../lib/leash/receipt-store";

export async function GET(request: NextRequest) {
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  let query: ReturnType<typeof parseReceiptQuery>;
  try {
    query = parseReceiptQuery(request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof InvalidReceiptInputError) {
      return leashError("INVALID_RECEIPT_INPUT", error.message, 400);
    }
    throw error;
  }

  try {
    const result = await listOwnerReceipts(getServerDatabase().db, {
      ...query,
      ownerId: owner.userId,
    });
    return NextResponse.json(result, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    if (error instanceof LeashReceiptNotFoundError) {
      return leashError("LEASH_RESOURCE_NOT_FOUND", error.message, 404);
    }
    throw error;
  }
}
