"""Classifies every tracked OL player into one of ~20 named "Player
Archetypes" (Blue Chip Freak, Power Tackle, etc.) and writes the result --
plus 2-3 short reason bullets for display on the player page -- to
`player_archetypes`. Run manually (not part of pull_and_compute.py, see
that table's comment in supabase/schema.sql for why): `venv/bin/python
compute_player_archetypes.py` from `pipeline/`.

Started as a one-off analysis script (pipeline/_scratch/classify_archetypes.py,
gitignored) iterated on live with the user; this is that same rule set
promoted to a real, re-runnable pipeline script once the rules stabilized
enough to ship. Re-run it whenever new combine/honors/depth-chart data
comes in and you want archetypes refreshed -- it's a full upsert, safe to
re-run any time.

Dimensions (each a 0-100 percentile):
  Size        - height+weight. Prefers mockdraftable's own height/weight
                percentile (already position-relative); falls back to a
                percentile computed ourselves from raw height+weight
                against other tracked players at the same primary position
                (Tackle/Guard/Center), for players mockdraftable didn't
                percentile (nflreadpy-sourced combine rows, or players with
                only a `players`-table height/weight and no combine match
                at all).
  Length      - avg(arm_length_percentile, wingspan_percentile), mockdraftable-only.
  Explosive   - avg of whichever of forty/vertical/broad_jump/cone/shuttle/
                bench percentiles are present, mockdraftable-only (nflreadpy
                rows have no percentiles and contribute nothing here).

Tiers: elite >=65, above-average 40-64, average 20-39, below-average <20.

Blue Chip Freak/Mauler gate on draft_pick <= 50, not draft_round == 1.

Precedence: Blue Chip Freak -> Elite Freak Athlete -> Freak Athlete ->
Blue Chip Mauler -> Elite Power/Rangy [Position] (honors override) ->
best-fit among the middle archetypes -> Undersized & Explosive -> mop-up
passes (snap-history-based fallbacks) -> All-Around Reliable Starter
(last resort, pure starter-consistency check, no combine data needed).

Primary position (Tackle/Guard/Center) is whichever position group a
player logged the most total snaps at, across all tracked seasons.
"Previous 3 seasons" for versatility/swing-tackle checks = 2023-2025 (the
most recent seasons with real, non-projected snap data).
"""

from write_to_supabase import fetch_all, get_client, upsert_player_archetypes

RECENT_SEASONS = {2023, 2024, 2025}
STARTER_CHECK_SEASONS = {2024, 2025}  # "the past 2 seasons" for All-Around Reliable Starter
HONORS_RECENT_SEASONS = {2021, 2022, 2023, 2024, 2025}
POSITION_GROUP = {"LT": "Tackle", "RT": "Tackle", "LG": "Guard", "RG": "Guard", "C": "Center"}

ELITE, ABOVE_AVG, AVERAGE, BELOW_AVG = "elite", "above_average", "average", "below_average"

# Blue Chip Freak gets its own, lower elite bar (both Size and Explosive
# must clear this) -- data-derived: the 5th-best pick<=50 candidate by
# min(size_pctl, explosive_pctl) is Joe Alt at 72.667 (not 73 -- that was
# print-rounding), and the 6th/7th (Ragnow, Campbell) tie exactly at 72.0,
# so 72.5 is the threshold that yields exactly "at least 5" without
# overshooting to 7. Blue Chip Mauler still gates on the general ELITE
# tier below for its Size requirement.
FREAK_ELITE_THRESHOLD = 72.5

# Lowered from 200 -- most players who already cleared 200 at both LT and RT
# in a season but stayed uncategorized were failing on trait data (missing
# combine numbers, or size/explosive too low), not snap count, so lowering
# this mainly pulls in players with real-but-lighter LT/RT rotation (matches
# Power Versatile OL's 100-per-position bar for consistency).
SWING_TACKLE_SNAP_THRESHOLD = 50


def tier(pctl: float | None) -> str | None:
    if pctl is None:
        return None
    if pctl >= 65:
        return ELITE
    if pctl >= 40:
        return ABOVE_AVG
    if pctl >= 20:
        return AVERAGE
    return BELOW_AVG


def avg(*values: float | None) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) / len(present) if present else None


