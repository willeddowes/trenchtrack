"""Builds rows for the `players` table: one row per player, showing their
current team. We take the most recent week's roster entry per player, since
load_rosters() returns one row per player per week (players can technically
appear on multiple teams across a season if traded).

Bio/draft fields (height, weight, college, draft info) come from a second
source, load_players() -- a league-wide, not season-scoped, player database.
load_rosters() doesn't carry an explicit draft round, so both are merged
here by gsis_id rather than picking one source."""

import nflreadpy as nfl
import pandas as pd


def _clean_int(value) -> int | None:
    return None if pd.isna(value) else int(value)


def pull_players(season: int) -> list[dict]:
    rosters = nfl.load_rosters(seasons=season).to_pandas()

    # Keep only each player's latest week so we get their current team.
    rosters = rosters.sort_values("week").drop_duplicates("gsis_id", keep="last")

    bio = nfl.load_players().to_pandas().drop_duplicates("gsis_id", keep="last")
    bio = bio.set_index("gsis_id")

    rows = []
    for _, r in rosters.iterrows():
        if pd.isna(r["gsis_id"]) or not r["gsis_id"]:
            continue  # a handful of practice-squad entries lack a gsis_id
        b = bio.loc[r["gsis_id"]] if r["gsis_id"] in bio.index else None
        rows.append(
            {
                "player_id": r["gsis_id"],
                "full_name": r["full_name"],
                "position": r["position"],
                "team_abbr": r["team"],
                "headshot_url": None if pd.isna(r["headshot_url"]) else r["headshot_url"],
                "height": _clean_int(b["height"]) if b is not None else None,
                "weight": _clean_int(b["weight"]) if b is not None else None,
                "college": None if b is None or pd.isna(b["college_name"]) else b["college_name"],
                "draft_year": _clean_int(b["draft_year"]) if b is not None else None,
                "draft_round": _clean_int(b["draft_round"]) if b is not None else None,
                "draft_pick": _clean_int(b["draft_pick"]) if b is not None else None,
                "draft_team": None if b is None or pd.isna(b["draft_team"]) else b["draft_team"],
                # Undrafted players have no draft_year, but load_players()
                # still has rookie_season for them -- lets the player page
                # show "20XX Undrafted" instead of hiding the Draft field.
                "rookie_season": _clean_int(b["rookie_season"]) if b is not None else None,
            }
        )
    return rows
