import type { Metadata, Viewport } from "next";
import { Cinzel, Figtree } from "next/font/google";
import "./globals.css";

// Cinzel echoes the logo's flared serif caps (headings only).
// Figtree is the plain, friendly body font.
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["700", "900"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Diatonics Tickets", template: "%s · Diatonics" },
  description: "Tickets and donations for Diatonics a cappella concerts in New York City.",
};

export const viewport: Viewport = {
  themeColor: "#eef6fc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cinzel.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
