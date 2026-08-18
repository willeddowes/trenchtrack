"use client";

import { useState } from "react";
import Link from "next/link";
import { TeamSearch } from "@/components/TeamSearch";
import { PlayerSearch } from "@/components/PlayerSearch";
import { CURRENT_SEASON } from "@/lib/teamsStatic";
import type { getPlayerSearchIndex } from "@/lib/getPlayerSearchIndex";

type Props = {
  players: Awaited<ReturnType<typeof getPlayerSearchIndex>>;
};

// Below sm, there isn't room for logo + nav + both search boxes on one
// row: Team Stats/Articles (hidden here, rendered in layout.tsx's <nav>)
// collapse into this burger dropdown, and the two search boxes collapse
// behind a magnifying-glass toggle. sm+ shows both search boxes inline,
// pushed to the far right with ml-auto.
export function HeaderSearch({ players }: Props) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <div className="ml-auto flex items-center gap-2 sm:hidden">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-base"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "Hide menu" : "Show menu"}
          >
            <span aria-hidden>{mobileNavOpen ? "✕" : "☰"}</span>
          </button>
          {mobileNavOpen && (
            <div className="absolute right-0 top-11 z-10 flex w-40 flex-col gap-1 rounded-lg border border-line bg-surface p-2 shadow-lg">
              <Link
                href={`/stats/${CURRENT_SEASON}`}
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 text-sm font-bold text-ink-muted hover:bg-background hover:text-ink"
              >
                Team Stats
              </Link>
              <Link
                href="/articles"
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 text-sm font-bold text-ink-muted hover:bg-background hover:text-ink"
              >
                Articles
              </Link>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileSearchOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-base"
          aria-expanded={mobileSearchOpen}
          aria-label={mobileSearchOpen ? "Hide search" : "Show search"}
        >
          <span aria-hidden>{mobileSearchOpen ? "✕" : "🔍"}</span>
        </button>
      </div>

      <div
        className={`${mobileSearchOpen ? "flex" : "hidden"} w-full flex-col gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-3`}
      >
        <TeamSearch />
        <PlayerSearch players={players} />
      </div>
    </>
  );
}
