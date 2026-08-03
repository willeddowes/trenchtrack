"""Backfills team_ol_stats and ol_depth_chart for one or more seasons.

Unlike pull_and_compute.py, this deliberately does NOT touch players or
injuries -- those tables only ever hold the CURRENT snapshot (see
CLAUDE.md), so writing a historical season's roster into them would
overwrite today's real roster with old data. ol_depth_chart is different:
it's real season history (see schema.sql), so it's fine -- and necessary --
to backfill for any season, including the current one.

nflreadpy's PFR advanced-stats source (pressure counts, rushing yards
before contact) only goes back to 2018, which is the practical floor for
our exact grading formula.

Usage:
    venv/bin/python backfill_season.py 2024 2023 2022 2021 2020 2019 2018
"""

import sys

from compute_grades import compute_grades
from steps.pull_ol_depth_chart import pull_season_ol_depth_chart
from steps.pull_ol_draft_picks import pull_ol_draft_picks
from steps.pull_team_ol_stats import pull_team_ol_stats_raw
from write_to_supabase import (
    fetch_espn_team_rates,
    get_client,
    replace_ol_depth_chart,
    replace_ol_draft_picks,
    upsert_team_ol_stats,
)

TEAM_OL_STATS_COLUMNS = [
    "team_abbr", "season", "week", "games_played", "dropbacks",
    "sacks_allowed", "pressures_allowed", "pressure_rate_allowed",
    "stuff_rate", "yards_before_contact_per_att",
    "pass_block_score", "pass_block_grade",
    "run_block_score", "run_block_grade",
    "overall_score", "overall_grade", "grade_formula_version",
]


def backfill(client, season: int) -> None:
    print(f"[{season}] pulling raw team O-line stats (scans full play-by-play, takes a bit)...")
    raw_stats = pull_team_ol_stats_raw(season)

    print(f"[{season}] reading ESPN win rates (empty until entered via /internal/espn-entry)...")
    espn_rates = fetch_espn_team_rates(client, season)

    print(f"[{season}] computing grades...")
    graded = compute_grades(raw_stats, espn_rates)
    graded["season"] = season
    to_write = graded[TEAM_OL_STATS_COLUMNS]

    print(f"[{season}] writing {len(to_write)} team/week rows to team_ol_stats...")
    upsert_team_ol_stats(client, to_write)

    print(f"[{season}] pulling O-line depth chart (snap counts by position)...")
    depth_chart = pull_season_ol_depth_chart(season)
    print(f"[{season}] writing {len(depth_chart)} depth chart rows...")
    replace_ol_depth_chart(client, season, depth_chart.to_dict(orient="records"))

    print(f"[{season}] pulling O-line draft picks...")
    draft_picks = pull_ol_draft_picks(season)
    print(f"[{season}] writing {len(draft_picks)} draft pick rows...")
    replace_ol_draft_picks(client, season, draft_picks.to_dict(orient="records"))


if __name__ == "__main__":
    seasons = [int(a) for a in sys.argv[1:]]
    if not seasons:
        raise SystemExit("Usage: backfill_season.py <season> [season...]")

    client = get_client()
    for s in seasons:
        backfill(client, s)
    print("Done.")
