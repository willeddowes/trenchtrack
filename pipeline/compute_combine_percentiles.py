"""Computes combine-drill/measurable percentiles for every tracked OL from
data already in this DB, replacing the old approach of relying entirely on
a one-off mockdraftable.com scrape (never re-runnable as a real pipeline
step, and never re-run for the 2025 draft class -- see player_combine's
comment in schema.sql, and CLAUDE.md's manually-researched-data pattern).
Run manually (not part of pull_and_compute.py, same reasoning as
compute_player_archetypes.py/compute_injury_rates.py):
    venv/bin/python compute_combine_percentiles.py
Re-run whenever combine/depth-chart data changes and you want percentiles
refreshed -- full upsert, safe to re-run any time.

Percentiles are computed PER POSITION GROUP (OT/OG/C -- same grouping
getPlayerPageData.ts derives from career snap totals, not player_combine's
own `position` column, which is missing for some Wikipedia-only rows and
just reflects whatever position a player was listed at coming out of
college, not necessarily their real NFL side) against every other tracked
player in that group who has a value for that specific field, using the
same percentile_rank() formula as compute_injury_rates.py:
    100 * (lower + 0.5*equal) / len(population)
Lower-is-better fields (faster wins): forty, cone, shuttle.
Higher-is-better fields (bigger/longer/more wins): everything else.

A player with no real NFL snaps yet (shouldn't happen for anyone this
script can see, since player_combine only has rows for players who've
appeared in ol_depth_chart at some point) or with fewer than 2 other
players in their position group for a given field gets left alone --
same "don't fabricate a percentile with nothing to compare against"
reasoning as the rest of this pipeline.
"""

from write_to_supabase import fetch_all, get_client, upsert_player_combine

POSITION_GROUP = {"LT": "OT", "RT": "OT", "LG": "OG", "RG": "OG", "C": "C"}

# (field, higher_is_better)
FIELDS = [
    ("arm_length", True),
    ("hand_size", True),
    ("wingspan", True),
    ("forty", False),
    ("bench", True),
    ("vertical", True),
    ("broad_jump", True),
    ("cone", False),
    ("shuttle", False),
]


def percentile_rank(value: float, population: list[float], higher_is_better: bool) -> float:
    lower = sum(1 for v in population if (v < value if higher_is_better else v > value))
    equal = sum(1 for v in population if v == value)
    return 100 * (lower + 0.5 * equal) / len(population)


def primary_positions(client) -> dict[str, str]:
    """player_id -> OT/OG/C, whichever group has the most total career
    snaps -- mirrors getPlayerPageData.ts's primaryPosition derivation."""
    rows = fetch_all(client, "ol_depth_chart", "player_id,position,snaps", not_null="player_id")
    snaps_by_player_group: dict[str, dict[str, int]] = {}
    for r in rows:
        group = POSITION_GROUP.get(r["position"])
        if not group:
            continue
        by_group = snaps_by_player_group.setdefault(r["player_id"], {})
        by_group[group] = by_group.get(group, 0) + (r["snaps"] or 0)

    result = {}
    for pid, by_group in snaps_by_player_group.items():
        result[pid] = max(by_group, key=lambda g: by_group[g])
    return result


def main():
    client = get_client()
    positions = primary_positions(client)
    combine_rows = fetch_all(
        client,
        "player_combine",
        "player_id,player_name,source," + ",".join(f for f, _ in FIELDS),
    )
    # player_name/source are NOT NULL on player_combine -- Postgres checks
    # that against the proposed INSERT row before it even gets to ON
    # CONFLICT DO UPDATE, so a partial-column upsert has to carry these
    # along unchanged even though they're not what we're actually updating
    # (the "merge doesn't null out unlisted columns" behavior only applies
    # to which columns get OVERWRITTEN on conflict, not to what's required
    # to pass the insert's own NOT NULL check in the first place).
    name_and_source_by_id = {r["player_id"]: (r["player_name"], r["source"]) for r in combine_rows}

    # (position_group, field) -> {player_id: value}, only players with both
    # a known position group and a real value for that field.
    by_group_field: dict[tuple[str, str], dict[str, float]] = {}
    for row in combine_rows:
        group = positions.get(row["player_id"])
        if not group:
            continue
        for field, _ in FIELDS:
            value = row.get(field)
            if value is not None:
                by_group_field.setdefault((group, field), {})[row["player_id"]] = value

    updates: dict[str, dict] = {}
    for (group, field), values_by_player in by_group_field.items():
        if len(values_by_player) < 2:
            continue  # nothing meaningful to rank against
        higher_is_better = next(h for f, h in FIELDS if f == field)
        population = list(values_by_player.values())
        for pid, value in values_by_player.items():
            pctl = percentile_rank(value, population, higher_is_better)
            if pid not in updates:
                name, source = name_and_source_by_id[pid]
                updates[pid] = {"player_id": pid, "player_name": name, "source": source}
            updates[pid][f"{field}_percentile"] = round(pctl, 1)

    rows_to_write = list(updates.values())
    print(f"Computed percentiles for {len(rows_to_write)} players.")
    upsert_player_combine(client, rows_to_write)
    print("Done.")


if __name__ == "__main__":
    main()
