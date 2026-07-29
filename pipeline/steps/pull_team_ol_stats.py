"""Builds the raw (pre-grade) stats for `team_ol_stats`: one row per team,
per week, with numbers CUMULATIVE through that week of the season. That's
what lets a week 10 grade reflect "the season so far" rather than just one
game, and it's why every raw column below gets summed with .cumsum() after
sorting by week.

Regular season only (season_type == 'REG') -- mixing in playoff games would
unfairly stack extra data onto the handful of teams that make the playoffs.

Data sources, and why each one is used:
  - load_team_stats(): already has sacks_suffered and pass attempts per team
    per week, so we don't need to recompute those from raw play-by-play.
  - load_pfr_advstats(stat_type='pass'): Pro Football Reference's
    `times_pressured` column is a real, published pressure count -- better
    than trying to approximate "pressure" ourselves from play-by-play.
  - load_pfr_advstats(stat_type='rush'): PFR also publishes
    `rushing_yards_before_contact` per player per week, which is exactly the
    run-blocking metric we want, aggregated up to the team level.
  - load_pbp(): the only source with individual plays, needed to compute
    "stuff rate" (share of rush attempts stopped at or behind the line) --
    no dataset publishes that as a precomputed stat.
"""

import nflreadpy as nfl
import pandas as pd


def pull_team_ol_stats_raw(season: int) -> pd.DataFrame:
    team_stats = nfl.load_team_stats(seasons=season, summary_level="week").to_pandas()
    team_stats = team_stats[team_stats["season_type"] == "REG"]
    team_stats = team_stats[["team", "week", "attempts", "sacks_suffered"]]

    pfr_pass = nfl.load_pfr_advstats(seasons=season, stat_type="pass", summary_level="week").to_pandas()
    pfr_pass = pfr_pass[pfr_pass["game_type"] == "REG"]
    pressure_by_week = (
        pfr_pass.groupby(["team", "week"], as_index=False)["times_pressured"].sum()
    )

    pfr_rush = nfl.load_pfr_advstats(seasons=season, stat_type="rush", summary_level="week").to_pandas()
    pfr_rush = pfr_rush[pfr_rush["game_type"] == "REG"]
    rush_by_week = pfr_rush.groupby(["team", "week"], as_index=False).agg(
        pfr_carries=("carries", "sum"),
        rushing_yards_before_contact=("rushing_yards_before_contact", "sum"),
    )

    pbp = nfl.load_pbp(seasons=season).to_pandas()
    pbp = pbp[(pbp["season_type"] == "REG") & (pbp["rush_attempt"] == 1)]
    stuffs_by_week = pbp.groupby(["posteam", "week"], as_index=False).agg(
        rush_attempts=("rush_attempt", "count"),
        stuffed_runs=("rushing_yards", lambda ys: (ys <= 0).sum()),
    )
    stuffs_by_week = stuffs_by_week.rename(columns={"posteam": "team"})

    # Combine every source on (team, week). Some columns can be legitimately
    # missing for early weeks in a new season (e.g. PFR data lags slightly),
    # so we fill with 0 rather than dropping the row.
    df = team_stats.merge(pressure_by_week, on=["team", "week"], how="left")
    df = df.merge(rush_by_week, on=["team", "week"], how="left")
    df = df.merge(stuffs_by_week, on=["team", "week"], how="left")
    df = df.fillna(0)

    df = df.sort_values(["team", "week"])
    cum_cols = [
        "attempts",
        "sacks_suffered",
        "times_pressured",
        "pfr_carries",
        "rushing_yards_before_contact",
        "rush_attempts",
        "stuffed_runs",
    ]
    for col in cum_cols:
        df[f"{col}_cum"] = df.groupby("team")[col].cumsum()
    df["games_played"] = df.groupby("team").cumcount() + 1

    df["dropbacks"] = df["attempts_cum"] + df["sacks_suffered_cum"]
    df["sacks_allowed"] = df["sacks_suffered_cum"].astype(int)
    df["pressures_allowed"] = df["times_pressured_cum"].astype(int)
    df["pressure_rate_allowed"] = _safe_divide(df["times_pressured_cum"], df["dropbacks"])
    df["stuff_rate"] = _safe_divide(df["stuffed_runs_cum"], df["rush_attempts_cum"])
    df["yards_before_contact_per_att"] = _safe_divide(
        df["rushing_yards_before_contact_cum"], df["pfr_carries_cum"]
    )

    return df[
        [
            "team",
            "week",
            "games_played",
            "dropbacks",
            "sacks_allowed",
            "pressures_allowed",
            "pressure_rate_allowed",
            "stuff_rate",
            "yards_before_contact_per_att",
        ]
    ].rename(columns={"team": "team_abbr"})


def _safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return (numerator / denominator.replace(0, pd.NA)).astype(float)
