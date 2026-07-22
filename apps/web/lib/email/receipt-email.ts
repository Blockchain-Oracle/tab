import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { merchants, payments, settlements } from "../db/schema";
import { chainDisplay } from "../payments/chain-display";

/**
 * Buyer receipt email after settlement, sent through Resend's HTTP API
 * (no SDK dependency). Config-gated and truthful: when EMAIL_API_KEY /
 * EMAIL_FROM are absent the send reports "unavailable" — nothing ever
 * pretends an email went out. Failures never touch the payment path.
 *
 * Evidence rules: a real on-chain hash gets an explorer link; a simulated
 * sandbox settlement says so plainly — no invented links, ever.
 */

const SEND_TIMEOUT_MS = 4_000;

export type ReceiptEmailOutcome =
  | { detail?: string; state: "failed" }
  | { state: "sent" }
  | { state: "skipped"; why: "no-payer-email" | "not-settled" }
  | { state: "unavailable" };

function emailConfig() {
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function usd(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `$${amount}`;
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

export interface ReceiptEmailInput {
  amountUsd: string;
  /** Explorer link for a REAL on-chain settlement; null when simulated. */
  explorerTxUrl: string | null;
  merchantName: string;
  mode: "live" | "sandbox";
  networkName: string | null;
  refCode: string;
  settledAtIso: string;
  txHash: string | null;
}

const INK = "#161310";
const MUTED = "#6e6961";
const LINE = "#e7e3da";
const MONO = "'SFMono-Regular',Consolas,monospace";
const SANS = "Helvetica,Arial,sans-serif";

function settlementLineHtml(input: ReceiptEmailInput) {
  if (input.explorerTxUrl && input.txHash) {
    const short = `${input.txHash.slice(0, 10)}…${input.txHash.slice(-8)}`;
    return `<tr><td style="color:${MUTED};font-family:${SANS};font-size:12.5px;padding-top:6px">On-chain transaction · <a href="${input.explorerTxUrl}" style="color:${INK};font-family:${MONO}">${short}</a> <a href="${input.explorerTxUrl}" style="color:${INK}">↗</a></td></tr>`;
  }
  if (input.mode === "sandbox") {
    return `<tr><td style="color:${MUTED};font-family:${SANS};font-size:12.5px;padding-top:6px">Simulated settlement on the test network — no on-chain transaction exists for this payment.</td></tr>`;
  }
  return "";
}

export function receiptEmailHtml(input: ReceiptEmailInput) {
  const sandboxChip =
    input.mode === "sandbox"
      ? `<span style="border:1px solid #e3aa43;border-radius:999px;color:#8f6205;font-family:${MONO};font-size:10px;letter-spacing:.1em;padding:3px 10px;vertical-align:middle">SANDBOX</span>`
      : "";
  const sandboxNote =
    input.mode === "sandbox"
      ? `<tr><td style="color:#8f6205;font-family:${SANS};font-size:12px;padding-top:14px">Processed on the ${input.networkName ?? "test"} network — this is a testnet payment.</td></tr>`
      : "";
  const settled = new Date(input.settledAtIso).toUTCString().replace(" GMT", " UTC");
  return `<!doctype html><html lang="en"><body style="background:#faf8f3;margin:0;padding:32px 16px">
<table role="presentation" style="border-collapse:collapse;margin:0 auto;max-width:520px;width:100%">
<tr><td style="padding-bottom:14px">
  <span style="color:${INK};font-family:${SANS};font-size:17px;font-weight:700;letter-spacing:-.02em">Tab</span>
  <span style="border-left:2.5px solid #e8501f;margin:0 8px;vertical-align:middle"></span>
  <span style="color:${MUTED};font-family:${MONO};font-size:11px;letter-spacing:.08em">RECEIPT</span>
  &nbsp;${sandboxChip}
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px">
<table role="presentation" style="border-collapse:collapse;width:100%">
<tr><td style="color:${MUTED};font-family:${MONO};font-size:12px;letter-spacing:.08em">402 → 200</td>
<td style="color:${MUTED};font-family:${MONO};font-size:12px;text-align:right">${input.refCode}</td></tr>
<tr><td colspan="2" style="color:${INK};font-family:${MONO};font-size:46px;font-weight:700;padding:22px 0 6px">${usd(input.amountUsd)}</td></tr>
<tr><td colspan="2" style="color:${MUTED};font-family:${SANS};font-size:14px;padding-bottom:22px">Paid to <span style="color:${INK};font-weight:600">${input.merchantName}</span></td></tr>
<tr><td colspan="2" style="border-top:1px dashed ${LINE};padding-top:16px">
  <table role="presentation" style="border-collapse:collapse;width:100%">
    <tr><td style="color:${MUTED};font-family:${SANS};font-size:12.5px">Settled ${settled}</td></tr>
    <tr><td style="color:${MUTED};font-family:${SANS};font-size:12.5px;padding-top:6px">Reference <span style="color:${INK};font-family:${MONO}">${input.refCode}</span></td></tr>
    ${settlementLineHtml(input)}
    ${sandboxNote}
  </table>
</td></tr>
</table></td></tr>
<tr><td style="color:#a9a399;font-family:${SANS};font-size:11px;padding-top:16px;text-align:center">
Receipt from <a href="https://runtab.xyz" style="color:#a9a399">Tab</a> · invisible payments — for you, and for your AI
</td></tr>
</table></body></html>`;
}

/** Plain-text alternative — multipart emails score better with filters. */
export function receiptEmailText(input: ReceiptEmailInput) {
  const lines = [
    `Tab receipt ${input.refCode}${input.mode === "sandbox" ? " (sandbox)" : ""}`,
    "",
    `${usd(input.amountUsd)} paid to ${input.merchantName}`,
    `Settled ${new Date(input.settledAtIso).toUTCString().replace(" GMT", " UTC")}`,
    `Reference ${input.refCode}`,
  ];
  if (input.explorerTxUrl && input.txHash) {
    lines.push(`On-chain transaction: ${input.explorerTxUrl}`);
  } else if (input.mode === "sandbox") {
    lines.push("Simulated settlement on the test network — no on-chain transaction exists.");
  }
  if (input.mode === "sandbox") {
    lines.push("", "This is a testnet payment.");
  }
  lines.push("", "Tab · https://runtab.xyz");
  return lines.join("\n");
}

/** Read the settled payment's evidence and send the buyer receipt. */
export async function sendSettledReceiptEmail(
  db: Database,
  paymentId: string,
): Promise<ReceiptEmailOutcome> {
  const config = emailConfig();
  if (!config) return { state: "unavailable" };

  const [row] = await db
    .select({
      amountUsd: payments.amountUsd,
      env: payments.env,
      merchantName: merchants.businessName,
      payerEmail: payments.payerEmail,
      refCode: payments.refCode,
      settledAt: payments.settledAt,
      tokenChainId: payments.tokenChainId,
      txHash: settlements.txHash,
      verificationMethod: settlements.verificationMethod,
    })
    .from(payments)
    .innerJoin(merchants, eq(merchants.id, payments.merchantId))
    .leftJoin(settlements, eq(settlements.paymentId, payments.id))
    .where(and(eq(payments.id, paymentId), eq(payments.status, "settled")))
    .limit(1);

  if (!row?.settledAt) return { state: "skipped", why: "not-settled" };
  if (!row.payerEmail) return { state: "skipped", why: "no-payer-email" };

  const chain = chainDisplay(row.tokenChainId);
  const realHash = row.verificationMethod !== "simulated_test" ? row.txHash : null;
  const input: ReceiptEmailInput = {
    amountUsd: row.amountUsd,
    explorerTxUrl: realHash && chain.explorerTxUrl ? chain.explorerTxUrl(realHash) : null,
    merchantName: row.merchantName ?? "the merchant",
    mode: row.env === "live" ? "live" : "sandbox",
    networkName: row.env === "live" ? chain.label : "Base Sepolia",
    refCode: row.refCode,
    settledAtIso: row.settledAt.toISOString(),
    txHash: realHash,
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: config.from,
        html: receiptEmailHtml(input),
        subject: `Receipt ${row.refCode} · ${usd(row.amountUsd)}${input.mode === "sandbox" ? " (sandbox)" : ""}`,
        text: receiptEmailText(input),
        to: [row.payerEmail],
      }),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { detail: `Resend responded ${response.status}`, state: "failed" };
    }
    return { state: "sent" };
  } catch (error) {
    return { detail: error instanceof Error ? error.message : "send failed", state: "failed" };
  }
}
