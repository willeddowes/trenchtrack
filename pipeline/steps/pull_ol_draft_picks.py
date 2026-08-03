"""Builds `ol_draft_picks` rows: every offensive lineman a team drafted in a
given draft class -- shown on that same season's team page (the 2024 draft
class on the 2024 page, etc). Source: nflreadpy's load_draft_picks() (Pro
Football Reference), filtered to category == 'OL'.

Team codes here are PFR's own three-letter codes (NWE, GNB, KAN, ...), not
nflverse's -- remapped to match every other table in this project. Only the
current-era codes are covered; older historical codes (OAK/STL/SDG/PHO/RAM)
predate this project's supported seasons and are left unmapped on purpose.

Position is normalized to the three buckets requested on the team page --
OT/OG/C -- with a residual 'OL' bucket for PFR's occasional generic tag
(a small handful of picks with no more specific info available yet).
"""

import nflreadpy as nfl
import pandas as pd

PFR_TEAM_REMAP = {
    "GNB": "GB",
    "KAN": "KC",
    "LAR": "LA",
    "LVR": "LV",
    "NOR": "NO",
    "NWE": "NE",
    "SFO": "SF",
    "TAM": "TB",
}

POSITION_MAP = {"T": "OT", "OT": "OT", "G": "OG", "OG": "OG", "C": "C"}


def pull_ol_draft_picks(season: int) -> pd.DataFrame:
    picks = nfl.load_draft_picks(seasons=season).to_pandas()
    picks = picks[picks["category"] == "OL"].copy()

    picks["team_abbr"] = picks["team"].replace(PFR_TEAM_REMAP)
    picks["position"] = picks["position"].map(POSITION_MAP).fillna("OL")
    picks = picks.rename(columns={"gsis_id": "player_id", "pfr_player_name": "player_name"})
    picks["season"] = season

    return picks[["team_abbr", "season", "round", "pick", "player_id", "player_name", "position"]]
