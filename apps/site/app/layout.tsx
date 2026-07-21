import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import { ThemeShell } from "@/components/theme-shell";
import { SITE_ORIGIN } from "@/lib/urls";

import "@tab/ui/theme.css";
import "@tab/ui/primitives.css";
import "./styles/base.css";
import "./styles/kinetic.css";
import "./styles/sections.css";
import "./styles/theme-toggle.css";
import "./styles/boundary.css";

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
  alternates: { canonical: "/" },
  description:
    "Tab gives people an email checkout and AI agents a policy-controlled way to pay x402 bills.",
  metadataBase: SITE_ORIGIN,
  openGraph: {
    description: "One payment rail for human checkout and policy-first agent payments.",
    siteName: "Tab",
    title: "Invisible payments — for you, and for your AI.",
    type: "website",
    url: "/",
  },
  title: "Tab — Invisible payments for people and AI",
  twitter: {
    card: "summary_large_image",
    description: "One payment rail for human checkout and policy-first agent payments.",
    title: "Tab — Invisible payments for people and AI",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${generalSans.variable} ${geistMono.variable}`}>
        <ThemeShell>{children}</ThemeShell>
      </body>
    </html>
  );
}
