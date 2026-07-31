"""Builds `ol_free_agency_moves` rows: for a season being previewed before it
starts, which O-line players changed teams this offseason. Fully derived
from data this project already has -- no manual research:
  - Real past snap totals per player per team come from our own
    `ol_depth_chart` table (already computed by pull_ol_depth_chart.py).
  - Each player's CURRENT team comes from nflreadpy's load_rosters(), which
    already reflects free-agency signings, using the same gsis_id as our own
    player_id -- no name-matching needed (unlike the PFR/ESPN join elsewhere
    in this pipeline).

A team is only eligible to have "lost" a player if that player was actually
on ITS roster the season immediately before the one being previewed (e.g.
2025, for a 2026 preview) -- a big season two years back with some OTHER
team doesn't count, even if it clears the snap threshold, because that
departure is old news, not this offseason's. The 300+ snap threshold can
still be met by either of the past two seasons, but only counting time spent
with that specific most-recent team (covers a player who battled injury in
year 1 but logged real snaps there in year 2, or vice versa).

Each move is written from both sides -- a 'lost' row for the old team, a
'gained' row for the new one -- so either team's page can query by its own
team_abbr alone.
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
    prior_season = target_season - 1
    lookback_season = target_season - 2
    history = fetch_ol_depth_chart(client, [prior_season, lookback_season])
    history = history.dropna(subset=["player_id", "snaps"])

    # The only team eligible to have "lost" a player is whoever they were
    # rostered with last season -- a player with no row at all in
    # prior_season (retired, hurt all year, or already gone before this
    # offseason) isn't eligible for anyone.
    last_team_by_player = (
        history[history["season"] == prior_season]
        .drop_duplicates(subset="player_id")
        .set_index("player_id")["team_abbr"]
    )
    history["last_team"] = history["player_id"].map(last_team_by_player)
    scoped = history[history["team_abbr"] == history["last_team"]]

    # Each player's best single-season snap count, but only counting seasons
    # spent with that last-known team (see module docstring).
    best_idx = scoped.groupby("player_id")["snaps"].idxmax()
    best = scoped.loc[best_idx].rename(columns={"season": "best_season", "snaps": "best_season_snaps"})
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

    columns = ["team_abbr", "direction", "player_id", "player_name", "other_team_abbr", "best_season", "best_season_snaps"]
    result = pd.concat([lost[columns], gained[columns]], ignore_index=True)
    result["season"] = target_season
    return result[["team_abbr", "season", "direction", "player_id", "player_name", "other_team_abbr", "best_season", "best_season_snaps"]]
