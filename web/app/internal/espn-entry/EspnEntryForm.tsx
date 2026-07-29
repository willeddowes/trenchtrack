"use client";

import { useState } from "react";

type Team = { team_abbr: string; team_name: string };
type Player = { player_id: string; full_name: string; team_abbr: string | null; position: string | null };

const CURRENT_SEASON = 2025;

/** A small reusable status message shown after submitting either form. */
function StatusMessage({ status }: { status: "idle" | "saving" | "saved" | "error"; errorText?: string }) {
  if (status === "saved") return <p className="text-green-700">Saved.</p>;
  if (status === "saving") return <p className="text-gray-500">Saving...</p>;
  return null;
}

export function TeamEntryForm({ teams }: { teams: Team[] }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/espn-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "team",
        team_abbr: form.get("team_abbr"),
        season: Number(form.get("season")),
        pass_block_win_rate: numberOrNull(form.get("pass_block_win_rate")),
        run_block_win_rate: numberOrNull(form.get("run_block_win_rate")),
        notes: form.get("notes") || null,
      }),
    });

    if (res.ok) {
      setStatus("saved");
      e.currentTarget.reset();
    } else {
      const body = await res.json();
      setErrorText(body.error ?? "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold">Team-level ESPN rates</h2>

      <Field label="Team">
        <select name="team_abbr" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          {teams.map((t) => (
            <option key={t.team_abbr} value={t.team_abbr}>
              {t.team_name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Season">
        <input name="season" type="number" defaultValue={CURRENT_SEASON} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Pass Block Win Rate (%)">
        <input name="pass_block_win_rate" type="number" step="0.1" min="0" max="100" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Run Block Win Rate (%)">
        <input name="run_block_win_rate" type="number" step="0.1" min="0" max="100" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Notes (optional)">
        <input name="notes" type="text" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        Save team entry
      </button>
      <StatusMessage status={status} />
      {status === "error" && <p className="text-red-600">{errorText}</p>}
    </form>
  );
}

export function PlayerEntryForm({ players }: { players: Player[] }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // With ~550 O-line players, rendering all of them at once (e.g. in a
  // native <datalist>) is slow enough to noticeably lag the page. Instead,
  // only compute and render a handful of matches for whatever's been typed
  // so far.
  const matches =
    selectedPlayer || searchText.trim().length < 2
      ? []
      : players.filter((p) => playerLabel(p).toLowerCase().includes(searchText.toLowerCase())).slice(0, 8);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    if (!selectedPlayer) {
      setErrorText("Pick a player from the suggested list (start typing a name).");
      setStatus("error");
      return;
    }

    setStatus("saving");
    const res = await fetch("/api/espn-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "player",
        player_id: selectedPlayer.player_id,
        team_abbr: null, // API route falls back to the player's current team
        season: Number(form.get("season")),
        position: null, // API route falls back to the player's current position
        pass_block_win_rate: numberOrNull(form.get("pass_block_win_rate")),
        run_block_win_rate: numberOrNull(form.get("run_block_win_rate")),
        notes: form.get("notes") || null,
      }),
    });

    if (res.ok) {
      setStatus("saved");
      e.currentTarget.reset();
      setSearchText("");
      setSelectedPlayer(null);
    } else {
      const body = await res.json();
      setErrorText(body.error ?? "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold">Player-level ESPN rates</h2>

      <Field label="Player (start typing a name)">
        <input
          type="text"
          value={selectedPlayer ? playerLabel(selectedPlayer) : searchText}
          onChange={(e) => {
            setSelectedPlayer(null);
            setSearchText(e.target.value);
          }}
          autoComplete="off"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {matches.length > 0 && (
          <ul className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-200">
            {matches.map((p) => (
              <li key={p.player_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlayer(p);
                    setSearchText("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  {playerLabel(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Season">
        <input name="season" type="number" defaultValue={CURRENT_SEASON} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Pass Block Win Rate (%)">
        <input name="pass_block_win_rate" type="number" step="0.1" min="0" max="100" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Run Block Win Rate (%)">
        <input name="run_block_win_rate" type="number" step="0.1" min="0" max="100" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <Field label="Notes (optional)">
        <input name="notes" type="text" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </Field>

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        Save player entry
      </button>
      <StatusMessage status={status} />
      {status === "error" && <p className="text-red-600">{errorText}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function playerLabel(p: Player): string {
  return `${p.full_name} (${p.team_abbr ?? "?"}) - ${p.position ?? ""}`;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  return Number(value);
}