def percentile_rank(value: float, population: list[float]) -> float:
    lower = sum(1 for v in population if v < value)
    equal = sum(1 for v in population if v == value)
    return 100 * (lower + 0.5 * equal) / len(population)


def load_players_data():
    client = get_client()
    depth = fetch_all(
        client, "ol_depth_chart", "player_id,player_name,season,position,snaps,depth_rank", not_null="player_id"
    )
    players = fetch_all(client, "players", "player_id,draft_round,draft_pick,height,weight")
    combine = fetch_all(
        client,
        "player_combine",
        "player_id,height,weight,height_percentile,weight_percentile,"
        "arm_length_percentile,wingspan_percentile,"
        "forty_percentile,vertical_percentile,broad_jump_percentile,cone_percentile,shuttle_percentile,bench_percentile",
    )
    honors = fetch_all(client, "player_honors", "player_id,season,honor")
    return client, depth, players, combine, honors


def compute_honors_detail(honors) -> dict[str, dict]:
    """Per player: whether an All-Pro (1st or 2nd team) and how many Pro
    Bowls, both within HONORS_RECENT_SEASONS -- feeds both the honors-
    override eligibility check and the honors reason bullet."""
    detail: dict[str, dict] = {}
    for h in honors:
        pid = h["player_id"]
        if not pid or h["season"] not in HONORS_RECENT_SEASONS:
            continue
        d = detail.setdefault(pid, {"all_pro": False, "pro_bowl_count": 0})
        if h["honor"] in ("all_pro_1st", "all_pro_2nd"):
            d["all_pro"] = True
        elif h["honor"] == "pro_bowl":
            d["pro_bowl_count"] += 1
    return detail


