"use client";

import { useState } from "react";
import type { HomepageTeam } from "@/lib/getHomepageData";
import { DivisionGrid } from "@/components/DivisionGrid";
import { TierGrid } from "@/components/TierGrid";

type View = "division" | "tier";

/** Client-only tab state so switching views doesn't re-fetch or reload --
 * `teams` is fetched once, server-side, in page.tsx and handed down. */
export function HomepageViewToggle({ teams, season }: { teams: HomepageTeam[]; season: number }) {
  const [view, setView] = useState<View>("division");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Offensive line grades</h1>
          <p className="text-ink-muted">{season} season &middot; updated weekly &middot; 2026 to come</p>
        </div>
        <div className="flex w-fit shrink-0 self-center gap-1 rounded-full border border-line bg-surface p-1 sm:self-auto">
          {(
            [
              ["division", "Division view"],
              ["tier", "Tier view"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={
                view === key
                  ? "rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-ink"
                  : "rounded-full px-3 py-1 text-sm font-semibold text-ink-muted hover:text-ink"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "division" ? <DivisionGrid teams={teams} season={season} /> : <TierGrid teams={teams} season={season} />}
    </div>
  );
}
