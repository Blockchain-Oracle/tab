import type { ReactNode } from "react";

export const metadata = { title: "Tab example storefront" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