def build_player_records(depth, players, combine, honors):
    players_by_id = {p["player_id"]: p for p in players}
    combine_by_id = {c["player_id"]: c for c in combine}
    honors_detail_by_id = compute_honors_detail(honors)

    by_player: dict[str, dict] = {}
    for row in depth:
        pid = row["player_id"]
        rec = by_player.setdefault(
            pid,
            {"player_id": pid, "player_name": row["player_name"], "snaps_by_group": {}, "positions_recent": set(),
             "lt_snaps_by_season": {}, "rt_snaps_by_season": {}, "snaps_by_position_recent": {},
             "starter_seasons": set()},
        )
        group = POSITION_GROUP.get(row["position"])
        snaps = row["snaps"] or 0
        if group:
            rec["snaps_by_group"][group] = rec["snaps_by_group"].get(group, 0) + snaps
        if row["season"] in STARTER_CHECK_SEASONS and row["depth_rank"] == 1:
            rec["starter_seasons"].add(row["season"])
        if row["season"] in RECENT_SEASONS:
            rec["positions_recent"].add(row["position"])
            rec["snaps_by_position_recent"][row["position"]] = (
                rec["snaps_by_position_recent"].get(row["position"], 0) + snaps
            )
            if row["position"] == "LT":
                rec["lt_snaps_by_season"][row["season"]] = rec["lt_snaps_by_season"].get(row["season"], 0) + snaps
            elif row["position"] == "RT":
                rec["rt_snaps_by_season"][row["season"]] = rec["rt_snaps_by_season"].get(row["season"], 0) + snaps

    # Primary position: whichever group has the most total snaps.
    for rec in by_player.values():
        groups = rec["snaps_by_group"]
        rec["primary_position"] = max(groups, key=groups.get) if groups else None
        rec["is_versatile"] = len(rec["positions_recent"]) >= 3
        # Power Versatile OL's stricter bar: 100+ total snaps (2023-2025) at
        # each of 3+ distinct positions, not just any snaps at all.
        rec["is_versatile_strict"] = sum(1 for s in rec["snaps_by_position_recent"].values() if s >= 100) >= 3
        rec["is_swing_tackle"] = any(
            rec["lt_snaps_by_season"].get(s, 0) >= SWING_TACKLE_SNAP_THRESHOLD
            and rec["rt_snaps_by_season"].get(s, 0) >= SWING_TACKLE_SNAP_THRESHOLD
            for s in RECENT_SEASONS
        )
        # "Started most snaps in the past 2 seasons" -- depth_rank==1 (the
        # season's actual top snap-getter at their position) in both 2024
        # and 2025, not just one good year -- matches "reliable" in the name.
        rec["is_reliable_starter"] = STARTER_CHECK_SEASONS.issubset(rec["starter_seasons"])
        detail = honors_detail_by_id.get(rec["player_id"], {"all_pro": False, "pro_bowl_count": 0})
        rec["is_all_pro"] = detail["all_pro"]
        rec["pro_bowl_count"] = detail["pro_bowl_count"]
        rec["honors_eligible"] = detail["all_pro"] or detail["pro_bowl_count"] >= 2

    # Raw height/weight per player (players table preferred, else combine's own).
    raw_size = {}
    for pid, rec in by_player.items():
        p = players_by_id.get(pid)
        c = combine_by_id.get(pid)
        h = (p and p["height"]) or (c and c["height"])
        w = (p and p["weight"]) or (c and c["weight"])
        if h and w:
            raw_size[pid] = (float(h), float(w), rec["primary_position"])

    # Our own position-relative Size percentile, for players without mockdraftable's.
    by_position_heights: dict[str, list[float]] = {}
    by_position_weights: dict[str, list[float]] = {}
    for pid, (h, w, pos) in raw_size.items():
        if pos:
            by_position_heights.setdefault(pos, []).append(h)
            by_position_weights.setdefault(pos, []).append(w)

    for pid, rec in by_player.items():
        p = players_by_id.get(pid)
        rec["draft_pick"] = p["draft_pick"] if p else None

        c = combine_by_id.get(pid)
        mockdraftable_size = avg(c["height_percentile"], c["weight_percentile"]) if c else None
        if mockdraftable_size is not None:
            rec["size_pctl"] = mockdraftable_size
        elif pid in raw_size and raw_size[pid][2]:
            h, w, pos = raw_size[pid]
            h_pctl = percentile_rank(h, by_position_heights[pos])
            w_pctl = percentile_rank(w, by_position_weights[pos])
            rec["size_pctl"] = (h_pctl + w_pctl) / 2
        else:
            rec["size_pctl"] = None

        rec["length_pctl"] = avg(c["arm_length_percentile"], c["wingspan_percentile"]) if c else None
        rec["explosive_pctl"] = (
            avg(
                c["forty_percentile"], c["vertical_percentile"], c["broad_jump_percentile"],
                c["cone_percentile"], c["shuttle_percentile"], c["bench_percentile"],
            )
            if c
            else None
        )
        rec["cone_pctl"] = c["cone_percentile"] if c else None
        rec["shuttle_pctl"] = c["shuttle_percentile"] if c else None

        # Weight specifically (not blended with height like size_pctl) --
        # needed for the "one of the lightest at his position" Power
        # disqualification, since a tall-but-light player's composite Size
        # can look above-average even when his actual weight doesn't -- and
        # for the "weight" reason bullet on Power/Road-Grader archetypes.
        mockdraftable_weight = c["weight_percentile"] if c else None
        if mockdraftable_weight is not None:
            rec["weight_pctl"] = mockdraftable_weight
        elif pid in raw_size and raw_size[pid][2]:
            _, w, pos = raw_size[pid]
            rec["weight_pctl"] = percentile_rank(w, by_position_weights[pos])
        else:
            rec["weight_pctl"] = None
        rec["bench_pctl"] = c["bench_percentile"] if c else None

    return by_player


# --- Archetype rules -------------------------------------------------------
# Each middle archetype (3-12) is (name, check(rec) -> bool, score(rec) -> float).
# check() assumes tiers/flags already computed on rec.

def _margin(pctl, above=True):
    """How far a percentile clears the above-average(40)/below-average(20)
    line, used purely to rank same-archetype fits against each other."""
    if pctl is None:
        return 0
    return (pctl - 40) if above else (20 - pctl)


# "Technician" archetypes (average-ish both dimensions) use a deliberately
# narrower, tightened band than the generic AVERAGE tier (20-39) -- made
# "slightly harder to be in" per user request, so they only catch players
# solidly in the middle, not ones sitting right at the tier boundary.
CORE_AVG_LOW, CORE_AVG_HIGH = 25, 38
# Undersized Technician's Size bar is tightened further than the generic
# below-average tier (<20) -- only clearly-small players, not borderline ones.
UNDERSIZED_TECHNICIAN_SIZE_MAX = 15


