"""Builds rows for the `ol_depth_chart` table: for every team, every O-line
position (LT/LG/C/RG/RT), every player who logged offense snaps there that
season, ranked by total snaps (depth_rank 1 = most snaps that season).

No single nflreadpy source has both real snap counts AND left/right side:
  - load_snap_counts() (Pro Football Reference) has real per-week snap
    totals, but only a generic position ('T'/'G'/'C' -- no L/R side).
  - load_depth_charts() (ESPN) has the side-specific slot ('LT'/'LG'/'C'/
    'RG'/'RT'), but no snap totals.
The two sources also use different player-ID systems (PFR ID vs nflverse's
gsis_id), and nflverse's own ID crosswalk (load_rosters()'s pfr_id column)
has essentially zero coverage for offensive linemen -- so they're joined by
normalized player name instead, scoped to (team, week). Validated at ~97%
match rate league-wide; the unmatched remainder is deep bench/practice-squad
players who never rank in a team's top spots anyway.

load_depth_charts() also returns TWO different schemas depending on
whether nflverse has reprocessed that season into its tidy per-week
archive yet: completed prior seasons get 'week'/'game_type'/
'depth_position'/'club_code' columns directly; a season not yet archived
(seen for 2025 the day after that season ended) instead returns its raw
day-by-day scrape history -- 'dt'/'team'/'pos_abb'/'pos_rank', a real
snapshot for every single calendar day of the season, just not
pre-bucketed into weeks. _depth_chart_by_week() below normalizes both
into the same (team, week, name_norm, depth_position, gsis_id) shape so
everything downstream doesn't care which one it got.
"""

import nflreadpy as nfl
import pandas as pd

from name_matching import normalize_name as _normalize_name

GENERIC_OL_POSITIONS = ["T", "G", "C", "OL"]  # PFR started tagging some
# linemen with the generic catch-all "OL" (no T/G/C split) starting in the
# 2025 season -- harmless here either way, since the depth-chart join is
# what actually determines the specific side, not this initial position tag.
SIDE_POSITIONS = ["LT", "LG", "C", "RG", "RT"]

# Both load_snap_counts() and load_depth_charts() tag pre-relocation seasons
# with the franchise's OLD code (e.g. Raiders "OAK" through 2019), and they
# agree with each other on it, so the join between them still works fine --
# but `teams` (and ol_depth_chart's FK to it) only knows the CURRENT code,
# so the old code has to be remapped on the way out. Same issue as
# pull_team_ol_stats.py's HISTORICAL_TEAM_CODES, just needed sooner here
# since this is the first place seasons before 2018 get pulled at all.
HISTORICAL_TEAM_CODES = {"OAK": "LV", "SD": "LAC", "STL": "LA"}


def _depth_chart_by_week(season: int) -> pd.DataFrame:
    """Returns columns [club_code, week, name_norm, depth_position, gsis_id],
    one row per player per side-position per week, regardless of which of
    the two load_depth_charts() schemas this season came back as."""
    dc = nfl.load_depth_charts(seasons=season).to_pandas()

    if "week" in dc.columns:
        dc = dc[(dc["game_type"] == "REG") & (dc["depth_position"].isin(SIDE_POSITIONS))].copy()
        dc["name_norm"] = dc["full_name"].apply(_normalize_name)
        return dc[["club_code", "week", "name_norm", "depth_position", "gsis_id"]]

    # Old/unarchived schema: a daily scrape history with no week column.
    # Bucket each day's snapshot into the NFL week it falls in ourselves,
    # using the real schedule, then keep only the latest snapshot inside
    # each week's window (a depth chart can get updated more than once
    # during a week as injury news comes in).
    dc = dc[dc["pos_abb"].isin(SIDE_POSITIONS)].copy()
    dc["dt"] = pd.to_datetime(dc["dt"]).dt.tz_localize(None)
    dc["name_norm"] = dc["player_name"].apply(_normalize_name)

    sched = nfl.load_schedules(seasons=season).to_pandas()
    sched = sched[sched["game_type"] == "REG"]
    week_bounds = sched.groupby("week")["gameday"].agg(["min", "max"]).reset_index()
    week_bounds[["min", "max"]] = week_bounds[["min", "max"]].apply(pd.to_datetime)
    week_bounds = week_bounds.sort_values("week").reset_index(drop=True)
    # Each week's window runs from its own kickoff to the NEXT week's
    # kickoff, so every day in between (int'l games, byes, Tue/Wed
    # depth-chart updates) lands in exactly one week. The final week is
    # capped a few days past its last game instead of running forever,
    # so we don't drag in offseason snapshots months later.
    week_bounds["window_start"] = week_bounds["min"]
    week_bounds["window_end"] = week_bounds["window_start"].shift(-1)
    week_bounds.loc[week_bounds.index[-1], "window_end"] = week_bounds["max"].iloc[-1] + pd.Timedelta(days=4)

    week_starts = week_bounds[["week", "window_start"]].rename(columns={"window_start": "week_start"})
    dc = dc.sort_values("dt").reset_index(drop=True)
    mapped = pd.merge_asof(dc, week_starts, left_on="dt", right_on="week_start", direction="backward")
    mapped = mapped.reset_index(drop=True)
    window_end_by_week = week_bounds.set_index("week")["window_end"]
    mapped["window_end"] = mapped["week"].map(window_end_by_week)
    # Rows before week 1's kickoff (preseason) get no week match at all.
    mapped = mapped[mapped["week"].notna() & (mapped["dt"] < mapped["window_end"])].reset_index(drop=True)

    max_dt_per_group = mapped.groupby(["team", "week"])["dt"].transform("max")
    latest = mapped[mapped["dt"].values == max_dt_per_group.values].copy()
    latest = latest.rename(columns={"team": "club_code", "pos_abb": "depth_position"})
    return latest[["club_code", "week", "name_norm", "depth_position", "gsis_id"]]


