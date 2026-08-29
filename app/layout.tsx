import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BengTiPredictor",
  description:
    "Fantasy calculator and bracket predictor for The International. Build banners, plan rerolls and simulate the bracket on real OpenDota match data.",
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">B</span>
              <span>BengTiPredictor</span>
            </Link>
            <nav>
              <Link href="/">Overview</Link>
              <Link href="/fantasy">Fantasy</Link>
              <Link href="/bracket">Bracket</Link>
              <Link href="/method">Method</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell">
            Data from OpenDota. Not affiliated with Valve Corporation.
          </div>
        </footer>
      </body>
    </html>
  );
}
