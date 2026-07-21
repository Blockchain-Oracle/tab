/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative aria-hidden tally marks; accessible labels live on the surrounding elements. */
import { ImageResponse } from "next/og";

import { getServerDatabase } from "../../../lib/db/server";
import { formatShareAmount, readShareableReceipt } from "../../../lib/receipts/share-card";

export const revalidate = 3600;
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";
export const alt = "Settled Tab receipt";

/** The unfurl card: the receipt's money truth at a glance. */
export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await readShareableReceipt(getServerDatabase().db, id);

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#faf8f3",
        color: "#161310",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "2px solid #e7e3da",
          borderRadius: 24,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          padding: "56px 64px",
          width: 900,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <svg fill="none" height="44" viewBox="0 0 24 24" width="44">
            <path d="M5 5v14" stroke="#161310" strokeLinecap="round" strokeWidth="2.2" />
            <path d="M10 5v14" stroke="#161310" strokeLinecap="round" strokeWidth="2.2" />
            <path d="M15 5v14" stroke="#161310" strokeLinecap="round" strokeWidth="2.2" />
            <path d="M20 5v14" stroke="#161310" strokeLinecap="round" strokeWidth="2.2" />
            <path d="M2 17 22 7" stroke="#e8501f" strokeLinecap="round" strokeWidth="2.4" />
          </svg>
          <div style={{ color: "#6e6961", display: "flex", fontSize: 28 }}>402 → 200</div>
        </div>

        {receipt ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", fontSize: 110, fontWeight: 700 }}>
              {formatShareAmount(receipt.amountUsd)}
            </div>
            <div style={{ color: "#6e6961", display: "flex", fontSize: 30 }}>
              Paid by an AI agent via x402 · {receipt.networkName}
            </div>
            <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
              <div
                style={{
                  border: "5px solid #0e7a45",
                  borderRadius: 12,
                  color: "#0e7a45",
                  display: "flex",
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: 4,
                  padding: "8px 22px",
                  transform: "rotate(-2deg)",
                }}
              >
                SETTLED
              </div>
              <div
                style={{
                  color: receipt.testFunds ? "#8f6205" : "#6e6961",
                  display: "flex",
                  fontSize: 26,
                }}
              >
                {receipt.testFunds ? "Sandbox funds — no real value" : "Verified on-chain"}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>Tab receipt</div>
        )}
      </div>
    </div>,
    size,
  );
}
