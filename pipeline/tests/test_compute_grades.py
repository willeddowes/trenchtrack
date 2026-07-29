"""Fixture-based tests for compute_grades.py -- no network calls, no real
database. Run with: venv/bin/pytest tests/ (from the pipeline/ directory)."""

import pandas as pd

from compute_grades import compute_grades, score_to_letter


def make_stats(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_best_team_beats_worst_team():
    # Three imaginary teams, one week. GOOD has the best numbers in every
    # category, BAD has the worst, MID sits in between.
    stats = make_stats(
        [
            {"team_abbr": "GOOD", "week": 5, "dropbacks": 100, "sacks_allowed": 2,
             "pressure_rate_allowed": 0.10, "stuff_rate": 0.08, "yards_before_contact_per_att": 3.5},
            {"team_abbr": "MID", "week": 5, "dropbacks": 100, "sacks_allowed": 5,
             "pressure_rate_allowed": 0.20, "stuff_rate": 0.15, "yards_before_contact_per_att": 2.5},
            {"team_abbr": "BAD", "week": 5, "dropbacks": 100, "sacks_allowed": 10,
             "pressure_rate_allowed": 0.35, "stuff_rate": 0.25, "yards_before_contact_per_att": 1.0},
        ]
    )
    espn = make_stats(
        [
            {"team_abbr": "GOOD", "pass_block_win_rate": 70, "run_block_win_rate": 80},
            {"team_abbr": "MID", "pass_block_win_rate": 60, "run_block_win_rate": 60},
            {"team_abbr": "BAD", "pass_block_win_rate": 50, "run_block_win_rate": 40},
        ]
    )

    result = compute_grades(stats, espn).set_index("team_abbr")

    assert result.loc["GOOD", "overall_score"] > result.loc["MID", "overall_score"]
    assert result.loc["MID", "overall_score"] > result.loc["BAD", "overall_score"]
    assert result.loc["GOOD", "overall_grade"] == "A+"
    assert result.loc["BAD", "overall_grade"] == "F"


def test_missing_espn_data_does_not_crash_or_skew_other_teams():
    # BAD_NO_ESPN has the worst raw stats but no ESPN entry yet. It should
    # still get a (lower) score from the automated stats alone, not an error.
    stats = make_stats(
        [
            {"team_abbr": "GOOD", "week": 1, "dropbacks": 100, "sacks_allowed": 2,
             "pressure_rate_allowed": 0.10, "stuff_rate": 0.08, "yards_before_contact_per_att": 3.5},
            {"team_abbr": "BAD_NO_ESPN", "week": 1, "dropbacks": 100, "sacks_allowed": 10,
             "pressure_rate_allowed": 0.35, "stuff_rate": 0.25, "yards_before_contact_per_att": 1.0},
        ]
    )
    espn = make_stats([{"team_abbr": "GOOD", "pass_block_win_rate": 70, "run_block_win_rate": 80}])

    result = compute_grades(stats, espn).set_index("team_abbr")

    assert pd.notna(result.loc["BAD_NO_ESPN", "overall_score"])
    assert result.loc["GOOD", "overall_score"] > result.loc["BAD_NO_ESPN", "overall_score"]


def test_no_espn_data_at_all_still_grades_from_automated_stats():
    stats = make_stats(
        [
            {"team_abbr": "GOOD", "week": 1, "dropbacks": 100, "sacks_allowed": 2,
             "pressure_rate_allowed": 0.10, "stuff_rate": 0.08, "yards_before_contact_per_att": 3.5},
            {"team_abbr": "BAD", "week": 1, "dropbacks": 100, "sacks_allowed": 10,
             "pressure_rate_allowed": 0.35, "stuff_rate": 0.25, "yards_before_contact_per_att": 1.0},
        ]
    )
    espn = make_stats([])
    espn["team_abbr"] = []
    espn["pass_block_win_rate"] = []
    espn["run_block_win_rate"] = []

    result = compute_grades(stats, espn).set_index("team_abbr")

    assert result.loc["GOOD", "overall_score"] > result.loc["BAD", "overall_score"]


def test_score_to_letter_bands():
    assert score_to_letter(100) == "A+"
    assert score_to_letter(92.3) == "A+"
    assert score_to_letter(92.2) == "A"
    assert score_to_letter(50) == "C+"  # a perfectly average team should land near the middle band
    assert score_to_letter(7.7) == "D-"
    assert score_to_letter(7.6) == "F"
    assert score_to_letter(0) == "F"
    assert score_to_letter(None) is None
