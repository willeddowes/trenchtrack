"""Computes each team's Strength of Schedule (SOS) for a season -- fed into
compute_grades.py as a 4th weighted component alongside sack/pressure rate
and ESPN win rates (see that file's docstring for the full grading writeup).
Two scores per team, both 0-100, higher = tougher opponents faced that
season: pass_sos_score (how good the pass rushes they faced were, on
average) and run_sos_score (same for run defenses).

Design: rate every team's own DEFENSE first, the same min-max-across-the-
league way team_ol_stats rates offenses, then for each team average the
defense_pass_score/defense_run_score of everyone on their schedule, then
normalize THOSE averages across the league again. Same "curved against
this week's 32 teams" philosophy as every other score on the site, just
one level removed -- a team's SOS is the average grade OF its opponents.

Unlike team_ol_stats, this is ONE VALUE PER TEAM PER SEASON, not a weekly
series -- matches how ESPN's win rates already work (espn_team_rates is
also one row per team per season), which is exactly the shape
compute_grades.py expects to merge it against.

Data sources, and why each one is used:
  - load_team_stats(): 'opponent_team' doubles as this team's full
    schedule (one row per team per week already says who they played) --
    no separate load_schedules() pull needed. 'def_sacks' is a real
    published sacks-created count, same way pull_team_ol_stats.py trusts
    team_stats' sacks_suffered rather than deriving sacks from PFR data.
  - load_pfr_advstats(stat_type='pass'): grouped by 'opponent' instead of
    'team' -- each row already records which defense pressured that
    player, so grouping on the other side of the same box score gives
    pressures CREATED by that defense rather than suffered by the
    offense. Mirrors pull_team_ol_stats.py's pressure-rate logic exactly.
  - load_pfr_advstats(stat_type='rush'): same trick, grouped by
    'opponent', for yards-before-contact ALLOWED per rush attempt.
  - load_pbp(): grouped by 'defteam' instead of 'posteam' for stuff rate
    CREATED (share of opponent rush attempts stopped at/behind the
    line) -- mirrors pull_team_ol_stats.py's stuff-rate logic exactly.

KEEP THIS OUT OF compute_grades.py itself -- that file only knows how to
blend whatever schedule_strength DataFrame it's handed; this file is the
only place that knows how SOS is actually computed.
"""

import nflreadpy as nfl
import pandas as pd

from compute_grades import _normalize, _weighted_average

HISTORICAL_TEAM_CODES = {"OAK": "LV"}


