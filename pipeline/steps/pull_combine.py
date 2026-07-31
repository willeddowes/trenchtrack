"""Builds rows for the `player_combine` table from nflreadpy's official
load_combine() data: 40-yard dash, bench, vertical, broad jump, 3-cone,
shuttle. No percentiles (nflreadpy doesn't compute them -- see the
one-off mockdraftable scrape for that) and no arm length/hand size/
wingspan (not in this source either).

load_combine() has no gsis_id -- only pfr_id/cfb_id, neither of which we
can join against `players`/`ol_depth_chart` (both keyed on gsis_id) -- so
players are matched by normalized name instead, same tradeoff already
used in pull_ol_depth_chart.py. Two tiers:
  1. (normalized_name, draft_year) when the player has a `players` row
     with a known draft_year -- high confidence, avoids name collisions.
  2. normalized-name-only, but only when exactly one OL-position combine
     row shares that name -- if the name is ambiguous with no draft_year
     to disambiguate, skip rather than risk a wrong match.

Covers every player who's ever appeared in ol_depth_chart (all seasons),
not just the current roster, so retired/departed players are matched too
wherever the ol_depth_chart data has captured them.
"""

import nflreadpy as nfl
import pandas as pd

from name_matching import normalize_name
from write_to_supabase import fetch_all

OL_COMBINE_POSITIONS = ["OT", "OG", "C", "OL", "G"]


def pull_combine(client) -> list[dict]:
    depth_chart_rows = fetch_all(client, "ol_depth_chart", "player_id,player_name", not_null="player_id")
    players_rows = fetch_all(client, "players", "player_id,draft_year")
    draft_year_by_id = {r["player_id"]: r["draft_year"] for r in players_rows if r["draft_year"] is not None}

    # Dedupe our own player universe (a player appears once per team/season/position).
    our_players: dict[str, str] = {}
    for row in depth_chart_rows:
        our_players.setdefault(row["player_id"], row["player_name"])

    combine = nfl.load_combine().to_pandas()
    combine["name_norm"] = combine["player_name"].apply(normalize_name)

    by_name_and_year: dict[tuple[str, int], pd.Series] = {}
    for _, row in combine.iterrows():
        if pd.isna(row["draft_year"]) or row["name_norm"] is None:
            continue
        by_name_and_year[(row["name_norm"], int(row["draft_year"]))] = row

    ol_combine = combine[combine["pos"].isin(OL_COMBINE_POSITIONS)]
    name_counts = ol_combine["name_norm"].value_counts()
    unambiguous_by_name = {
        name: group.iloc[0]
        for name, group in ol_combine.groupby("name_norm")
        if name_counts.get(name, 0) == 1
    }

    # A mockdraftable-enriched row is strictly better than what this nflreadpy
    # pass can produce (more measurables, plus percentiles) -- don't let a
    # routine pipeline re-run clobber it back down via the upsert below.
    already_enriched = {
        r["player_id"]
        for r in fetch_all(client, "player_combine", "player_id,source")
        if r["source"] == "mockdraftable"
    }

    def _clean(value) -> float | None:
        return None if pd.isna(value) else float(value)

    def _clean_int(value) -> int | None:
        return None if pd.isna(value) else int(value)

    rows = []
    for player_id, player_name in our_players.items():
        if player_id in already_enriched:
            continue
        name_norm = normalize_name(player_name)
        draft_year = draft_year_by_id.get(player_id)

        match = None
        if draft_year is not None:
            match = by_name_and_year.get((name_norm, draft_year))
        if match is None:
            match = unambiguous_by_name.get(name_norm)
        if match is None:
            continue

        rows.append(
            {
                "player_id": player_id,
                "player_name": player_name,
                "position": match["pos"],
                "forty": _clean(match["forty"]),
                "bench": _clean_int(match["bench"]),
                "vertical": _clean(match["vertical"]),
                "broad_jump": _clean(match["broad_jump"]),
                "cone": _clean(match["cone"]),
                "shuttle": _clean(match["shuttle"]),
                "source": "nflreadpy",
            }
        )
    return rows
