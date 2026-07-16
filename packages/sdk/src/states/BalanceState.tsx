import { BUYER_COPY, buyerFormat } from "../copy";
import { center, colors, panel, primaryButton } from "../styles";

type Props = { amount: string; balance: string; merchantName: string; onConfirm(): void };

export function BalanceState({ amount, balance, merchantName, onConfirm }: Props) {
  return (
    <div style={center}>
      <div style={{ fontSize: 36, fontWeight: 600 }}>${amount}</div>
      <div style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
        {buyerFormat.toMerchant(merchantName)}
      </div>
      <div style={{ ...panel, marginTop: 20 }}>
        <span style={{ color: colors.muted, fontSize: 13 }}>{BUYER_COPY.balance.label}</span>
        <strong style={{ fontSize: 13 }}>{buyerFormat.available(`$${balance}`)}</strong>
      </div>
      <button onClick={onConfirm} style={{ ...primaryButton, marginTop: 16 }} type="button">
        {buyerFormat.pay(`$${amount}`)}
      </button>
    </div>
  );
}
