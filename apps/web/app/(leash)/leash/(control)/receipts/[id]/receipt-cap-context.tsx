import { formatUsdAtomic } from "../../../../../../lib/leash/leash-format";
import type { ReceiptItem } from "../../receipt-client";
import styles from "./receipt-detail.module.css";

function evidenceCopy(receipt: ReceiptItem) {
  const context = receipt.capContext;
  if (!context) {
    return (
      <>
        Receipt-time cap context is unavailable for this legacy receipt. Current cap data is not
        substituted.
      </>
    );
  }

  const cap = formatUsdAtomic(context.capAtomic);
  const committedBefore = formatUsdAtomic(context.committedBeforeAtomic);
  const projectedAfter = formatUsdAtomic(context.projectedAfterAtomic);
  if (receipt.status === "settled") {
    return (
      <>
        Cumulative committed spend after this payment is {projectedAfter} of {cap}.
      </>
    );
  }
  if (receipt.status === "pending") {
    return (
      <>
        Cumulative committed spend including this pending payment is {projectedAfter} of {cap}.
      </>
    );
  }
  if (receipt.status === "blocked") {
    return (
      <>
        This attempt would have pushed cumulative committed spend to {projectedAfter} of {cap}.
        Nothing was sent, and blocked attempts do not count toward the cap.
      </>
    );
  }
  if (receipt.txHash) {
    return (
      <>
        This matching reverted EIP-3009 call remains committed for its entire cap cycle. A revert
        does not prove Tab&apos;s issued authorization was consumed or unused, so the reservation
        stays conservative.
      </>
    );
  }
  return (
    <>
      Cumulative committed spend remained {committedBefore} of {cap}. This failed attempt does not
      count toward the cap.
    </>
  );
}

export function ReceiptCapContext({ receipt }: { receipt: ReceiptItem }) {
  return (
    <section aria-label="Receipt-time cap evidence" className={styles.capContext}>
      <b>CAP AT ATTEMPT</b>
      <p>{evidenceCopy(receipt)}</p>
    </section>
  );
}
