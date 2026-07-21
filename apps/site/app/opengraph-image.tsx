import { ImageResponse } from "next/og";

export const alt = "Tab — Invisible payments for people and AI";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

/** Kinetic Ledger share card: ink on paper, one vermilion vector, 402→200. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#FAF8F3",
        color: "#161310",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "64px 78px 56px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
          <svg fill="none" height="34" viewBox="0 0 24 24" width="34">
            <title>Tab</title>
            <g stroke="#161310" strokeLinecap="round" strokeWidth="2.6">
              <line x1="4.4" x2="4.4" y1="4.5" y2="19.5" />
              <line x1="9.47" x2="9.47" y1="4.5" y2="19.5" />
              <line x1="14.53" x2="14.53" y1="4.5" y2="19.5" />
              <line x1="19.6" x2="19.6" y1="4.5" y2="19.5" />
              <line x1="1.8" x2="22.2" y1="16.8" y2="7.2" />
            </g>
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 650, letterSpacing: -1 }}>
            tab
          </div>
        </div>
        <div
          style={{
            alignItems: "baseline",
            display: "flex",
            fontSize: 40,
            fontWeight: 700,
            gap: 18,
          }}
        >
          <span style={{ opacity: 0.4, textDecoration: "line-through" }}>402</span>
          <span style={{ color: "#E8501F" }}>→</span>
          <span>200</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 92,
            fontWeight: 650,
            letterSpacing: -3.5,
            lineHeight: 1.02,
          }}
        >
          <span>Invisible payments —</span>
          <span>
            for you, and for your <span style={{ color: "#E8501F", marginLeft: 18 }}>AI.</span>
          </span>
        </div>
        <div
          style={{
            background: "linear-gradient(90deg, #E8501F, rgba(232, 80, 31, 0))",
            borderRadius: 3,
            display: "flex",
            height: 10,
            width: 430,
          }}
        />
      </div>

      <div
        style={{
          alignItems: "center",
          borderTop: "2px solid #E7E3DA",
          display: "flex",
          fontSize: 22,
          justifyContent: "space-between",
          paddingTop: 26,
        }}
      >
        <span style={{ color: "#6E6961", display: "flex" }}>Checkout by email</span>
        <span style={{ color: "#6E6961", display: "flex" }}>Agents pay x402, under caps</span>
        <span
          style={{
            border: "3px solid #0E7A45",
            borderRadius: 8,
            color: "#0E7A45",
            display: "flex",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            padding: "8px 14px",
            transform: "rotate(-3deg)",
          }}
        >
          VERIFIED
        </span>
      </div>
    </div>,
    size,
  );
}