def compute_schedule_strength(season: int) -> pd.DataFrame:
    """Returns one row per team: team_abbr, pass_sos_score, run_sos_score."""
    team_stats = nfl.load_team_stats(seasons=season, summary_level="week").to_pandas()
    team_stats = team_stats[team_stats["season_type"] == "REG"]
    team_stats = team_stats[["team", "week", "attempts", "sacks_suffered", "def_sacks", "opponent_team"]]

    # Dropbacks faced by team X's defense in a week = however many times
    # that week's opponent dropped back to pass -- team_stats already has
    # both sides of that fact (one row per team), just needs a self-join
    # on (opponent_team, week) to attach "the opponent's own dropbacks"
    # onto team X's row.
    own_dropbacks = team_stats[["team", "week", "attempts", "sacks_suffered"]].copy()
    own_dropbacks["dropbacks_faced"] = own_dropbacks["attempts"] + own_dropbacks["sacks_suffered"]
    own_dropbacks = own_dropbacks[["team", "week", "dropbacks_faced"]].rename(columns={"team": "opponent_team"})
    team_stats = team_stats.merge(own_dropbacks, on=["opponent_team", "week"], how="left")

    pfr_pass = nfl.load_pfr_advstats(seasons=season, stat_type="pass", summary_level="week").to_pandas()
    pfr_pass = pfr_pass[pfr_pass["game_type"] == "REG"]
    pfr_pass["opponent"] = pfr_pass["opponent"].replace(HISTORICAL_TEAM_CODES)
    pressures_created = pfr_pass.groupby("opponent", as_index=False)["times_pressured"].sum()
    pressures_created = pressures_created.rename(columns={"opponent": "team", "times_pressured": "pressures_created"})

    pfr_rush = nfl.load_pfr_advstats(seasons=season, stat_type="rush", summary_level="week").to_pandas()
    pfr_rush = pfr_rush[pfr_rush["game_type"] == "REG"]
    pfr_rush["opponent"] = pfr_rush["opponent"].replace(HISTORICAL_TEAM_CODES)
    ybc_allowed = pfr_rush.groupby("opponent", as_index=False).agg(
        carries_faced=("carries", "sum"),
        rushing_yards_before_contact_allowed=("rushing_yards_before_contact", "sum"),
    )
    ybc_allowed = ybc_allowed.rename(columns={"opponent": "team"})

    pbp = nfl.load_pbp(seasons=season).to_pandas()
    pbp = pbp[(pbp["season_type"] == "REG") & (pbp["rush_attempt"] == 1)]
    stuffs_created = pbp.groupby("defteam", as_index=False).agg(
        rush_attempts_faced=("rush_attempt", "count"),
        stuffed_runs_created=("rushing_yards", lambda ys: (ys <= 0).sum()),
    )
    stuffs_created = stuffs_created.rename(columns={"defteam": "team"})

    season_totals = team_stats.groupby("team", as_index=False).agg(
        dropbacks_faced=("dropbacks_faced", "sum"),
        sacks_created=("def_sacks", "sum"),
    )
    season_totals = season_totals.merge(pressures_created, on="team", how="left")
    season_totals = season_totals.merge(ybc_allowed, on="team", how="left")
    season_totals = season_totals.merge(stuffs_created, on="team", how="left")
    season_totals = season_totals.fillna(0)

    sack_rate_created = _safe_divide(season_totals["sacks_created"], season_totals["dropbacks_faced"])
    pressure_rate_created = _safe_divide(season_totals["pressures_created"], season_totals["dropbacks_faced"])
    stuff_rate_created = _safe_divide(season_totals["stuffed_runs_created"], season_totals["rush_attempts_faced"])
    ybc_allowed_per_att = _safe_divide(
        season_totals["rushing_yards_before_contact_allowed"], season_totals["carries_faced"]
    )

    # Rate every team's own defense first (higher is better on all four --
    # more sacks/pressures created is good, more stuffs created is good,
    # less yardage before contact allowed is good).
    season_totals["defense_pass_score"] = _weighted_average([
        (_normalize(sack_rate_created, higher_is_better=True), 1),
        (_normalize(pressure_rate_created, higher_is_better=True), 1),
    ])
    season_totals["defense_run_score"] = _weighted_average([
        (_normalize(stuff_rate_created, higher_is_better=True), 1),
        (_normalize(ybc_allowed_per_att, higher_is_better=False), 1),
    ])

    # Each team's schedule = every (team, opponent) pair from their season
    # (one row per week already carries this, so just dedupe).
    schedule = team_stats[["team", "opponent_team"]].drop_duplicates()
    defense_scores = season_totals.set_index("team")[["defense_pass_score", "defense_run_score"]]
    schedule = schedule.merge(defense_scores, left_on="opponent_team", right_index=True, how="left")

    sos_raw = schedule.groupby("team", as_index=False).agg(
        pass_sos_raw=("defense_pass_score", "mean"),
        run_sos_raw=("defense_run_score", "mean"),
    )
    sos_raw["pass_sos_score"] = _normalize(sos_raw["pass_sos_raw"], higher_is_better=True)
    sos_raw["run_sos_score"] = _normalize(sos_raw["run_sos_raw"], higher_is_better=True)

    return sos_raw[["team", "pass_sos_score", "run_sos_score"]].rename(columns={"team": "team_abbr"})


def _safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return (numerator / denominator.replace(0, pd.NA)).astype(float)
