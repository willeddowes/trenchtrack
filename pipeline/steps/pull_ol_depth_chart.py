"""Builds rows for the `ol_depth_chart` table: for every team, every O-line
position (LT/LG/C/RG/RT), every player who logged offense snaps there that
season, ranked by total snaps (depth_rank 1 = most snaps that season).

No single nflreadpy source has both real snap counts AND left/right side:
  - load_snap_counts() (Pro Football Reference) has real per-week snap
    totals, but only a generic position ('T'/'G'/'C' -- no L/R side).
  - load_depth_charts() (ESPN) has the side-specific slot per week
    ('LT'/'LG'/'C'/'RG'/'RT'), but no snap totals.
The two sources also use different player-ID systems (PFR ID vs nflverse's
gsis_id), and nflverse's own ID crosswalk (load_rosters()'s pfr_id column)
has essentially zero coverage for offensive linemen -- so they're joined by
normalized player name instead, scoped to (team, week). Validated at ~97%
match rate league-wide; the unmatched remainder is deep bench/practice-squad
players who never rank in a team's top spots anyway.
"""

import re

import nflreadpy as nfl
import pandas as pd

GENERIC_OL_POSITIONS = ["T", "G", "C"]
SIDE_POSITIONS = ["LT", "LG", "C", "RG", "RT"]


class DepthChartNotArchivedError(Exception):
    """Raised when nflreadpy has no per-week archived depth chart for a
    season yet -- it silently falls back to today's live/current-roster
    snapshot instead (no 'week' column at all), which reflects TODAY's
    depth chart, not who actually played where during that season. Using
    it would misattribute snaps whenever a roster has changed since, so we
    refuse rather than write misleading data -- callers should skip this
    season's depth chart and try again later once nflverse archives it."""

_SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?")
_PUNCT_RE = re.compile(r"[.'’]")
_SPACE_RE = re.compile(r"\s+")


def _normalize_name(name: str | None) -> str | None:
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return None
    n = name.lower()
    n = _PUNCT_RE.sub("", n)
    n = _SUFFIX_RE.sub("", n)
    n = _SPACE_RE.sub(" ", n).strip()
    return n


def pull_season_ol_depth_chart(season: int) -> pd.DataFrame:
    snaps = nfl.load_snap_counts(seasons=season).to_pandas()
    snaps = snaps[(snaps["game_type"] == "REG") & (snaps["position"].isin(GENERIC_OL_POSITIONS))].copy()
    snaps["name_norm"] = snaps["player"].apply(_normalize_name)

    dc = nfl.load_depth_charts(seasons=season).to_pandas()
    if "week" not in dc.columns:
        raise DepthChartNotArchivedError(
            f"nflreadpy has no archived per-week depth chart for {season} yet -- "
            "only today's live snapshot, which doesn't reflect that season."
        )
    dc = dc[(dc["game_type"] == "REG") & (dc["depth_position"].isin(SIDE_POSITIONS))].copy()
    dc["name_norm"] = dc["full_name"].apply(_normalize_name)
    # A backup occasionally shows up dual-listed at two slots in the same
    # team/week (e.g. 2nd-string guard AND 3rd-string tackle) -- keep
    # whichever row loads first. Minor, and only ever affects deep backups.
    dc_by_week = dc[["club_code", "week", "name_norm", "depth_position", "gsis_id"]].drop_duplicates(
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
    totals["snaps"] = totals["offense_snaps"].astype(int)
    totals["season"] = season
    totals = totals.sort_values(["team_abbr", "position", "snaps"], ascending=[True, True, False])
    totals["depth_rank"] = totals.groupby(["team_abbr", "position"]).cumcount() + 1

    return totals[["team_abbr", "season", "position", "depth_rank", "player_id", "player_name", "snaps"]]
