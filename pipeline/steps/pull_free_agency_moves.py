"""Builds `ol_free_agency_moves` rows: for a season being previewed before it
starts, which O-line players with meaningful (300+ snap) playing time in
EITHER of the past two seasons changed teams. Fully derived from data this
project already has -- no manual research:
  - Real past snap totals per player per team come from our own
    `ol_depth_chart` table (already computed by pull_ol_depth_chart.py).
  - Each player's CURRENT team comes from nflreadpy's load_rosters(), which
    already reflects free-agency signings, using the same gsis_id as our own
    player_id -- no name-matching needed (unlike the PFR/ESPN join elsewhere
    in this pipeline).

Each move is written from both sides -- a 'lost' row for the old team, a
'gained' row for the new one -- so either team's page can query by its own
team_abbr alone. A player who qualified for two different old teams (traded
mid-career) generates a 'lost' row for each, but only one 'gained' row for
the new team (whichever old stint was most recent) -- an intentional
simplification for a rare edge case.
"""

import nflreadpy as nfl
import pandas as pd
from supabase import Client

from write_to_supabase import fetch_ol_depth_chart

SNAP_THRESHOLD = 300
NO_TEAM = "__NONE__"  # sentinel so a real "not on any current roster" (None)
# compares as different from every real team_abbr, without relying on how
# pandas happens to handle NaN in a != comparison.


def pull_free_agency_moves(client: Client, target_season: int) -> pd.DataFrame:
    past_seasons = [target_season - 1, target_season - 2]
    history = fetch_ol_depth_chart(client, past_seasons)
    history = history.dropna(subset=["player_id", "snaps"])

    # Each player's single best (team, season, snaps) -- the season/team
    # that actually qualifies them as "meaningful", not a cross-team sum.
    best_idx = history.groupby(["team_abbr", "player_id"])["snaps"].idxmax()
    best = history.loc[best_idx].rename(columns={"season": "best_season", "snaps": "best_season_snaps"})
    qualifying = best[best["best_season_snaps"] >= SNAP_THRESHOLD].copy()
    if qualifying.empty:
        return qualifying

    rosters = nfl.load_rosters(seasons=target_season).to_pandas()
    current_team_by_player = rosters.drop_duplicates("gsis_id").set_index("gsis_id")["team"]
    qualifying["current_team"] = qualifying["player_id"].map(current_team_by_player)
    qualifying["current_team_key"] = qualifying["current_team"].fillna(NO_TEAM)

    moved = qualifying[qualifying["current_team_key"] != qualifying["team_abbr"]].copy()

    lost = moved.copy()
    lost["direction"] = "lost"
    lost["other_team_abbr"] = lost["current_team"]  # null = unsigned/retired

    gained = moved[moved["current_team"].notna()].copy()
    gained["direction"] = "gained"
    gained["other_team_abbr"] = gained["team_abbr"]  # the OLD team
    gained["team_abbr"] = gained["current_team"]  # the row belongs to the NEW team
    # A player who qualified from two old teams would otherwise double-list
    # for the new team -- keep only the most recent qualifying stint.
    gained = gained.sort_values("best_season", ascending=False).drop_duplicates(
        subset=["team_abbr", "player_id"], keep="first"
    )

    columns = ["team_abbr", "direction", "player_id", "player_name", "other_team_abbr", "best_season", "best_season_snaps"]
    result = pd.concat([lost[columns], gained[columns]], ignore_index=True)
    result["season"] = target_season
    return result[["team_abbr", "season", "direction", "player_id", "player_name", "other_team_abbr", "best_season", "best_season_snaps"]]
