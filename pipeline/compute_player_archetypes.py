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
  Size        - avg(height percentile, weight percentile). Height prefers
                mockdraftable's own percentile (already position-relative,
                and height doesn't drift over a career, so staleness isn't
                a concern); falls back to a percentile computed ourselves
                against other tracked players at the same primary position
                for players mockdraftable didn't percentile. Weight is
                ALWAYS computed ourselves from the latest known weight
                (`players.weight`, refreshed every pipeline pull, preferred
                over player_combine's frozen combine-day weight) rather than
                trusting mockdraftable's percentile directly -- a veteran's
                weight can move 20+ lbs since being drafted (e.g. Lane
                Johnson: 303 lbs at his 2013 combine vs. 325 today), and a
                percentile computed off the old number would misjudge his
                current Size.
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

# Matches web/lib/teamsStatic.ts's CURRENT_SEASON -- duplicated here for the
# same reason the grading formula is duplicated across languages (see
# CLAUDE.md): this is a small Python script with no shared config with the
# Next.js app. Used only for the Blue Chip young-player honors exception below.
CURRENT_SEASON = 2025

ELITE, ABOVE_AVG, AVERAGE, BELOW_AVG = "elite", "above_average", "average", "below_average"

# Blue Chip Freak gets its own, lower elite bar (both Size and Explosive
# must clear this). Originally 72.5 (yielded exactly the top 5 by
# min(size_pctl, explosive_pctl)); revised down after the Size fix above
# changed weight_pctl for every player with a current weight different from
# their combine weight -- Lane Johnson's Size moved from 37.5 to 70.5 (see
# that fix's comment), landing him at min=70.48, just under the old 72.5
# bar, despite an unambiguously elite 91.7 Explosive. Per user request he
# should qualify -- 70.0 is the lowest threshold that includes him without
# also sweeping in the next-lower candidate (Quenton Nelson at 69.4), and
# ends up admitting the top 7 by this ranking rather than 5 (Lane Johnson
# plus Frank Ragnow, who was already sitting just above the old bar at
# exactly 72.0 -- any single threshold that admits Johnson necessarily
# admits everyone already ranked higher). Blue Chip Mauler still gates on
# the general ELITE tier below for its Size requirement.
FREAK_ELITE_THRESHOLD = 70.0

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
    players = fetch_all(client, "players", "player_id,draft_round,draft_pick,draft_year,height,weight")
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

    # Position-relative populations for our own percentile_rank() calls below
    # -- weight always uses this (see the loop below for why); height only
    # falls back to it when mockdraftable has no percentile for a player.
    by_position_heights: dict[str, list[float]] = {}
    by_position_weights: dict[str, list[float]] = {}
    for pid, (h, w, pos) in raw_size.items():
        if pos:
            by_position_heights.setdefault(pos, []).append(h)
            by_position_weights.setdefault(pos, []).append(w)

    for pid, rec in by_player.items():
        p = players_by_id.get(pid)
        rec["draft_pick"] = p["draft_pick"] if p else None
        rec["draft_year"] = p["draft_year"] if p else None

        c = combine_by_id.get(pid)

        # Height: mockdraftable's own percentile is trusted directly -- height
        # doesn't drift over a career the way weight does, so there's no
        # staleness concern here.
        mockdraftable_height_pctl = c["height_percentile"] if c else None
        if mockdraftable_height_pctl is not None:
            height_pctl = mockdraftable_height_pctl
        elif pid in raw_size and raw_size[pid][2]:
            h, _, pos = raw_size[pid]
            height_pctl = percentile_rank(h, by_position_heights[pos])
        else:
            height_pctl = None

        # Weight: ALWAYS our own percentile from the latest known weight
        # (raw_size already prefers players.weight -- refreshed every
        # pipeline pull -- over player_combine's frozen combine-day weight)
        # -- never mockdraftable's percentile directly, since that's frozen
        # at whatever a player weighed on his combine day and can't reflect
        # a decade of bulking up/down since. Also used standalone (not
        # blended with height) for the "one of the lightest at his position"
        # Power disqualification and the "weight" reason bullet.
        if pid in raw_size and raw_size[pid][2]:
            _, w, pos = raw_size[pid]
            rec["weight_pctl"] = percentile_rank(w, by_position_weights[pos])
        else:
            rec["weight_pctl"] = None

        rec["size_pctl"] = avg(height_pctl, rec["weight_pctl"])

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


# "Long Rangy Tackle" implies genuinely long arms, not just "not short" --
# a Tackle who clears the general length tier (40+) but sits below 60 reads
# as "Rangy Tackle" instead (same explosiveness story, just not a length
# standout). Applies everywhere a Tackle can land in the Rangy family,
# including the mopup passes below, which previously had no length floor
# at all for this specific case.
LONG_TACKLE_LENGTH_THRESHOLD = 60


def _tackle_rangy_label(length_pctl: float | None) -> str:
    if length_pctl is not None and length_pctl >= LONG_TACKLE_LENGTH_THRESHOLD:
        return "Long Rangy Tackle"
    return "Rangy Tackle"


MIDDLE_ARCHETYPES = [
    (
        "Long Rangy Tackle",
        lambda r: r["primary_position"] == "Tackle" and tier(r["length_pctl"]) in (ABOVE_AVG, ELITE)
        and r["length_pctl"] >= LONG_TACKLE_LENGTH_THRESHOLD
        and tier(r["explosive_pctl"]) in (ABOVE_AVG, ELITE) and not _rangy_blocked_by_size(r),
        lambda r: _margin(r["length_pctl"]) + _margin(r["explosive_pctl"]),
    ),
    (
        "Rangy Tackle",
        lambda r: r["primary_position"] == "Tackle" and tier(r["length_pctl"]) in (ABOVE_AVG, ELITE)
        and r["length_pctl"] < LONG_TACKLE_LENGTH_THRESHOLD
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
    # "Tackle"'s value here is never actually read (every call site special-
    # cases Tackle via _tackle_rangy_label before falling back to .get() on
    # this dict, since which Rangy-Tackle label applies depends on length,
    # not just position) -- the key still has to exist for the plain
    # membership check below (`primary_position in RANGY_ARCHETYPE_BY_POSITION`).
    "Tackle": "Long Rangy Tackle",
    "Center": "Rangy Center",
    "Guard": "Rangy Guard",
}


def _blue_chip_honors_eligible(rec: dict) -> bool:
    """Blue Chip's honors bar is the standard rec["honors_eligible"] (an
    All-Pro, or 2+ Pro Bowls, in the last 5 seasons) for everyone EXCEPT a
    player in year 2-4 of his career (draft_year 1-3 seasons before
    CURRENT_SEASON), who only needs 1 Pro Bowl -- he simply hasn't had
    enough healthy seasons yet to rack up a second one the way an
    established veteran has, and holding him to the veteran bar would
    punish being young rather than being unproven (e.g. Joe Alt, a
    unanimously-regarded elite tackle prospect with a 2025 Pro Bowl already,
    drafted 2024 -> year 2). A true rookie (year 1, drafted this season)
    still needs the full bar -- effectively All-Pro only, since 2 Pro Bowls
    is impossible with zero prior seasons -- "new" isn't the same as
    "hasn't played a season yet"."""
    draft_year = rec["draft_year"]
    if draft_year is not None:
        career_year = CURRENT_SEASON - draft_year + 1
        if 2 <= career_year <= 4:
            return rec["is_all_pro"] or rec["pro_bowl_count"] >= 1
    return rec["honors_eligible"]


def classify(rec: dict) -> str | None:
    is_top_50_pick = rec["draft_pick"] is not None and rec["draft_pick"] <= 50
    # Blue Chip Freak's bar is deliberately looser than the general ELITE
    # tier (72.5 vs 65+ elsewhere) -- calibrated specifically to get "at
    # least 5" among top-50 picks. Both Blue Chip archetypes also require
    # real-world recognition (_blue_chip_honors_eligible() -- see its
    # docstring for the young-player exception): a top-50 pick with elite
    # measurables but no NFL production to show for it yet isn't a "Blue
    # Chip" in the sense this label means, it's a bust or still unproven --
    # per user request, a player who fails this falls through to whatever
    # their next best-fit archetype is, exactly as if their draft
    # position/measurables never qualified them for Blue Chip in the first
    # place.
    blue_chip_honors_eligible = _blue_chip_honors_eligible(rec)
    freak_eligible = (
        is_top_50_pick
        and rec["size_pctl"] is not None and rec["size_pctl"] >= FREAK_ELITE_THRESHOLD
        and rec["explosive_pctl"] is not None and rec["explosive_pctl"] >= FREAK_ELITE_THRESHOLD
        and blue_chip_honors_eligible
    )
    freak_athlete_eligible = (
        not is_top_50_pick and tier(rec["size_pctl"]) == ELITE and tier(rec["explosive_pctl"]) == ELITE
    )
    blue_chip_eligible = is_top_50_pick and tier(rec["size_pctl"]) == ELITE and blue_chip_honors_eligible

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
#      Labeled "Long Rangy Tackle" vs "Rangy Tackle" per _tackle_rangy_label
#      -- these length floors (15/20) are well below LONG_TACKLE_LENGTH_THRESHOLD
#      (60), so most of this step's matches land as "Rangy Tackle".
#   4. Everyone else with elite Explosive and above-average/average Size ->
#      the Rangy archetype for their position (Tackle again split by
#      _tackle_rangy_label -- this step has no length check at all, so
#      without the split it used to hand out "Long Rangy Tackle" to Tackles
#      with arbitrarily short arms).
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
            return _tackle_rangy_label(rec["length_pctl"])
        if (
            tier(rec["explosive_pctl"]) == ABOVE_AVG
            and rec["length_pctl"] >= LONG_TACKLE_ABOVE_AVG_LENGTH_MIN
            and rec["explosive_pctl"] >= LONG_TACKLE_ABOVE_AVG_EXPLOSIVE_MIN
        ):
            return _tackle_rangy_label(rec["length_pctl"])
    if tier(rec["explosive_pctl"]) == ELITE and tier(rec["size_pctl"]) in (ABOVE_AVG, AVERAGE):
        if rec["primary_position"] == "Tackle":
            return _tackle_rangy_label(rec["length_pctl"])
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
# the archetype name. Agility (cone + shuttle) is blended into one number
# when both are present, same idea as the "athleticism" composite (avg of
# forty/vertical/broad_jump/cone/shuttle/bench) -- a single summarized
# score per concept, not two raw drill numbers side by side.

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
        return _pctl_bullet("agility", avg(rec["cone_pctl"], rec["shuttle_pctl"]))
    return _pctl_bullet("athleticism", rec["explosive_pctl"])


def _versatility_bullet(rec: dict) -> str:
    return "3+ positions, 100+ snaps each" if rec["is_versatile_strict"] else "3+ positions played"


def build_reasons(rec: dict, winner: str | None) -> list[str]:
    if winner is None:
        return []
    if winner == "Blue Chip Freak":
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Blue Chip Mauler":
        # Draft position is what routes a player here in the first place
        # (see classify()), but it's not a measurable -- the box should lead
        # with actual size/athleticism, same as every other archetype.
        bullets = [_weight_or_size_bullet(rec), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner in ("Elite Freak Athlete", "Freak Athlete"):
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner.startswith("Elite Power "):
        # Same measurables as the non-honors Power/Road-Grader archetypes --
        # the honor itself is already shown as a badge below, so the box
        # here should only ever explain the *measurable* fit.
        bullets = [_weight_or_size_bullet(rec), _agility_bullet(rec)]
    elif winner.startswith("Elite Rangy "):
        if rec["primary_position"] == "Tackle":
            bullets = [_pctl_bullet("length", rec["length_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
        else:
            bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner in ("Power Tackle", "Road Grader Center", "Road Grader Guard"):
        bullets = [_weight_or_size_bullet(rec), _agility_bullet(rec)]
    elif winner == "Long Rangy Tackle":
        bullets = [_pctl_bullet("length", rec["length_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Rangy Tackle":
        # Unlike Long Rangy Tackle, length isn't the story here (that's the
        # whole reason for the split) -- size + athleticism, same as Rangy
        # Center/Guard.
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner in ("Rangy Center", "Rangy Guard"):
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Rangy Versatile OL":
        bullets = [_versatility_bullet(rec), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Rangy Swing Tackle":
        bullets = ["LT & RT snaps", _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Power Versatile OL":
        bullets = [
            _versatility_bullet(rec),
            _weight_or_size_bullet(rec),
            _pctl_bullet("athleticism", rec["explosive_pctl"]),
        ]
    elif winner == "Power Swing Tackle":
        bullets = ["LT & RT snaps", _weight_or_size_bullet(rec), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner in ("Limited Athlete Technician", "Undersized Technician"):
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "Undersized & Explosive":
        bullets = [_pctl_bullet("size", rec["size_pctl"]), _pctl_bullet("athleticism", rec["explosive_pctl"])]
    elif winner == "All-Around Reliable Starter":
        # This archetype is the no-combine-data-required fallback -- a
        # player can land here missing EITHER size or explosive (not
        # necessarily both, see mopup_classify), so try both rather than
        # size only, which previously showed nothing extra for a player who
        # had real explosive data but no size. May end up with 0-2 bullets
        # depending on what data actually exists -- the archetype name
        # itself already conveys "reliable starter", so no text bullet
        # substitutes for it when neither measurable is available.
        bullets = [
            _pctl_bullet("size", rec["size_pctl"]),
            _pctl_bullet("athleticism", rec["explosive_pctl"]),
        ]
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
