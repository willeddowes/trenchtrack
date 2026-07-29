import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">
        <div className="flex justify-end border-b border-gray-200 p-3">
          <a
            href="https://ko-fi.com/YOUR_HANDLE"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300"
          >
            ☕ Buy me a coffee
          </a>
        </div>
        {children}
      </body>
    </html>
  );
}
