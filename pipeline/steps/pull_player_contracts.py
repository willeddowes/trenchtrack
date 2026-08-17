"""Builds `player_contracts`: every real contract a tracked OL has signed,
one row per player per contract (not per season) -- feeds the player page's
"current contract" card and the Career table's per-season APY column.

nflreadpy.load_contracts() (OverTheCap data, joined by gsis_id -- same id
system as our own player_id, no name-matching needed, same pattern
pull_free_agency_moves.py already uses for its contract fields) turns out
to have real duplication noise: it's essentially a flattened cap-history
ledger, so a player with a lot of practice-squad/futures activity can have
dozens of near-identical rows for what's really the same signing (a
terminated version, a renegotiated version, etc. all get their own row).
Deduping to (player, year_signed) and taking the max of each numeric field
collapses that noise down to one row per real contract, verified live: an
established starter's history comes out clean either way (5 real contracts
across a full career, no dupes to begin with), and the messy cases are all
depth players where the exact numbers matter far less.

is_current is set per GROUP (true if ANY row in that (player, year_signed)
group has nflreadpy's own is_active flag set) rather than tied to whichever
individual row survives the max() reduction, so a stray inconsistency
between duplicate rows can't accidentally drop the flag.
"""

import nflreadpy as nfl
import pandas as pd

OL_POSITIONS = ["LT", "RT", "LG", "RG", "C"]


def pull_player_contracts() -> pd.DataFrame:
    contracts = nfl.load_contracts().to_pandas()
    ol = contracts[contracts["position"].isin(OL_POSITIONS) & contracts["gsis_id"].notna()].copy()

    deduped = ol.groupby(["gsis_id", "year_signed"], as_index=False).agg(
        player_name=("player", "first"),
        position=("position", "first"),
        years=("years", "max"),
        total_value=("value", "max"),
        apy=("apy", "max"),
        guaranteed=("guaranteed", "max"),
        is_current=("is_active", "any"),
    )
    deduped["year_signed"] = deduped["year_signed"].astype(int)

    return deduped.rename(columns={"gsis_id": "player_id"})[
        [
            "player_id",
            "player_name",
            "position",
            "year_signed",
            "years",
            "total_value",
            "apy",
            "guaranteed",
            "is_current",
        ]
    ]