def pull_season_ol_depth_chart(season: int) -> pd.DataFrame:
    snaps = nfl.load_snap_counts(seasons=season).to_pandas()
    snaps = snaps[(snaps["game_type"] == "REG") & (snaps["position"].isin(GENERIC_OL_POSITIONS))].copy()
    snaps["name_norm"] = snaps["player"].apply(_normalize_name)

    # A backup occasionally shows up dual-listed at two slots in the same
    # team/week (e.g. 2nd-string guard AND 3rd-string tackle) -- keep
    # whichever row loads first. Minor, and only ever affects deep backups.
    dc_by_week = _depth_chart_by_week(season).drop_duplicates(
        subset=["club_code", "week", "name_norm"], keep="first"
    )

    merged = snaps.merge(
        dc_by_week,
        left_on=["team", "week", "name_norm"],
        right_on=["club_code", "week", "name_norm"],
        how="left",
    )

    # Fallback for weeks ESPN's depth-chart snapshot skipped: use this
    # player's most common side across the rest of the season instead.
    season_mode = (
        dc_by_week.groupby(["club_code", "name_norm"])
        .agg(depth_position_mode=("depth_position", lambda s: s.mode().iloc[0]), gsis_id_mode=("gsis_id", "first"))
        .reset_index()
    )
    merged = merged.merge(
        season_mode,
        left_on=["team", "name_norm"],
        right_on=["club_code", "name_norm"],
        how="left",
        suffixes=("", "_fallback"),
    )
    merged["depth_position"] = merged["depth_position"].fillna(merged["depth_position_mode"])
    merged["gsis_id"] = merged["gsis_id"].fillna(merged["gsis_id_mode"])

    # Still-unmatched rows (no depth-chart appearance all season) can't be
    # confidently assigned a side -- drop them, same as other places in this
    # pipeline that accept an imperfect proxy over blocking on missing data.
    merged = merged.dropna(subset=["depth_position"])

    totals = merged.groupby(
        ["team", "depth_position", "gsis_id", "player"], as_index=False, dropna=False
    )["offense_snaps"].sum()
    totals = totals.rename(
        columns={"team": "team_abbr", "depth_position": "position", "gsis_id": "player_id", "player": "player_name"}
    )
    totals["team_abbr"] = totals["team_abbr"].replace(HISTORICAL_TEAM_CODES)
    totals["snaps"] = totals["offense_snaps"].astype(int)
    totals["season"] = season
    totals = totals.sort_values(["team_abbr", "position", "snaps"], ascending=[True, True, False])
    totals["depth_rank"] = totals.groupby(["team_abbr", "position"]).cumcount() + 1

    return totals[["team_abbr", "season", "position", "depth_rank", "player_id", "player_name", "snaps"]]
