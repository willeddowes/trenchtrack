"""Fixture-based tests for compute_grades.py -- no network calls, no real
database. Run with: venv/bin/pytest tests/ (from the pipeline/ directory)."""

import pandas as pd
import pytest

from compute_grades import _weighted_average, compute_grades, score_to_letter


def make_stats(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def empty_schedule_strength() -> pd.DataFrame:
    return pd.DataFrame({"team_abbr": [], "pass_sos_score": [], "run_sos_score": []})


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

    result = compute_grades(stats, espn, empty_schedule_strength()).set_index("team_abbr")

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

    result = compute_grades(stats, espn, empty_schedule_strength()).set_index("team_abbr")

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

    result = compute_grades(stats, espn, empty_schedule_strength()).set_index("team_abbr")

    assert result.loc["GOOD", "overall_score"] > result.loc["BAD", "overall_score"]


def test_weighted_average_applies_given_weights():
    # Unit-tested directly (not through compute_grades) because
    # compute_grades' final "stretch" step (see below) re-normalizes the
    # blended score to span 0-100 across teams, which would obscure the
    # exact pre-stretch weighting math this test wants to pin down.
    a = pd.Series([100.0, 0.0])
    b = pd.Series([0.0, 100.0])
    result = _weighted_average([(a, 1), (b, 3)])
    assert result.iloc[0] == pytest.approx(25.0)  # (100*1 + 0*3) / 4
    assert result.iloc[1] == pytest.approx(75.0)  # (0*1 + 100*3) / 4


def test_weighted_average_renormalizes_around_missing_values():
    a = pd.Series([100.0, None])
    b = pd.Series([0.0, 50.0])
    result = _weighted_average([(a, 1), (b, 3)])
    assert result.iloc[0] == pytest.approx(25.0)  # both present: (100*1 + 0*3) / 4
    assert result.iloc[1] == pytest.approx(50.0)  # a missing: weight 1 drops out, just b's 50


def test_best_and_worst_team_always_hit_true_extremes():
    # Four teams, none of which sweeps every metric (unlike
    # test_best_team_beats_worst_team's GOOD/BAD, which are extreme cases
    # that would score 100/0 even without the stretch step). This is the
    # realistic case: averaging several components alone would leave
    # everyone stuck in the middle bands with no A+ or F -- the final
    # min-max stretch in compute_grades is what fixes that.
    stats = make_stats(
        [
            {"team_abbr": "A", "week": 1, "dropbacks": 100, "sacks_allowed": 2,
             "pressure_rate_allowed": 0.30, "stuff_rate": 0.10, "yards_before_contact_per_att": 3.0},
            {"team_abbr": "B", "week": 1, "dropbacks": 100, "sacks_allowed": 5,
             "pressure_rate_allowed": 0.15, "stuff_rate": 0.20, "yards_before_contact_per_att": 2.5},
            {"team_abbr": "C", "week": 1, "dropbacks": 100, "sacks_allowed": 7,
             "pressure_rate_allowed": 0.25, "stuff_rate": 0.12, "yards_before_contact_per_att": 2.0},
            {"team_abbr": "D", "week": 1, "dropbacks": 100, "sacks_allowed": 9,
             "pressure_rate_allowed": 0.35, "stuff_rate": 0.30, "yards_before_contact_per_att": 1.0},
        ]
    )
    espn = make_stats([])
    espn["team_abbr"] = []
    espn["pass_block_win_rate"] = []
    espn["run_block_win_rate"] = []

    result = compute_grades(stats, espn, empty_schedule_strength())

    assert result["overall_score"].max() == pytest.approx(100.0)
    assert result["overall_score"].min() == pytest.approx(0.0)
    assert (result["overall_grade"] == "A+").any()
    assert (result["overall_grade"] == "F").any()


def test_missing_schedule_strength_does_not_crash_or_skew_other_teams():
    # Mirrors test_missing_espn_data_does_not_crash_or_skew_other_teams --
    # a team with no schedule_strength row yet (e.g. season just started)
    # should still grade from its other components, not error out.
    stats = make_stats(
        [
            {"team_abbr": "GOOD", "week": 1, "dropbacks": 100, "sacks_allowed": 2,
             "pressure_rate_allowed": 0.10, "stuff_rate": 0.08, "yards_before_contact_per_att": 3.5},
            {"team_abbr": "BAD_NO_SOS", "week": 1, "dropbacks": 100, "sacks_allowed": 10,
             "pressure_rate_allowed": 0.35, "stuff_rate": 0.25, "yards_before_contact_per_att": 1.0},
        ]
    )
    espn = make_stats([])
    espn["team_abbr"] = []
    espn["pass_block_win_rate"] = []
    espn["run_block_win_rate"] = []
    sos = make_stats([{"team_abbr": "GOOD", "pass_sos_score": 80, "run_sos_score": 80}])

    result = compute_grades(stats, espn, sos).set_index("team_abbr")

    assert pd.notna(result.loc["BAD_NO_SOS", "overall_score"])
    assert result.loc["GOOD", "overall_score"] > result.loc["BAD_NO_SOS", "overall_score"]


def test_tougher_schedule_scores_higher_all_else_equal():
    # Two teams with IDENTICAL raw stats -- only their Strength of Schedule
    # differs. The team that faced the tougher schedule should come out
    # ahead on both Pass and Run Block.
    stats = make_stats(
        [
            {"team_abbr": "TOUGH_SKED", "week": 1, "dropbacks": 100, "sacks_allowed": 5,
             "pressure_rate_allowed": 0.20, "stuff_rate": 0.15, "yards_before_contact_per_att": 2.5},
            {"team_abbr": "EASY_SKED", "week": 1, "dropbacks": 100, "sacks_allowed": 5,
             "pressure_rate_allowed": 0.20, "stuff_rate": 0.15, "yards_before_contact_per_att": 2.5},
        ]
    )
    espn = make_stats([])
    espn["team_abbr"] = []
    espn["pass_block_win_rate"] = []
    espn["run_block_win_rate"] = []
    sos = make_stats(
        [
            {"team_abbr": "TOUGH_SKED", "pass_sos_score": 100, "run_sos_score": 100},
            {"team_abbr": "EASY_SKED", "pass_sos_score": 0, "run_sos_score": 0},
        ]
    )

    result = compute_grades(stats, espn, sos).set_index("team_abbr")

    assert result.loc["TOUGH_SKED", "pass_block_score"] > result.loc["EASY_SKED", "pass_block_score"]
    assert result.loc["TOUGH_SKED", "run_block_score"] > result.loc["EASY_SKED", "run_block_score"]


def test_score_to_letter_bands():
    assert score_to_letter(100) == "A+"
    assert score_to_letter(92.3) == "A+"
    assert score_to_letter(92.2) == "A"
    assert score_to_letter(50) == "C+"  # a perfectly average team should land near the middle band
    assert score_to_letter(7.7) == "D-"
    assert score_to_letter(7.6) == "F"
    assert score_to_letter(0) == "F"
    assert score_to_letter(None) is None
