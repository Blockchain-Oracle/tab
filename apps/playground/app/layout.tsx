import "@tab/ui/theme.css";
import "./playground.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  description:
    "Pay with nothing but an email — a live Tab checkout on real Base Sepolia rails. Try it, then copy the code that runs it.",
  title: "Tab Playground — try invisible payments live",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-tab-theme="light" lang="en">
      <body>{children}</body>
    </html>
  );
}
