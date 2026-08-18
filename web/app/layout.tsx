import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { HeaderSearch } from "@/components/HeaderSearch";
import { LogoMark } from "@/components/LogoMark";
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent p-1.5 text-accent-ink">
              <LogoMark className="h-full w-full" />
            </span>
            TrenchTrack
          </Link>
          <Link href={`/stats/${CURRENT_SEASON}`} className="text-sm font-bold text-ink-muted hover:text-ink">
            Team Stats
          </Link>
          <Link href="/articles" className="text-sm font-bold text-ink-muted hover:text-ink">
            Articles
          </Link>
          {/* Below sm there's no room for logo + nav + both search boxes on
              one row, so HeaderSearch hides them behind a magnifying-glass
              toggle on mobile; sm+ keeps them always visible inline. */}
          <HeaderSearch players={players} />
        </header>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
