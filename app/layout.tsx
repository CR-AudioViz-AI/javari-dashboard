// crav-dashboard-app/app/layout.tsx
import type { Metadata, Viewport } from "next";
import Script from 'next/script';
import { Inter } from "next/font/google";
import "./globals.css";
import IframeBridge from "./IframeBridge";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "CRAV Dashboard", template: "%s · CRAV Dashboard" },
  description: "Unified, enterprise-grade control center for all CRAV applications.",
  applicationName: "CRAV Dashboard",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const viewport: Viewport = {
  themeColor: "#0B1A2A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-[var(--bg)] text-slate-700`}>
        {/* IMPORTANT: no in-app brand header or logo here.
           The website shell already provides global header/footer.
           This keeps the embedded dashboard clean and avoids duplicate branding. */}
        <IframeBridge />

        {/* Page wrapper with consistent spacing so nothing is cut off */}
        <main className="page container">
          {children}
        </main>
              {/* Javari AI Assistant */}
        <Script src="https://javariai.com/embed.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
