export const metadata = { title: "Receipt" };

import { notFound } from "next/navigation";

import { requireCurrentOwner } from "../../../../lib/auth/current-owner";
import { getServerDatabase } from "../../../../lib/db/server";
import { InvalidReceiptInputError, parseReceiptId } from "../../../../lib/leash/receipt-input";
import { LeashReceiptNotFoundError, readOwnerReceipt } from "../../../../lib/leash/receipt-store";
import { MobileReceiptDetail } from "./receipt-detail";

export default async function MobileReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const route = await params;
  let receiptId: string;
  try {
    receiptId = parseReceiptId(route.id);
  } catch (error) {
    if (error instanceof InvalidReceiptInputError) notFound();
    throw error;
  }

  const owner = await requireCurrentOwner();
  const { db } = getServerDatabase();
  try {
    const receipt = await readOwnerReceipt(db, { ownerId: owner.userId, receiptId });
    return <MobileReceiptDetail receipt={receipt} />;
  } catch (error) {
    if (error instanceof LeashReceiptNotFoundError) notFound();
    throw error;
  }
}
