"""Builds PROJECTED `ol_depth_chart` rows for a season that hasn't started
yet (no snaps played, so pull_ol_depth_chart.py's snap-count join has
nothing to join against). Instead this just takes today's live ESPN depth
chart snapshot as-is: load_depth_charts() for an unarchived season returns
day-by-day scrape history (see pull_ol_depth_chart.py's module docstring for
why), so we keep only the single most recent day's rows and use ESPN's own
pos_rank directly as depth_rank. `snaps` is left null -- there's nothing
real to report yet (see schema.sql).

This is deliberately a separate file from pull_ol_depth_chart.py rather than
a branch inside it -- that file's whole shape (join PFR snaps + ESPN side,
rank by snap total) doesn't apply here; forcing both cases through one
function would tangle two genuinely different data pipelines.
"""

import nflreadpy as nfl
import pandas as pd

SIDE_POSITIONS = ["LT", "LG", "C", "RG", "RT"]


def pull_projected_depth_chart(season: int) -> pd.DataFrame:
    dc = nfl.load_depth_charts(seasons=season).to_pandas()
    dc = dc[dc["pos_abb"].isin(SIDE_POSITIONS)].copy()
    dc["dt"] = pd.to_datetime(dc["dt"])

    latest_dt = dc["dt"].max()
    latest = dc[dc["dt"] == latest_dt].copy()

    latest = latest.rename(
        columns={
            "team": "team_abbr",
            "pos_abb": "position",
            "pos_rank": "depth_rank",
            "gsis_id": "player_id",
        }
    )
    latest["season"] = season
    latest["snaps"] = None

    return latest[["team_abbr", "season", "position", "depth_rank", "player_id", "player_name", "snaps"]]
