"""Builds rows for the `players` table: one row per player, showing their
current team. We take the most recent week's roster entry per player, since
load_rosters() returns one row per player per week (players can technically
appear on multiple teams across a season if traded)."""

import nflreadpy as nfl
import pandas as pd


def pull_players(season: int) -> list[dict]:
    rosters = nfl.load_rosters(seasons=season).to_pandas()

    # Keep only each player's latest week so we get their current team.
    rosters = rosters.sort_values("week").drop_duplicates("gsis_id", keep="last")

    rows = []
    for _, r in rosters.iterrows():
        if pd.isna(r["gsis_id"]) or not r["gsis_id"]:
            continue  # a handful of practice-squad entries lack a gsis_id
        rows.append(
            {
                "player_id": r["gsis_id"],
                "full_name": r["full_name"],
                "position": r["position"],
                "team_abbr": r["team"],
                "headshot_url": None if pd.isna(r["headshot_url"]) else r["headshot_url"],
            }
        )
    return rows
