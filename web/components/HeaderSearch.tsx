"use client";

import { useState } from "react";
import { TeamSearch } from "@/components/TeamSearch";
import { PlayerSearch } from "@/components/PlayerSearch";
import type { getPlayerSearchIndex } from "@/lib/getPlayerSearchIndex";

type Props = {
  players: Awaited<ReturnType<typeof getPlayerSearchIndex>>;
};

// Below sm, the two search bars stay hidden until the magnifying-glass
// button is tapped -- there isn't room for logo + nav + both search boxes
// on a phone-width header. sm+ keeps the old always-visible layout, so this
// component only changes anything below that breakpoint.
export function HeaderSearch({ players }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-base sm:hidden"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Hide search" : "Show search"}
      >
        <span aria-hidden>{mobileOpen ? "✕" : "🔍"}</span>
      </button>

      <div
        className={`${mobileOpen ? "flex" : "hidden"} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:gap-3`}
      >
        <TeamSearch />
        <PlayerSearch players={players} />
      </div>
    </>
  );
}
