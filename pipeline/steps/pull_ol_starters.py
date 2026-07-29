"""Builds rows for the `ol_starters` table: the current starter at each of
the 5 O-line positions, per team. ESPN's depth chart data isn't organized by
NFL week -- it's a series of snapshots stamped with a real-world date (`dt`)
that gets updated whenever a team's depth chart changes, even in the
offseason. So we just take the most recent snapshot per team/position."""

import nflreadpy as nfl
import pandas as pd

OL_POSITIONS = ["LT", "LG", "C", "RG", "RT"]


def pull_ol_starters(season: int, as_of_week: int) -> list[dict]:
    dc = nfl.load_depth_charts(seasons=season).to_pandas()

    dc = dc[dc["pos_abb"].isin(OL_POSITIONS) & (dc["pos_rank"] == 1)]
    dc = dc.sort_values("dt").drop_duplicates(["team", "pos_abb"], keep="last")

    rows = []
    for _, r in dc.iterrows():
        rows.append(
            {
                "team_abbr": r["team"],
                "position": r["pos_abb"],
                "player_id": None if pd.isna(r["gsis_id"]) else r["gsis_id"],
                "player_name": r["player_name"],
                "season": season,
                "as_of_week": as_of_week,
            }
        )
    return rows
