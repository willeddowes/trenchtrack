"""Builds rows for the `player_injury_reports` table: every week a player
was ruled OUT on the O-line injury report, across whichever seasons are
passed in -- unlike `pull_injuries.py` (current snapshot, latest week
only, any status), this keeps every week but only the 'Out' status,
per user request -- Questionable/Doubtful/Probable/Note don't reliably
mean a missed game, and the whole point of this table is counting weeks
actually missed.

Postseason weeks continue numbering from the regular season in nflreadpy's
data (e.g. week 19 = Wild Card for an 18-week regular season) rather than
restarting, so (player_id, season, week) never collides between game
types -- no need to also key on game_type.

Same pre-relocation franchise code remap as pull_ol_depth_chart.py /
pull_team_ol_stats.py (see HISTORICAL_TEAM_CODES there) -- this source
also tags old seasons with the old team code (e.g. Raiders 'OAK'), which
violates player_injury_reports' FK to `teams` (already normalized to the
current codes) if left unmapped.
"""

import nflreadpy as nfl
import pandas as pd

OL_POSITIONS = ["C", "G", "T"]
HISTORICAL_TEAM_CODES = {"OAK": "LV", "SD": "LAC", "STL": "LA"}


def pull_injury_history(seasons: list[int]) -> list[dict]:
    inj = nfl.load_injuries(seasons=seasons).to_pandas()
    inj = inj[
        inj["position"].isin(OL_POSITIONS)
        & (inj["report_status"] == "Out")
        & inj["gsis_id"].notna()
    ]

    rows = []
    for _, r in inj.iterrows():
        rows.append(
            {
                "player_id": r["gsis_id"],
                "player_name": r["full_name"],
                "position": r["position"],
                "team_abbr": HISTORICAL_TEAM_CODES.get(r["team"], r["team"]),
                "season": int(r["season"]),
                "week": int(r["week"]),
                "status": r["report_status"],
                "injury_description": None if pd.isna(r["report_primary_injury"]) else r["report_primary_injury"],
            }
        )
    return rows