def _in_core_average(pctl):
    return pctl is not None and CORE_AVG_LOW <= pctl < CORE_AVG_HIGH


def _core_margin(pctl):
    """Rank same-archetype fits: how close to the center of the core-average band."""
    if pctl is None:
        return 0
    center = (CORE_AVG_LOW + CORE_AVG_HIGH) / 2
    return -abs(pctl - center)


# "If a guy is one of the lightest players at his position he should never
# be a Power category unless his bench press is 95+ percentile" -- weight
# specifically (not the blended height+weight Size score, which a tall-
# but-light player can still clear), position-relative, bottom 10%.
POWER_LIGHTWEIGHT_CUTOFF = 10
POWER_LIGHTWEIGHT_BENCH_EXCEPTION = 95


def _power_disqualified(r) -> bool:
    if r["weight_pctl"] is None or r["weight_pctl"] >= POWER_LIGHTWEIGHT_CUTOFF:
        return False
    return not (r["bench_pctl"] is not None and r["bench_pctl"] >= POWER_LIGHTWEIGHT_BENCH_EXCEPTION)


# "If a guy is in the top 20 percentile of size, he should be Power unless
# his measurables are off the charts (in which case he's probably Freak)."
# Gated on Explosive specifically, not Length -- Length mostly just tracks
# height/size and isn't a surprising-athleticism signal the way Freak
# Athlete's Explosive requirement is.
POWER_TOP_SIZE_PERCENTILE = 80


def _rangy_blocked_by_size(r) -> bool:
    return (
        r["size_pctl"] is not None
        and r["size_pctl"] >= POWER_TOP_SIZE_PERCENTILE
        and tier(r["explosive_pctl"]) != ELITE
    )


def _power_explosive_ok(r) -> bool:
    t = tier(r["explosive_pctl"])
    if t in (AVERAGE, BELOW_AVG, None):
        return True
    return t == ABOVE_AVG and r["size_pctl"] is not None and r["size_pctl"] >= POWER_TOP_SIZE_PERCENTILE


MIDDLE_ARCHETYPES = [
    (
        "Long Rangy Tackle",
        lambda r: r["primary_position"] == "Tackle" and tier(r["length_pctl"]) in (ABOVE_AVG, ELITE)
        and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE) and not _rangy_blocked_by_size(r),
        lambda r: _margin(r["length_pctl"]) + _margin(r["explosive_pctl"]),
    ),
    (
        "Power Tackle",
        lambda r: r["primary_position"] == "Tackle" and tier(r["size_pctl"]) in (ABOVE_AVG, ELITE)
        and _power_explosive_ok(r) and not _power_disqualified(r),
        lambda r: _margin(r["size_pctl"]) + _margin(r["explosive_pctl"], above=False),
    ),
    (
        "Road Grader Center",
        lambda r: r["primary_position"] == "Center" and tier(r["size_pctl"]) in (ABOVE_AVG, ELITE)
        and _power_explosive_ok(r) and not _power_disqualified(r),
        lambda r: _margin(r["size_pctl"]) + _margin(r["explosive_pctl"], above=False),
    ),
    (
        "Road Grader Guard",
        lambda r: r["primary_position"] == "Guard" and tier(r["size_pctl"]) in (ABOVE_AVG, ELITE)
        and _power_explosive_ok(r) and not _power_disqualified(r),
        lambda r: _margin(r["size_pctl"]) + _margin(r["explosive_pctl"], above=False),
    ),
    (
        "Rangy Center",
        lambda r: r["primary_position"] == "Center" and tier(r["size_pctl"]) == AVERAGE
        and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE),
        lambda r: _margin(r["explosive_pctl"]),
    ),
    (
        "Rangy Guard",
        lambda r: r["primary_position"] == "Guard" and tier(r["size_pctl"]) == AVERAGE
        and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE),
        lambda r: _margin(r["explosive_pctl"]),
    ),
    (
        "Rangy Versatile OL",
        lambda r: r["is_versatile"] and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE)
        and not _rangy_blocked_by_size(r),
        lambda r: 50 + _margin(r["explosive_pctl"]),
    ),
    (
        "Rangy Swing Tackle",
        lambda r: r["is_swing_tackle"] and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE)
        and not _rangy_blocked_by_size(r),
        lambda r: 50 + _margin(r["explosive_pctl"]),
    ),
    (
        "Power Versatile OL",
        lambda r: r["is_versatile_strict"] and tier(r["size_pctl"]) in (ABOVE_AVG, ELITE)
        and _power_explosive_ok(r) and not _power_disqualified(r),
        lambda r: 50 + _margin(r["size_pctl"]) + _margin(r["explosive_pctl"], above=False),
    ),
    (
        "Power Swing Tackle",
        lambda r: r["is_swing_tackle"] and tier(r["size_pctl"]) in (ABOVE_AVG, ELITE)
        and _power_explosive_ok(r) and not _power_disqualified(r),
        lambda r: 50 + _margin(r["size_pctl"]) + _margin(r["explosive_pctl"], above=False),
    ),
    (
        "Limited Athlete Technician",
        lambda r: _in_core_average(r["size_pctl"]) and _in_core_average(r["explosive_pctl"]),
        lambda r: _core_margin(r["size_pctl"]) + _core_margin(r["explosive_pctl"]),
    ),
    (
        "Undersized Technician",
        lambda r: r["size_pctl"] is not None and r["size_pctl"] < UNDERSIZED_TECHNICIAN_SIZE_MAX
        and _in_core_average(r["explosive_pctl"]),
        lambda r: (UNDERSIZED_TECHNICIAN_SIZE_MAX - r["size_pctl"]) + _core_margin(r["explosive_pctl"]),
    ),
]

