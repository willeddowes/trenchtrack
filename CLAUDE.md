# TrenchTrack

Free public dashboard of NFL offensive-line stats and letter grades, one page per team. Phase 1 (32 team pages, no accounts/payments) is **built and live**. User is a coding beginner — briefly explain non-obvious decisions, don't over-comment code.

**Live:** https://trenchtrack.vercel.app · **Repo:** github.com/willeddowes/trenchtrack

## Stack & structure
```
web/        Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, deployed on Vercel
pipeline/   Python (nflreadpy) — pulls nflverse data, computes grades, writes to Supabase
supabase/   schema.sql + seed_teams.sql (hand-run in Supabase SQL Editor, no CLI set up)
```

## Commands
- Dev server: `npm run dev --prefix web` (or the `trenchtrack-web` launch.json config)
- Build check: `npm run build --prefix web`
- Pipeline (from `pipeline/`): `venv/bin/python pull_and_compute.py` — pulls fresh data + recomputes all grades
- Pipeline tests: `venv/bin/pytest tests/` (from `pipeline/`)
- Recompute grades only (no data re-pull): `/internal/espn-entry` page button, or `POST /api/recompute-grades`

## Important gotchas (cost real time to (re)discover — don't re-derive)
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`.** This project already uses `proxy.ts`. This Next version has other real breaking changes vs typical training data — check `web/node_modules/next/dist/docs/` before assuming an API/convention.
- **`pipeline/venv` needs Python 3.10+** (`nflreadpy` requires it); system Python here is 3.9. Built via `uv venv --python 3.12 venv`. `uv`-created venvs have **no `pip`** — use `uv pip install X --python venv/bin/python`, not `pip install`.
- **This shell's Bash tool doesn't reliably pick up `.zshenv`/`.zshrc` PATH changes** between calls. Node/npm, `uv`, and `gh` are symlinked into `~/opt/anaconda3/bin` (already on PATH every call) rather than relying on nvm's own PATH injection.
- **Supabase "Automatically expose new tables" being off** (recommended setting) skips default grants for `service_role`, not just `anon`/`authenticated` — `schema.sql` has explicit `grant ... to service_role` statements because of this.
- **HTTP Basic Auth + client-side `fetch()` don't mix well** (the browser can hang on an invisible re-auth prompt) — `/internal/*` uses a cookie-based login (`proxy.ts` + `app/internal/login/`) instead, not Basic Auth.
- **A native `<datalist>` with ~550 options (the old player-ESPN-search) visibly lags the page.** Any large (~500+) dropdown should be a custom-filtered autocomplete (see the pattern that replaced it) rendering only a handful of matches at a time. (Player-level ESPN entry was later removed entirely — ESPN doesn't publish that publicly.)
- **Grading formula is duplicated in two languages on purpose**: `pipeline/compute_grades.py` (Python, source of truth, run by the full pipeline) and `web/lib/computeGrades.ts` (TS port, used only by the recompute-grades button). Both have "keep in sync" comments pointing at each other — change one, change both, and re-verify they produce bit-for-bit identical output on real data.

## Design system ("Turf")
CSS custom properties in `web/app/globals.css`, registered as Tailwind v4 theme tokens (no `tailwind.config.js`): stone/chalk background, deep turf-green accent (`--accent`), a 5-step "turf to rust" grade-letter color ramp (`--grade-a`...`--grade-f`), plus one-off NFC blue / AFC red tokens (`--nfc-accent`/`--afc-accent`) used only on the homepage's conference split. Single fixed light theme — dark mode deliberately dropped for now.

## Grading (`pipeline/compute_grades.py` — read its docstring for the full writeup)
Three grades per team per week: Pass Block, Run Block, Overall. Every raw stat is min-max normalized against that week's 32 teams (curved/relative, not absolute), then blended:
- **Pass Block**: sack rate 20% / pressure rate allowed 40% / ESPN Pass Block Win Rate 40% (weighted on purpose — pressure rate is a more stable O-line signal than raw sacks, which are partly a QB/scheme stat)
- **Run Block**: stuff rate / yards before contact per att / ESPN Run Block Win Rate — equal thirds (unweighted so far)
- Missing ESPN data doesn't break the score — its weight drops out and the rest renormalize.
- Each of the three blended scores then gets a **second min-max stretch** across that week's 32 teams before mapping to a letter — without this, averaging several already-normalized components compresses everyone toward the middle and nobody ever hits a true 0 or 100 (A+/F sit empty). The stretch guarantees the week's actual best team hits exactly 100 and the actual worst hits exactly 0.
- Scores map to letters on **equal-width** 13-band scale (not the traditional 60%-is-passing school scale — that would wrongly dump most teams into "F" for a curved score; see docstring).
- `grade_formula_version` column tracks formula changes (currently `"v3"`).

## Data model notes
- `team_ol_stats` stores **weekly history** (one row per team/week, never overwritten) — enables a future "grade over the season" chart.
- `ol_starters` / `injuries` store only the **current** snapshot (not history) — this is why past-season team pages hide those sections entirely rather than mislabeling today's roster as historical.
- `teams` (32 rows) is seeded once by hand (`seed_teams.sql`), not auto-synced by the pipeline.
- Season is in the URL (`/team/[slug]/[season]`) since historical ESPN data entry was an explicit requirement; `CURRENT_SEASON`/`SUPPORTED_SEASONS` are hardcoded in `web/lib/teamsStatic.ts` (bump + redeploy each new season).

## Known MVP shortcuts (intentional, revisit later)
No auth beyond one shared password on `/internal/*` · pipeline runs manually, no cron yet · no CI on the Python side · donation link removed for now, pending a real Ko-fi/BMC URL.

Note: `/api/espn-entry` and `/api/recompute-grades` both call `revalidatePath("/", "layout")` on success, so ESPN entries and grade recomputes show up on next page visit rather than waiting for the daily ISR window. The Python pipeline itself does **not** call this (it has no way to reach a Next.js route) — after a full `pull_and_compute.py` run, either wait for the daily revalidation or hit `/api/recompute-grades` once to force an immediate refresh.

## Where to look for more detail
This file is intentionally short. For file-by-file specifics, just read the code — `web/lib/getTeamPageData.ts`, `web/lib/getHomepageData.ts`, and `pipeline/pull_and_compute.py` are the best entry points into how data flows end to end.
