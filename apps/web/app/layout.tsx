import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tab",
  description: "Invisible payments — for you, and for your AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