POWER_ARCHETYPE_BY_POSITION = {
    "Tackle": "Power Tackle",
    "Center": "Road Grader Center",
    "Guard": "Road Grader Guard",
}
RANGY_ARCHETYPE_BY_POSITION = {
    "Tackle": "Long Rangy Tackle",
    "Center": "Rangy Center",
    "Guard": "Rangy Guard",
}


def classify(rec: dict) -> str | None:
    is_top_50_pick = rec["draft_pick"] is not None and rec["draft_pick"] <= 50
    # Blue Chip Freak's bar is deliberately looser than the general ELITE
    # tier (72.5 vs 65+ elsewhere) -- calibrated specifically to get "at
    # least 5" among top-50 picks.
    freak_eligible = (
        is_top_50_pick
        and rec["size_pctl"] is not None and rec["size_pctl"] >= FREAK_ELITE_THRESHOLD
        and rec["explosive_pctl"] is not None and rec["explosive_pctl"] >= FREAK_ELITE_THRESHOLD
    )
    freak_athlete_eligible = (
        not is_top_50_pick and tier(rec["size_pctl"]) == ELITE and tier(rec["explosive_pctl"]) == ELITE
    )
    blue_chip_eligible = is_top_50_pick and tier(rec["size_pctl"]) == ELITE

    # Real-world recognition (an All-Pro, or 2+ Pro Bowls, in the last 5
    # seasons) overrides the measurement-based label -- but Blue Chip still
    # wins if it already applies. A Freak-Athlete-shaped honoree becomes
    # "Elite Freak Athlete" specifically; everyone else honored gets
    # "Elite Power/Rangy [Position]". A below-average-size player missing
    # explosive data is presumed Rangy: an All-Pro/multi-Pro-Bowler that
    # small is winning on quickness/technique, not a "Power" label implying
    # size that isn't there.
    elite_freak_athlete_eligible = freak_athlete_eligible and rec["honors_eligible"]
    elite_power_rangy_eligible = (
        rec["honors_eligible"] and not freak_eligible and not blue_chip_eligible and not freak_athlete_eligible
    )
    elite_power_rangy_label = None
    if elite_power_rangy_eligible and rec["primary_position"] in RANGY_ARCHETYPE_BY_POSITION:
        if tier(rec["explosive_pctl"]) in (ABOVE_AVG, ELITE):
            flavor = "Rangy"
        elif tier(rec["size_pctl"]) == BELOW_AVG or _power_disqualified(rec):
            flavor = "Rangy"
        else:
            flavor = "Power"
        elite_power_rangy_label = f"Elite {flavor} {rec['primary_position']}"

    if freak_eligible:
        return "Blue Chip Freak"
    if elite_freak_athlete_eligible:
        return "Elite Freak Athlete"
    if freak_athlete_eligible:
        return "Freak Athlete"
    if blue_chip_eligible:
        return "Blue Chip Mauler"
    if elite_power_rangy_label:
        return elite_power_rangy_label

    middle_matches = [(name, score(rec)) for name, check, score in MIDDLE_ARCHETYPES if check(rec)]
    if middle_matches:
        return max(middle_matches, key=lambda x: x[1])[0]

    if tier(rec["size_pctl"]) == BELOW_AVG and tier(rec["explosive_pctl"]) == ELITE:
        return "Undersized & Explosive"

    return None


