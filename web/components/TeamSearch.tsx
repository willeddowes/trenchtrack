"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CURRENT_SEASON, TEAMS } from "@/lib/teamsStatic";

// Only 32 teams, so a plain <datalist> (browser-native autocomplete) is
// plenty fast -- unlike the ~550-player search on the ESPN entry page,
// there's no need for a custom-filtered dropdown here.
export function TeamSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function goToTeam(typedName: string) {
    const match = TEAMS.find((t) => t.name.toLowerCase() === typedName.toLowerCase());
    if (match) {
      router.push(`/team/${match.slug}/${CURRENT_SEASON}`);
      setValue("");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        goToTeam(value);
      }}
      className="flex max-w-sm flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2"
    >
      <span aria-hidden>🔍</span>
      <input
        type="text"
        list="team-search-list"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          goToTeam(e.target.value); // jump as soon as a full name is picked from the list
        }}
        placeholder="Search a team..."
        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
      />
      <datalist id="team-search-list">
        {TEAMS.map((t) => (
          <option key={t.slug} value={t.name} />
        ))}
      </datalist>
    </form>
  );
}
