import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import "@tab/ui/theme.css";
import "@tab/ui/shell.css";
import "@tab/ui/primitives.css";
import "./globals.css";

// General Sans is the product face. It also backfills the legacy
// --font-geist variable so every existing CSS module renders it.
const generalSans = localFont({
  display: "swap",
  src: [
    { path: "../fonts/GeneralSans-Variable.woff2", style: "normal", weight: "200 700" },
    { path: "../fonts/GeneralSans-VariableItalic.woff2", style: "italic", weight: "200 700" },
  ],
  variable: "--font-general-sans",
});

const geistMono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: { default: "Tab", template: "%s · Tab" },
  description: "Invisible payments — for you, and for your AI.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const themeCookie = (await cookies()).get("tab_theme")?.value;
  const theme = themeCookie === "dark" ? "dark" : "light";

  return (
    <html lang="en">
      <body
        className={`${generalSans.variable} ${geistMono.variable}`}
        data-tab-theme={theme}
        data-tab-ui=""
      >
        {children}
      </body>
    </html>
  );
}
