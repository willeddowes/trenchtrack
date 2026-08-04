"""The one command you run to refresh TrenchTrack's data:

    venv/bin/python pull_and_compute.py

What it does, in order:
  1. Pulls the current roster and injury report from nflreadpy and writes
     them straight to Supabase (simple "current snapshot" overwrites --
     see write_to_supabase.py). Also upserts this season's weeks into
     player_injury_reports (full history, not a snapshot -- see that
     table's comment in schema.sql).
  2. Pulls the season's O-line depth chart -- every player who's logged
     snaps at each position so far this season, ranked by snap count.
  3. Pulls the season's raw O-line stats (sacks, pressure, stuff rate,
     yards before contact), one row per team per week.
  4. Reads back whatever ESPN win-rate numbers you've entered so far via
     the /internal/espn-entry page.
  5. Runs compute_grades.py to turn (3) + (4) into the three letter grades,
     for every team, for every week of the season so far.
  6. Writes all of that to team_ol_stats.

Safe to re-run any time (weekly during the season is the plan) -- every
write is either an upsert or a clean delete-and-replace, so running this
twice in a row just refreshes the same data rather than duplicating it.
"""

import nflreadpy as nfl

from compute_grades import compute_grades
from steps.pull_combine import pull_combine
from steps.pull_injuries import pull_injuries
from steps.pull_injury_history import pull_injury_history
from steps.pull_ol_depth_chart import pull_season_ol_depth_chart
from steps.pull_ol_draft_picks import pull_ol_draft_picks
from steps.pull_players import pull_players
from steps.pull_team_ol_stats import pull_team_ol_stats_raw
from write_to_supabase import (
    fetch_espn_team_rates,
    get_client,
    replace_injuries,
    replace_ol_depth_chart,
    replace_ol_draft_picks,
    upsert_player_combine,
    upsert_player_injury_reports,
    upsert_players,
    upsert_team_ol_stats,
)


def main() -> None:
    season = nfl.get_current_season()
    current_week = nfl.get_current_week()
    print(f"Running pipeline for season {season}, current week {current_week}...")

    client = get_client()

    print("Pulling players...")
    upsert_players(client, pull_players(season))

    print("Pulling O-line depth chart (snap counts by position)...")
    depth_chart = pull_season_ol_depth_chart(season)
    replace_ol_depth_chart(client, season, depth_chart.to_dict(orient="records"))

    print("Matching combine data (nflreadpy's load_combine(), name+draft-year matched)...")
    upsert_player_combine(client, pull_combine(client))

    print("Pulling this season's O-line draft picks...")
    draft_picks = pull_ol_draft_picks(season)
    replace_ol_draft_picks(client, season, draft_picks.to_dict(orient="records"))

    print("Pulling injuries...")
    replace_injuries(client, season, pull_injuries(season))

    print("Pulling this season's injury report history (upserts new weeks as the season progresses)...")
    upsert_player_injury_reports(client, pull_injury_history([season]))

    print("Pulling raw team O-line stats (this one takes a bit, it scans full play-by-play)...")
    raw_stats = pull_team_ol_stats_raw(season)

    print("Reading manually-entered ESPN win rates...")
    espn_rates = fetch_espn_team_rates(client, season)

    print("Computing grades...")
    graded = compute_grades(raw_stats, espn_rates)
    graded["season"] = season

    # compute_grades() merges in the ESPN columns to do its math, but those
    # live in their own table (espn_team_block_win_rates) -- only send the
    # columns team_ol_stats actually has.
    team_ol_stats_columns = [
        "team_abbr", "season", "week", "games_played", "dropbacks",
        "sacks_allowed", "pressures_allowed", "pressure_rate_allowed",
        "stuff_rate", "yards_before_contact_per_att",
        "pass_block_score", "pass_block_grade",
        "run_block_score", "run_block_grade",
        "overall_score", "overall_grade", "grade_formula_version",
    ]
    to_write = graded[team_ol_stats_columns]

    print(f"Writing {len(to_write)} team/week rows to team_ol_stats...")
    upsert_team_ol_stats(client, to_write)

    print("Done.")


if __name__ == "__main__":
    main()
