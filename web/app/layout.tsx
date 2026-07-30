import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { TeamSearch } from "@/components/TeamSearch";
import { CURRENT_SEASON } from "@/lib/teamsStatic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrenchTrack — NFL Offensive Line Grades",
  description: "Free O-line stats and report-card grades for every NFL team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-ink">
        <header className="flex items-center gap-5 border-b border-line px-6 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-extrabold text-accent-ink">
              TT
            </span>
            TrenchTrack
          </Link>
          <Link href={`/stats/${CURRENT_SEASON}`} className="text-sm font-bold text-ink-muted hover:text-ink">
            Team Stats
          </Link>
          <TeamSearch />
        </header>
        {children}
      </body>
    </html>
  );
}
