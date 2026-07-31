"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlayerSearchEntry } from "@/lib/getPlayerSearchIndex";

// Same hand-built filtered-dropdown pattern as TeamSearch.tsx (per
// CLAUDE.md: native <datalist> always shows its full option list on
// focus, so this project avoids it for any search/autocomplete). Unlike
// team names, player names don't split into "city/mascot" -- instead any
// word in the name can match, so typing "daw" finds "Dion Dawkins" just
// as typing "dion" would.
export function PlayerSearch({ players }: { players: PlayerSearchEntry[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const query = value.trim().toLowerCase();
  const matches: PlayerSearchEntry[] =
    query.length === 0
      ? []
      : players
          .filter((p) => p.name.toLowerCase().split(" ").some((word) => word.startsWith(query)))
          .slice(0, 20); // cap the dropdown -- hundreds of matches on a single letter isn't useful
  const showDropdown = isOpen && matches.length > 0;

  function selectPlayer(player: PlayerSearchEntry) {
    router.push(`/player/${player.slug}`);
    setValue("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  return (
    <div className="relative max-w-sm flex-1">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2">
        <span aria-hidden>🔍</span>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const player = matches[highlightedIndex] ?? matches[0];
              if (player) selectPlayer(player);
            } else if (e.key === "Escape") {
              setValue("");
              setIsOpen(false);
            }
          }}
          placeholder="Search a player..."
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
      </div>

      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {matches.map((player, i) => (
            <li key={player.slug}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focused so onBlur doesn't fire before onClick
                onClick={() => selectPlayer(player)}
                className={`block w-full px-4 py-1.5 text-left text-sm ${
                  i === highlightedIndex ? "bg-background font-semibold" : "hover:bg-background"
                }`}
              >
                {player.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
