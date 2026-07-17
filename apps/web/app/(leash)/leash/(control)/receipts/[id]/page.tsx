import { notFound } from "next/navigation";

import {
  InvalidReceiptInputError,
  parseReceiptId,
} from "../../../../../../lib/leash/receipt-input";
import { ReceiptDetail } from "./receipt-detail-controller";

type ReceiptPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agentId?: string | string[] }>;
};

export default async function ReceiptPage({ params, searchParams }: ReceiptPageProps) {
  const [route, query] = await Promise.all([params, searchParams]);
  let receiptId: string;
  try {
    receiptId = parseReceiptId(route.id);
  } catch (error) {
    if (error instanceof InvalidReceiptInputError) notFound();
    throw error;
  }
  const backAgentId = typeof query.agentId === "string" ? query.agentId : null;
  return <ReceiptDetail backAgentId={backAgentId} receiptId={receiptId} />;
}
