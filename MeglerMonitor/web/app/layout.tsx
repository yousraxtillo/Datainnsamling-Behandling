import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Megler Monitor",
  description: "Listings intelligence for DNB Eiendom and Hjem.no",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen bg-background text-foreground`}>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 pt-6">
          <header className="flex items-center justify-between pb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Megler Monitor</h1>
              <p className="text-sm text-muted-foreground">
                Norwegian property listings dashboard powered by daily scrapes.
              </p>
            </div>
            <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
              <a href="/">Overview</a>
              <a href="/data">Data</a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
