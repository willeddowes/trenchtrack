"""Backfills player_injury_reports (full weekly injury-report history) for
past seasons -- a one-off, run once to populate history back to 2013 (this
project's existing depth-chart/snap-history floor, see
backfill_depth_chart_only.py). Ongoing current-season updates happen
automatically via pull_and_compute.py, so this script doesn't need to be
re-run except to extend the floor further back.

nflreadpy.load_injuries() accepts a season list in one call (confirmed:
pulling 2013-2025 together takes ~3.5s), so this pulls everything in a
single request rather than looping per season.

Usage:
    venv/bin/python backfill_injury_history.py 2013 2014 ... 2025
"""

import sys

from steps.pull_injury_history import pull_injury_history
from write_to_supabase import get_client, upsert_player_injury_reports

if __name__ == "__main__":
    seasons = [int(a) for a in sys.argv[1:]]
    if not seasons:
        raise SystemExit("Usage: backfill_injury_history.py <season> [season...]")

    client = get_client()
    print(f"Pulling injury history for {seasons}...")
    rows = pull_injury_history(seasons)
    print(f"Writing {len(rows)} injury report rows...")
    upsert_player_injury_reports(client, rows)
    print("Done.")
