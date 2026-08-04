"""Backfills ONLY ol_depth_chart (snap counts by position) for past seasons,
skipping team_ol_stats/ol_draft_picks -- unlike backfill_season.py's full
backfill, this doesn't need PFR's advanced-stats source (pressure counts,
etc.), which only goes back to 2018 and is what caps team grading. Snap
counts (PFR, via load_snap_counts) claims to go back to 2012 and ESPN depth
charts (load_depth_charts) go back to 2001, so pull_season_ol_depth_chart's
real floor should be 2012 -- except load_snap_counts(seasons=2012) actually
returns 0 rows despite the docstring, so 2013 is the true practical floor.

Use this to extend player pages' career snap history further back than the
grading formula can reach.

Usage:
    venv/bin/python backfill_depth_chart_only.py 2020 2019 2018 ... 2013
"""

import sys

from steps.pull_ol_depth_chart import pull_season_ol_depth_chart
from write_to_supabase import get_client, replace_ol_depth_chart

if __name__ == "__main__":
    seasons = [int(a) for a in sys.argv[1:]]
    if not seasons:
        raise SystemExit("Usage: backfill_depth_chart_only.py <season> [season...]")

    client = get_client()
    for season in seasons:
        print(f"[{season}] pulling O-line depth chart (snap counts by position)...")
        depth_chart = pull_season_ol_depth_chart(season)
        print(f"[{season}] writing {len(depth_chart)} depth chart rows...")
        replace_ol_depth_chart(client, season, depth_chart.to_dict(orient="records"))
    print("Done.")