# --- Mop-up passes ----------------------------------------------------------
# Applied only to whoever STILL has no archetype after classify() above --
# these don't compete via best-fit scoring with anything else, they're a
# deliberate last-resort sweep, run in this order:
#   1. Smallest remaining players whose Explosive is close to elite ->
#      Undersized & Explosive.
#   2. Remaining elite-or-close Size players with the lowest Explosive ->
#      whichever of Power Tackle/Road Grader Center/Road Grader Guard
#      matches their primary position.
#   3. Remaining Tackles with above-average Size who didn't clear Long
#      Rangy Tackle's normal Length bar (two sub-cases on Explosive tier).
#   4. Everyone else with elite Explosive and above-average/average Size ->
#      the Rangy archetype for their position.
#   5. Elite Size + above-average Explosive -> Power/Road Grader by position.
#   6. Last resort: whoever's been the outright top snap-getter at their
#      position in both of the last 2 seasons -> All-Around Reliable Starter.
MOPUP_SMALL_CLOSE_TO_ELITE_EXPLOSIVE = 50
MOPUP_BIG_SIZE_MIN = 60
MOPUP_BIG_LOW_EXPLOSIVE_MAX = 50
LONG_TACKLE_ELITE_EXPLOSIVE_LENGTH_MIN = 20
LONG_TACKLE_ABOVE_AVG_LENGTH_MIN = 15
LONG_TACKLE_ABOVE_AVG_EXPLOSIVE_MIN = 50


def mopup_classify(rec: dict) -> str | None:
    if rec["size_pctl"] is None or rec["explosive_pctl"] is None:
        return "All-Around Reliable Starter" if rec["is_reliable_starter"] else None
    if rec["size_pctl"] < 20 and rec["explosive_pctl"] >= MOPUP_SMALL_CLOSE_TO_ELITE_EXPLOSIVE:
        return "Undersized & Explosive"
    if (
        rec["size_pctl"] >= MOPUP_BIG_SIZE_MIN
        and rec["explosive_pctl"] < MOPUP_BIG_LOW_EXPLOSIVE_MAX
        and not _power_disqualified(rec)
    ):
        return POWER_ARCHETYPE_BY_POSITION.get(rec["primary_position"])
    if (
        rec["primary_position"] == "Tackle"
        and tier(rec["size_pctl"]) == ABOVE_AVG
        and rec["length_pctl"] is not None
    ):
        if tier(rec["explosive_pctl"]) == ELITE and rec["length_pctl"] >= LONG_TACKLE_ELITE_EXPLOSIVE_LENGTH_MIN:
            return "Long Rangy Tackle"
        if (
            tier(rec["explosive_pctl"]) == ABOVE_AVG
            and rec["length_pctl"] >= LONG_TACKLE_ABOVE_AVG_LENGTH_MIN
            and rec["explosive_pctl"] >= LONG_TACKLE_ABOVE_AVG_EXPLOSIVE_MIN
        ):
            return "Long Rangy Tackle"
    if tier(rec["explosive_pctl"]) == ELITE and tier(rec["size_pctl"]) in (ABOVE_AVG, AVERAGE):
        return RANGY_ARCHETYPE_BY_POSITION.get(rec["primary_position"])
    if (
        tier(rec["size_pctl"]) == ELITE
        and tier(rec["explosive_pctl"]) == ABOVE_AVG
        and not _power_disqualified(rec)
    ):
        return POWER_ARCHETYPE_BY_POSITION.get(rec["primary_position"])
    if rec["is_reliable_starter"]:
        return "All-Around Reliable Starter"
    return None


# --- Reason bullets ----------------------------------------------------------
# Built for direct display on the player page: 2-3 short bullets naming the
# specific stat(s) that actually drove the archetype, not a restatement of
# the archetype name. Concrete drill percentiles (cone/shuttle) are shown
# paired rather than averaged when both are present, matching how the
# player page's own Combine table already shows individual drills.

