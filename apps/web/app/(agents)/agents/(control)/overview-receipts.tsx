import Link from "next/link";

import type { listOwnerReceipts } from "../../../../lib/leash/receipt-store";
import receiptStyles from "./leash-receipt-preview.module.css";
import { RelativeTime } from "./relative-time";

type ReceiptPreview = Awaited<ReturnType<typeof listOwnerReceipts>>["receipts"][number];

export function OverviewReceipts({
  query,
  receipts,
}: {
  query: string;
  receipts: ReceiptPreview[];
}) {
  return (
    <section className={receiptStyles.preview}>
      <div className={receiptStyles.heading}>
        <div>
          <span>RECENT PAYMENT ATTEMPTS</span>
          <h2>Recent payment attempts</h2>
        </div>
        <Link href={`/leash/payments${query}`}>View all payments →</Link>
      </div>
      {receipts.length === 0 ? (
        <p className={receiptStyles.empty}>No payment attempts yet.</p>
      ) : (
        <ul className={receiptStyles.list}>
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <Link href={`/leash/receipts/${receipt.id}${query}`}>
                <span className={receiptStyles.amount}>{receipt.amountDisplay}</span>
                <span className={receiptStyles.resource}>
                  {receipt.resourceUrl ?? receipt.resourceHost ?? "Resource unavailable"}
                  <small>
                    {receipt.origin
                      ? [
                          receipt.origin.clientName,
                          receipt.origin.toolName,
                          receipt.origin.transport,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Origin unavailable"}
                    {" · "}
                    <RelativeTime prefix="attempted" value={receipt.createdAt} />
                  </small>
                </span>
                <span className={receiptStyles.network}>
                  {receipt.network.label}
                  {receipt.network.target ? " (target)" : ""}
                </span>
                <span className={`${receiptStyles.receiptStatus} ${receiptStyles[receipt.status]}`}>
                  {receipt.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
