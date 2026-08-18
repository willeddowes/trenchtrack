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

OTC's own gsis_id crosswalk lags behind the newest draft class -- verified
live for the 2025 rookie class: Tate Ratledge, Aireontae Ersery, Ozzy
Trapilo, and Anthony Belton (all real Week 1+ starters) each have a real,
current rookie contract in OTC's data with gsis_id null, so the old
gsis_id.notna() filter silently dropped them entirely. Falls back to
matching those null-gsis_id rows by normalized name against our own
tracked OL roster (ol_depth_chart) -- only when that normalized name is
unique across our whole tracked history, so a same-name collision between
two different tracked players (rare, but this table spans 2013+) can't
misattribute a contract.

First-round picks get a 5th-year option under the CBA -- a real, fully
guaranteed single-season salary tacked onto the end of the standard 4-year
rookie deal, not a new signing. OTC's flattened `contracts` row for that
deal only ever reports the base 4-year averages (verified: Ikem Ekwonu's
row shows apy=$6.9M/yr, years=4, from 2022 -- no separate row for his
$17.6M option year), but the same row's `season_history` field (a real
year-by-year cap breakdown, each entry duplicated back-to-back within the
list -- a raw-data quirk, not real multi-year overlap) does carry that
5th-year number once the option's been exercised. fifth_year_option_season
/_apy pull that specific year out for display -- see getPlayerPageData.ts,
which uses it in place of the base apy for whoever's currently in their
option year, and swaps the "(Rookie)" tag for "(5th year opt.)".
Deliberately scoped tight to avoid false positives: only when this is
still the player's live rookie deal (is_current, year_signed == the year
they actually entered the league, draft_round == 1, years == 4) -- a
player who instead re-signs a real new 4-year deal starting some other
year, or hits free agency instead of getting the option picked up, won't
match this and correctly falls back to their real current contract.
"""

import nflreadpy as nfl
import pandas as pd
from name_matching import normalize_name
from write_to_supabase import fetch_all

OL_POSITIONS = ["LT", "RT", "LG", "RG", "C"]


def _fifth_year_option(row: pd.Series) -> tuple[int | None, float | None]:
    if row["draft_round"] != 1 or row["years"] != 4 or not row["is_current"]:
        return None, None
    if pd.isna(row["draft_year"]) or int(row["draft_year"]) != row["year_signed"]:
        return None, None  # not their original rookie deal (a real new 4-yr deal, e.g.)

    option_season = row["year_signed"] + 4
    history = row["season_history"]
    # nflreadpy returns this as a numpy.ndarray of dicts, not a plain list.
    if not hasattr(history, "__len__") or len(history) == 0:
        return None, None

    # Each year appears twice in a row (identical values) -- a dict comp
    # naturally collapses that; last-wins is fine since dupes agree.
    by_year = {
        int(entry["year"]): entry.get("cap_number")
        for entry in history
        if entry.get("year") not in (None, "Total") and entry.get("cap_number") is not None
    }
    cap_number = by_year.get(option_season)
    if cap_number is None or cap_number <= 0:
        return None, None  # option not (yet) exercised / not in OTC's data
    return option_season, round(float(cap_number), 4)


def pull_player_contracts(client) -> pd.DataFrame:
    contracts = nfl.load_contracts().to_pandas()
    ol = contracts[contracts["position"].isin(OL_POSITIONS)].copy()

    missing_gsis = ol["gsis_id"].isna()
    if missing_gsis.any():
        roster = fetch_all(client, "ol_depth_chart", "player_id,player_name")
        name_to_ids: dict[str, set[str]] = {}
        for r in roster:
            norm = normalize_name(r["player_name"])
            if norm:
                name_to_ids.setdefault(norm, set()).add(r["player_id"])
        unique_name_to_id = {n: next(iter(ids)) for n, ids in name_to_ids.items() if len(ids) == 1}

        ol.loc[missing_gsis, "gsis_id"] = ol.loc[missing_gsis, "player"].apply(
            lambda name: unique_name_to_id.get(normalize_name(name))
        )

    ol = ol[ol["gsis_id"].notna()].copy()

    deduped = ol.groupby(["gsis_id", "year_signed"], as_index=False).agg(
        player_name=("player", "first"),
        position=("position", "first"),
        years=("years", "max"),
        total_value=("value", "max"),
        apy=("apy", "max"),
        guaranteed=("guaranteed", "max"),
        is_current=("is_active", "any"),
        draft_round=("draft_round", "first"),
        draft_year=("draft_year", "first"),
        season_history=("season_history", "first"),
    )
    deduped["year_signed"] = deduped["year_signed"].astype(int)

    option_cols = deduped.apply(_fifth_year_option, axis=1, result_type="expand")
    deduped["fifth_year_option_season"] = option_cols[0].astype("Int64")
    deduped["fifth_year_option_apy"] = option_cols[1]

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
            "fifth_year_option_season",
            "fifth_year_option_apy",
        ]
    ]
