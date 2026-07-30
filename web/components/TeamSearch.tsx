"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CURRENT_SEASON, TEAMS } from "@/lib/teamsStatic";

type Team = (typeof TEAMS)[number];

// Every NFL team name is "<city> <mascot>" with the mascot as exactly the
// last word (including multi-word cities like "Kansas City" or "Tampa Bay"),
// so splitting on the last space cleanly separates the two.
function cityAndMascot(name: string): { city: string; mascot: string } {
  const lastSpace = name.lastIndexOf(" ");
  return { city: name.slice(0, lastSpace), mascot: name.slice(lastSpace + 1) };
}

// Only 32 teams, so filtering in-memory on every keystroke is instant --
// unlike the ~550-player search on the old ESPN entry page, there's no
// need for debouncing or a server round-trip. No suggestions show until
// the user has typed something, and only teams where the city or the
// mascot starts with what they typed match (not a match anywhere in the
// name -- typing "e" shouldn't surface every team with an "e" in it).
export function TeamSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const query = value.trim().toLowerCase();
  const matches: Team[] =
    query.length === 0
      ? []
      : TEAMS.filter((t) => {
          const { city, mascot } = cityAndMascot(t.name);
          return city.toLowerCase().startsWith(query) || mascot.toLowerCase().startsWith(query);
        });
  const showDropdown = isOpen && matches.length > 0;

  function selectTeam(team: Team) {
    router.push(`/team/${team.slug}/${CURRENT_SEASON}`);
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
              const team = matches[highlightedIndex] ?? matches[0];
              if (team) selectTeam(team);
            } else if (e.key === "Escape") {
              setValue("");
              setIsOpen(false);
            }
          }}
          placeholder="Search a team..."
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
      </div>

      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {matches.map((team, i) => (
            <li key={team.slug}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focused so onBlur doesn't fire before onClick
                onClick={() => selectTeam(team)}
                className={`block w-full px-4 py-1.5 text-left text-sm ${
                  i === highlightedIndex ? "bg-background font-semibold" : "hover:bg-background"
                }`}
              >
                {team.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
