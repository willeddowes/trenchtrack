import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { TeamSearch } from "@/components/TeamSearch";
import { PlayerSearch } from "@/components/PlayerSearch";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import { getPlayerSearchIndex } from "@/lib/getPlayerSearchIndex";

export const revalidate = 86400; // regenerate at most once a day, matching every other page

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const players = await getPlayerSearchIndex();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-ink">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4 sm:gap-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-extrabold text-accent-ink">
              TT
            </span>
            TrenchTrack
          </Link>
          <Link href={`/stats/${CURRENT_SEASON}`} className="text-sm font-bold text-ink-muted hover:text-ink">
            Team Stats
          </Link>
          {/* Full-width and stacked below sm so the two search boxes wrap
              to their own row instead of overflowing the header alongside
              the logo/nav link -- there's no room for all four on one row
              below ~640px. */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:gap-3">
            <TeamSearch />
            <PlayerSearch players={players} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
