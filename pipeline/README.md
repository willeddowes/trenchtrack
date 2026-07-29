# TrenchTrack data pipeline

Pulls NFL offensive line data from [nflverse](https://github.com/nflverse) (via
the `nflreadpy` Python package), computes the OL Report Card grades, and
writes everything to Supabase. The Next.js app only ever reads from
Supabase -- it never talks to nflreadpy directly.

## Setup (one-time)

```bash
cd pipeline
uv venv --python 3.12 venv       # nflreadpy needs Python 3.10+
uv pip install -r requirements.txt --python venv/bin/python
cp .env.example .env             # then fill in your Supabase URL + service_role key
```

## Running it

```bash
venv/bin/python pull_and_compute.py
```

Takes a minute or two (it scans a full season of play-by-play data to
compute stuff rate). Safe to re-run any time -- nothing gets duplicated.

Run the tests with `venv/bin/pytest tests/`.

## What "current" means for each table

- **players / ol_starters / injuries**: always overwritten with the latest
  snapshot on every run -- these answer "who/what right now", not history.
- **team_ol_stats**: the opposite -- every week gets its own row, kept
  forever, so a future "grade over the season" chart has real data to draw
  from. Each week's numbers are cumulative through that point in the season
  (season_type == 'REG' only; playoffs are excluded so playoff teams don't
  get extra games stacked onto their stats).

## Where each stat comes from

| Stat | Source | Notes |
|---|---|---|
| Sacks allowed, dropbacks | `load_team_stats()` | `sacks_suffered` + `attempts`, summed per team/week |
| Pressure rate allowed | `load_pfr_advstats(stat_type='pass')` | Pro Football Reference's `times_pressured`, divided by dropbacks |
| Stuff rate | `load_pbp()` | Share of rush attempts with `rushing_yards <= 0` -- no dataset publishes this directly, so it's computed from individual plays |
| Yards before contact / attempt | `load_pfr_advstats(stat_type='rush')` | PFR's `rushing_yards_before_contact`, summed per team/week |
| Pass/Run Block Win Rate | Manually entered | ESPN doesn't publish this in any free feed -- entered by hand via `/internal/espn-entry` |

"Pressure" specifically means PFR's own charting judgment of a pressured
dropback, which may not exactly match how ESPN or PFF define pressure --
worth a plain-language note on the site if precision here ever matters.

## Grading

See `compute_grades.py` for the full writeup. Short version: every stat is
scaled 0-100 by comparing all 32 teams that week (best = 100, worst = 0),
then averaged into a Pass Block score, a Run Block score, and an Overall
score, each mapped to a letter grade. Missing ESPN data just drops out of
the average rather than breaking anything.

## Known gap: grades lag manual ESPN entry

`compute_grades.py` reads whatever's in the ESPN tables *at the moment the
pipeline runs*. If you update ESPN numbers through the entry form later,
existing grades won't reflect it until you run the pipeline again.

## Automating this (not done yet)

For now this is a script you run by hand. The natural next step is a
GitHub Action on a weekly cron (Wednesdays, after Monday Night Football),
using a repo secret for the service_role key, with a final step that hits
a Vercel on-demand revalidation endpoint so the site updates immediately
instead of waiting for the daily ISR timer.