def ordinal(n: float) -> str:
    n = round(n)
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _pctl_bullet(label: str, *pctls: float | None) -> str | None:
    vals = [p for p in pctls if p is not None]
    if not vals:
        return None
    joined = " & ".join(ordinal(v) for v in vals)
    return f"{joined} %ile {label}"


def _weight_or_size_bullet(rec: dict) -> str | None:
    if rec["weight_pctl"] is not None:
        return _pctl_bullet("weight", rec["weight_pctl"])
    return _pctl_bullet("size", rec["size_pctl"])


def _length_or_athleticism_bullet(rec: dict) -> str | None:
    if rec["length_pctl"] is not None:
        return _pctl_bullet("length", rec["length_pctl"])
    return _pctl_bullet("athleticism", rec["explosive_pctl"])


def _agility_bullet(rec: dict) -> str | None:
    if rec["cone_pctl"] is not None and rec["shuttle_pctl"] is not None:
        return _pctl_bullet("agility", rec["cone_pctl"], rec["shuttle_pctl"])
    return _pctl_bullet("athleticism", rec["explosive_pctl"])


def _honors_bullet(rec: dict) -> str | None:
    if rec["is_all_pro"]:
        return "All-Pro"
    if rec["pro_bowl_count"] >= 2:
        return f"{rec['pro_bowl_count']}x Pro Bowl"
    if rec["pro_bowl_count"] == 1:
        return "Pro Bowl"
    return None


def _versatility_bullet(rec: dict) -> str:
    return "3+ positions, 100+ snaps each" if rec["is_versatile_strict"] else "3+ positions played"


def _starter_bullet(rec: dict) -> str | None:
    return "Top starter, '24 & '25" if rec["is_reliable_starter"] else None


def build_reasons(rec: dict, winner: str | None) -> list[str]:
    if winner is None:
        return []
    if winner == "Blue Chip Freak":
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Blue Chip Mauler":
        bullets = ["Top-50 pick", _weight_or_size_bullet(rec)]
    elif winner == "Elite Freak Athlete":
        bullets = [_honors_bullet(rec), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Freak Athlete":
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner.startswith("Elite Power "):
        bullets = [_honors_bullet(rec), _weight_or_size_bullet(rec)]
    elif winner.startswith("Elite Rangy "):
        bullets = [_honors_bullet(rec), _length_or_athleticism_bullet(rec)]
    elif winner in ("Power Tackle", "Road Grader Center", "Road Grader Guard"):
        bullets = [_weight_or_size_bullet(rec), _agility_bullet(rec)]
    elif winner == "Long Rangy Tackle":
        bullets = [_pctl_bullet("length", rec["length_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner in ("Rangy Center", "Rangy Guard"):
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Rangy Versatile OL":
        bullets = [_versatility_bullet(rec), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Rangy Swing Tackle":
        bullets = ["LT & RT snaps", _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Power Versatile OL":
        bullets = [_versatility_bullet(rec), _weight_or_size_bullet(rec)]
    elif winner == "Power Swing Tackle":
        bullets = ["LT & RT snaps", _weight_or_size_bullet(rec)]
    elif winner in ("Limited Athlete Technician", "Undersized Technician"):
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Undersized & Explosive":
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "All-Around Reliable Starter":
        bullets = [_starter_bullet(rec), _pctl_bullet("size", rec["size_pctl"])]
    else:
        bullets = []
    return [b for b in bullets if b][:3]


def main():
    client, depth, players, combine, honors = load_players_data()
    by_player = build_player_records(depth, players, combine, honors)

    rows = []
    categorized = 0
    for pid, rec in by_player.items():
        winner = classify(rec)
        if winner is None:
            winner = mopup_classify(rec)
        if winner is None:
            continue
        categorized += 1
        rows.append(
            {
                "player_id": pid,
                "archetype": winner,
                "reasons": build_reasons(rec, winner),
            }
        )

    upsert_player_archetypes(client, rows)
    print(f"Wrote {len(rows)} archetypes ({categorized}/{len(by_player)} tracked OL categorized).")


if __name__ == "__main__":
    main()
