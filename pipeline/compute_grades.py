"""Turns raw O-line stats into the three letter grades shown on each team
page: Pass Block, Run Block, and Overall. This file has NO network calls --
it's a pure function of the DataFrames you pass it, which is what makes it
easy to unit-test (see tests/test_compute_grades.py) and safe to reason
about without touching a real database.

--- How the grading works (v1) ---

Every raw stat gets converted into a 0-100 "component score" by comparing
each team against every OTHER team that same week, using min-max scaling:
the best team in the league that week scores 100 on that stat, the worst
scores 0, and everyone else falls in between. This is a CURVED/RELATIVE
grade, not an absolute one -- a team's grade can shift slightly week to
week even if its own raw numbers don't change, because the league-wide
best/worst can move. That's a known, intentional tradeoff for v1 (see the
project plan's shortcuts list).

Pass Block score = average of whichever of these are available:
  - sack rate (sacks allowed / dropback)       -- lower is better
  - pressure rate allowed                       -- lower is better
  - ESPN Pass Block Win Rate (manually entered)  -- higher is better

Run Block score = average of whichever of these are available:
  - stuff rate (rush attempts stopped at/behind the line) -- lower is better
  - yards before contact per attempt                       -- higher is better
  - ESPN Run Block Win Rate (manually entered)              -- higher is better

If ESPN's number hasn't been entered yet for a team/season, that component
is just left out of the average -- the score still appears (from the two
automated components), and improves in accuracy once ESPN data is added.

Overall score = average of Pass Block score and Run Block score.

All three scores map to letters using the same academic-style scale.
Bump GRADE_FORMULA_VERSION any time the weights or bands below change, so
old and new grades in the database are distinguishable.

KEEP THIS IN SYNC WITH web/lib/computeGrades.ts -- that's a TypeScript
port of this exact formula, used by the "Recompute grades now" button so
grades can refresh without waiting for a full pipeline run. If you change
the weights, bands, or components here, mirror the change there too.
"""

import pandas as pd

GRADE_FORMULA_VERSION = "v1"

# 13 EQUAL-WIDTH bands spanning the full 0-100 range (100/13 ~= 7.7 points
# each), not the traditional school scale where "passing" starts at 60 and
# F covers 0-59. That traditional scale assumes an absolute score (e.g. "%
# of questions right"); ours is a CURVED score built by averaging several
# min-max-normalized stats, which mathematically clusters most teams near
# 50 regardless of how good they actually are (averaging reduces spread).
# Mapped onto the traditional scale, that clustering would wrongly dump
# most of the league into "F". Equal-width bands centered on 50 = C instead
# give a spread of grades that actually looks like a report card.
GRADE_BANDS = [
    (92.3, "A+"), (84.6, "A"), (76.9, "A-"),
    (69.2, "B+"), (61.5, "B"), (53.8, "B-"),
    (46.2, "C+"), (38.5, "C"), (30.8, "C-"),
    (23.1, "D+"), (15.4, "D"), (7.7, "D-"),
    (0, "F"),
]


def score_to_letter(score: float | None) -> str | None:
    if score is None or pd.isna(score):
        return None
    for threshold, letter in GRADE_BANDS:
        if score >= threshold:
            return letter
    return "F"


def _normalize(series: pd.Series, higher_is_better: bool) -> pd.Series:
    """Min-max scale a column to 0-100 within whatever rows are passed in
    (the caller is responsible for passing in only one week's rows, i.e.
    one "league" to compare against)."""
    lo, hi = series.min(), series.max()
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        # Every team tied (or only one team present) -- nothing to compare,
        # so give everyone a neutral middle score rather than dividing by 0.
        return pd.Series(50.0, index=series.index)
    scaled = (series - lo) / (hi - lo) * 100
    return scaled if higher_is_better else 100 - scaled


def _row_average(components: list[pd.Series]) -> pd.Series:
    """Average whichever components are non-null for each row, ignoring the
    rest -- this is how a missing ESPN figure just drops out of the blend
    instead of breaking the whole score."""
    stacked = pd.concat(components, axis=1)
    return stacked.mean(axis=1, skipna=True)


def compute_grades(team_week_stats: pd.DataFrame, espn_team_rates: pd.DataFrame) -> pd.DataFrame:
    """
    team_week_stats: one row per team per week, for a single season, with
        columns team_abbr, week, dropbacks, sacks_allowed,
        pressure_rate_allowed, stuff_rate, yards_before_contact_per_att.
    espn_team_rates: one row per team for that season (some teams may be
        missing if not entered yet), columns team_abbr,
        pass_block_win_rate, run_block_win_rate.

    Returns team_week_stats with the grade columns added.
    """
    df = team_week_stats.merge(espn_team_rates, on="team_abbr", how="left")

    sack_rate = df["sacks_allowed"] / df["dropbacks"].replace(0, pd.NA)

    results = []
    for week, week_df in df.groupby("week"):
        idx = week_df.index
        week_sack_rate = sack_rate.loc[idx]

        pass_components = [
            _normalize(week_sack_rate, higher_is_better=False),
            _normalize(week_df["pressure_rate_allowed"], higher_is_better=False),
            _normalize(week_df["pass_block_win_rate"], higher_is_better=True),
        ]
        run_components = [
            _normalize(week_df["stuff_rate"], higher_is_better=False),
            _normalize(week_df["yards_before_contact_per_att"], higher_is_better=True),
            _normalize(week_df["run_block_win_rate"], higher_is_better=True),
        ]

        # Components built from an all-null column (e.g. nobody has entered
        # ESPN data yet) score every team 50 by _normalize's tie-break rule,
        # which would silently pull every grade toward the middle. Mask
        # those back out to NaN so _row_average correctly ignores them.
        for col_name, components in (
            ("pass_block_win_rate", pass_components),
            ("run_block_win_rate", run_components),
        ):
            if week_df[col_name].isna().all():
                components[-1] = pd.Series(pd.NA, index=idx)

        week_df = week_df.copy()
        week_df["pass_block_score"] = _row_average(pass_components)
        week_df["run_block_score"] = _row_average(run_components)
        week_df["overall_score"] = week_df[["pass_block_score", "run_block_score"]].mean(axis=1)
        results.append(week_df)

    out = pd.concat(results).sort_index()
    out["pass_block_grade"] = out["pass_block_score"].apply(score_to_letter)
    out["run_block_grade"] = out["run_block_score"].apply(score_to_letter)
    out["overall_grade"] = out["overall_score"].apply(score_to_letter)
    out["grade_formula_version"] = GRADE_FORMULA_VERSION

    return out
