import { type NextRequest, NextResponse } from "next/server";

import { getServerDatabase } from "../../../../../lib/db/server";
import {
  LEASH_RESPONSE_HEADERS,
  leashError,
  requireOwnerRequest,
} from "../../../../../lib/leash/leash-http";
import { InvalidReceiptInputError, parseReceiptId } from "../../../../../lib/leash/receipt-input";
import {
  LeashReceiptNotFoundError,
  readOwnerReceipt,
} from "../../../../../lib/leash/receipt-store";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  let receiptId: string;
  try {
    receiptId = parseReceiptId((await context.params).id);
  } catch (error) {
    if (error instanceof InvalidReceiptInputError) {
      return leashError("INVALID_RECEIPT_INPUT", error.message, 400);
    }
    throw error;
  }

  try {
    const receipt = await readOwnerReceipt(getServerDatabase().db, {
      ownerId: owner.userId,
      receiptId,
    });
    return NextResponse.json({ receipt }, { headers: LEASH_RESPONSE_HEADERS, status: 200 });
  } catch (error) {
    if (error instanceof LeashReceiptNotFoundError) {
      return leashError("RESOURCE_NOT_FOUND", error.message, 404);
    }
    throw error;
  }
}
