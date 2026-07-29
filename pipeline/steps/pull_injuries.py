"""Builds rows for the `injuries` table: the current O-line injury report
per team. nflreadpy's injury data uses generic 'C', 'G', 'T' position codes
(not the side-specific LT/RT/LG/RG used in depth charts), and includes rows
for players who were merely rested (report_status is blank) -- we only want
players who actually appear on the injury report with a real status."""

import nflreadpy as nfl
import pandas as pd

OL_POSITIONS = ["C", "G", "T"]


def pull_injuries(season: int) -> list[dict]:
    inj = nfl.load_injuries(seasons=season).to_pandas()
    inj = inj[inj["position"].isin(OL_POSITIONS) & inj["report_status"].notna()]

    if inj.empty:
        return []

    latest_week = inj["week"].max()
    inj = inj[inj["week"] == latest_week]

    rows = []
    for _, r in inj.iterrows():
        rows.append(
            {
                "team_abbr": r["team"],
                "player_id": None if pd.isna(r["gsis_id"]) else r["gsis_id"],
                "player_name": r["full_name"],
                "position": r["position"],
                "status": r["report_status"],
                "injury_description": None if pd.isna(r["report_primary_injury"]) else r["report_primary_injury"],
                "season": season,
                "week": int(latest_week),
            }
        )
    return rows
