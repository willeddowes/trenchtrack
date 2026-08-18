-- TrenchTrack database schema.
--
-- How to run this: open your Supabase project -> SQL Editor -> paste this whole
-- file -> Run. It's safe to re-run: every statement uses "if not exists" or
-- "create or replace" so running it twice won't error or duplicate anything.
--
-- Big picture: this site is read-only for visitors. The `anon` key (used by
-- the Next.js frontend) can only SELECT from these tables. All writes -- both
-- the Python pipeline and the manual ESPN-entry form -- happen through the
-- `service_role` key, which Supabase always lets bypass Row Level Security
-- (RLS). That's why you'll only see SELECT policies below, never INSERT ones.

-- ============================================================================
-- teams: the 32 NFL teams. Seeded once from supabase/seed_teams.sql and then
-- hand-maintained (a team rebranding/relocating is rare enough that it's not
-- worth auto-syncing this table on every pipeline run).
-- ============================================================================
create table if not exists teams (
  team_abbr text primary key,        -- nflverse's team code, e.g. 'KC'
  team_name text not null,           -- 'Kansas City Chiefs'
  team_nickname text not null,       -- 'Chiefs'
  slug text not null unique,         -- 'chiefs' -- used in the page URL /team/chiefs/2025
  conference text not null,          -- 'AFC' or 'NFC'
  division text not null,            -- 'AFC West', etc.
  logo_url text,
  primary_color text,                -- hex color, e.g. '#E31837'
  secondary_color text
);

-- ============================================================================
-- players: every player currently on a roster. Refreshed by the pipeline
-- from nflreadpy's roster data every run (team_abbr always reflects whoever
-- they're CURRENTLY on -- see the "no trade history" shortcut in the plan).
-- ============================================================================
create table if not exists players (
  player_id text primary key,        -- nflverse gsis_id
  full_name text not null,
  position text,
  team_abbr text references teams (team_abbr),
  headshot_url text,
  height int,                        -- total inches (nflreadpy's raw unit) -- format as feet'inches" for display
  weight int,
  college text,
  draft_year int,
  draft_round int,
  draft_pick int,                    -- overall pick number
  draft_team text,                   -- team_abbr of the team that drafted them (may differ from team_abbr above)
  rookie_season int,                 -- first NFL season -- nflreadpy's load_players() has this (rookie_season)
                                      -- for undrafted players too, unlike draft_year (null for them); lets the
                                      -- player page show "20XX · Undrafted" instead of hiding the Draft field entirely
  birth_date date,                   -- age is computed from this at render time (web/lib), not stored, so it's
                                      -- always current without needing a daily pipeline run
  updated_at timestamptz not null default now()
);

-- Bio/draft columns above were added after the table's initial creation --
-- these keep re-running this file safe against an already-deployed DB
-- (the create table above is a no-op there since the table already exists).
alter table players add column if not exists height int;
alter table players add column if not exists weight int;
alter table players add column if not exists college text;
alter table players add column if not exists draft_year int;
alter table players add column if not exists draft_round int;
alter table players add column if not exists draft_pick int;
alter table players add column if not exists draft_team text;
alter table players add column if not exists rookie_season int;
alter table players add column if not exists birth_date date;

-- ============================================================================
-- ol_depth_chart: per team, per season, per position -- every player who
-- logged offense snaps at that position that season, ranked by total snaps
-- (depth_rank 1 = most snaps, 2 = next-most, etc). Unlike a live depth chart
-- snapshot, this is real season history: it answers "who actually played
-- the most at RT in 2023", not just "who's listed as the starter today".
-- The pipeline replaces a season's full set of rows each time it's computed
-- (see replace_ol_depth_chart), since the ranked list can legitimately
-- change shape (a new backup logging snaps, etc) between runs.
-- ============================================================================
create table if not exists ol_depth_chart (
  team_abbr text not null references teams (team_abbr),
  season int not null,
  position text not null check (position in ('LT', 'LG', 'C', 'RG', 'RT')),
  depth_rank int not null,
  player_id text,                    -- no FK to players -- that table only
                                      -- holds the CURRENT roster, but this
                                      -- table spans every past season, so a
                                      -- retired/departed player's id would
                                      -- otherwise fail the constraint
  player_name text not null,         -- denormalized so the page still shows a
                                      -- name even if the player_id join misses
  snaps int,                         -- nullable: a PROJECTED depth chart (a
                                      -- season with no games played yet, e.g.
                                      -- the year before it starts) has no
                                      -- real snap count to rank by -- see
                                      -- pull_projected_depth_chart.py
  primary key (team_abbr, season, position, depth_rank)
);

alter table ol_depth_chart alter column snaps drop not null;
alter table ol_depth_chart drop constraint if exists ol_depth_chart_player_id_fkey;

-- ============================================================================
-- ol_free_agency_moves: for a season being PREVIEWED before it starts, the
-- meaningful (300+ snap) O-line players a team gained or lost this offseason.
-- Derived entirely from data already in this database (ol_depth_chart's past
-- two seasons of real snap totals) cross-referenced with nflreadpy's current
-- roster -- not hand-researched, see pull_free_agency_moves.py. Each move is
-- stored from BOTH sides (a "lost" row for the old team, a "gained" row for
-- the new one) so either team's page can query by its own team_abbr alone.
-- Also carries the player's most recent contract (OverTheCap via nflreadpy's
-- load_contracts(), also not hand-researched).
-- ============================================================================
create table if not exists ol_free_agency_moves (
  team_abbr text not null references teams (team_abbr),
  season int not null,                 -- the season being previewed, e.g. 2026
  direction text not null check (direction in ('gained', 'lost')),
  player_id text not null,
  player_name text not null,
  other_team_abbr text references teams (team_abbr), -- who they came from/went
                                                       -- to; null = unsigned/retired
  best_season int not null,            -- which of the past 2 seasons had their
                                        -- qualifying (>=300) snap total
  best_season_snaps int not null,
  contract_years numeric,              -- nullable: OverTheCap (via nflreadpy's
  contract_value numeric,              -- load_contracts()) doesn't cover every
  contract_guaranteed numeric,         -- player -- the player's most recent
                                        -- signed deal, all in $ millions
  primary key (team_abbr, season, direction, player_id)
);

alter table ol_free_agency_moves add column if not exists contract_years numeric;
alter table ol_free_agency_moves add column if not exists contract_value numeric;
alter table ol_free_agency_moves add column if not exists contract_guaranteed numeric;

-- ============================================================================
-- ol_draft_picks: every O-line player a team drafted, one row per pick, shown
-- on that same draft year's team page (the 2024 class on the 2024 page, etc).
-- Source: nflreadpy's load_draft_picks() (Pro Football Reference) -- fully
-- automated, not hand-researched, see pull_ol_draft_picks.py. Unlike
-- ol_free_agency_moves this isn't "gained/lost" (a draft pick doesn't have a
-- symmetric other side) -- just the picks that team made that year.
-- ============================================================================
create table if not exists ol_draft_picks (
  team_abbr text not null references teams (team_abbr),
  season int not null,                 -- draft year == the team-page season
  round int not null,
  pick int not null,                   -- overall pick number
  player_id text,                      -- nullable -- PFR/gsis crosswalk
                                        -- occasionally misses very recent picks
  player_name text not null,
  position text not null check (position in ('OT', 'OG', 'C', 'OL')),
  primary key (team_abbr, season, pick)
);

-- ============================================================================
-- injuries: the CURRENT OL injury report per team. Like ol_starters, this is
-- a snapshot the pipeline replaces each run (delete this team's rows, insert
-- the fresh ones), not an append-only history table.
-- ============================================================================
create table if not exists injuries (
  id bigint generated always as identity primary key,
  team_abbr text not null references teams (team_abbr),
  player_id text references players (player_id),
  player_name text not null,
  position text,
  status text,                       -- 'Out', 'Doubtful', 'Questionable', 'IR'
  injury_description text,
  season int not null,
  week int not null,
  updated_at timestamptz not null default now()
);

create index if not exists injuries_team_season_week_idx
  on injuries (team_abbr, season, week);

-- ============================================================================
-- player_injury_reports: full weekly injury-report HISTORY per player,
-- unlike `injuries` above (current snapshot only, latest week, replaced
-- each run). This is append-only-by-upsert -- every (player, season, week)
-- they were ruled OUT, going back to 2013 (this project's existing
-- depth-chart/snap-history floor). Deliberately Out-only, not every
-- report appearance -- Questionable/Doubtful/Probable/Note don't reliably
-- mean a missed game, and the whole point of this table is counting weeks
-- actually missed (see pull_injury_history.py). Powers the player page's
-- Injury History card. No FK on player_id, same reasoning as
-- ol_depth_chart/player_combine: spans retired/departed players not in
-- the current-roster-only `players` table.
-- ============================================================================
create table if not exists player_injury_reports (
  player_id text not null,
  player_name text not null,
  position text,
  team_abbr text not null references teams (team_abbr),
  season int not null,
  week int not null,
  status text not null,              -- always 'Out' as of this table's current pull logic --
                                      -- no CHECK constraint, kept as a real column (not assumed)
                                      -- in case a future pass widens what gets stored
  injury_description text,
  primary key (player_id, season, week)
);

-- ============================================================================
-- player_injury_rates: one derived row per player_id (not per-season, same
-- "current best computation" model player_archetypes uses) -- career
-- weeks missed as a percentile against every other tracked OL player,
-- computed by pipeline/compute_injury_rates.py from player_injury_reports
-- + ol_depth_chart. Regular season only (playoff "Out" weeks are excluded
-- from both the numerator and the denominator, since not every team makes
-- the playoffs and mixing them in would unfairly reward/punish players for
-- their team's success rather than their own health), and "possible weeks"
-- per season is a fixed 17 (seasons before 2021) or 18 (2021+) -- the
-- season's real week count, not adjusted for the player's own bye week
-- (which they can never be marked Out for anyway, so it's a small uniform
-- undercount of "possible" that doesn't distort the percentile ranking
-- between players). Not wired into the automatic pipeline, same reasoning
-- as player_archetypes -- run manually when injury/depth-chart data changes.
-- ============================================================================
create table if not exists player_injury_rates (
  player_id text primary key,        -- no FK, same reasoning as player_injury_reports above
  weeks_missed int not null,
  possible_weeks int not null,
  missed_rate numeric not null,      -- weeks_missed / possible_weeks, stored for convenience/debugging
  missed_percentile numeric not null, -- 0-100, higher = missed MORE time than more of the population
  computed_at timestamptz not null default now()
);

-- ============================================================================
-- player_contracts: every contract a tracked OL has ever signed (one row per
-- player per contract, not per season), from nflreadpy's load_contracts()
-- (OverTheCap data). No FK to `players`, same reasoning as
-- player_injury_reports/ol_depth_chart -- spans retired players too.
-- `is_current` marks whichever row is that player's active deal today --
-- set from the TOP-LEVEL is_active-flagged snapshot's own numbers, not
-- reconstructed from within contract_history, since the two occasionally
-- disagree slightly for restructured/tendered deals (see
-- pull_player_contracts.py). A career-table season's APY is found by
-- picking whichever row's [year_signed, year_signed+years) covers it,
-- or fifth_year_option_season if it matches instead.
-- fifth_year_option_season/_apy: set only for a first-round pick's
-- CBA-granted 5th contract year (a real, single-season salary tacked onto
-- the end of the 4-year rookie deal, not a new signing) once it's been
-- exercised -- pulled from OTC's year-by-year cap breakdown since the
-- row's own apy/years only describe the base 4-year deal. See
-- pull_player_contracts.py's _fifth_year_option() for the full writeup.
-- ============================================================================
create table if not exists player_contracts (
  id bigint generated always as identity primary key,
  player_id text not null,
  player_name text not null,
  position text,                -- LT/RT/LG/RG/C
  year_signed int not null,
  years numeric,
  total_value numeric,          -- $ millions
  apy numeric,                  -- $ millions
  guaranteed numeric,           -- $ millions
  is_current boolean not null default false,
  fifth_year_option_season int,
  fifth_year_option_apy numeric, -- $ millions
  unique (player_id, year_signed)
);

create index if not exists player_contracts_player_idx
  on player_contracts (player_id);

-- ============================================================================
-- articles: hand-written editorial content authored in the /internal/articles
-- admin form (a Tiptap WYSIWYG editor), stored as sanitized HTML. Unlike
-- every other table here, its RLS policy is NOT "anyone can read" -- only
-- published = true rows are public, so a draft saved but not yet published
-- never appears on the public site even though the anon key can query the
-- table.
-- ============================================================================
create table if not exists articles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  content_html text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- team_ol_stats: the core computed table -- one row per team, per season,
-- per week. This is stored as WEEKLY HISTORY (never overwritten) rather than
-- a single "current" snapshot, specifically so that a future "grade over the
-- season" trend chart can be built later without needing to backfill lost
-- data -- every week's numbers are kept forever.
--
-- The three grades (pass block / run block / overall) are computed once in
-- Python (see pipeline/compute_grades.py) and stored here as plain numbers
-- and letters, so the Next.js frontend never has to reimplement the grading
-- formula -- it just displays whatever's in these columns.
-- ============================================================================
create table if not exists team_ol_stats (
  team_abbr text not null references teams (team_abbr),
  season int not null,
  week int not null,

  -- raw automated stats, cumulative through this week of this season
  games_played int,
  dropbacks int,
  sacks_allowed int,
  pressures_allowed int,
  pressure_rate_allowed numeric,
  stuff_rate numeric,                        -- share of rush attempts stopped at/behind the line
  yards_before_contact_per_att numeric,       -- nullable: may not be available, see pipeline README
  penalty_rate numeric,                      -- Offensive Holding + False Start per offensive play

  -- computed grades (0-100 scores + letter grades, see compute_grades.py)
  pass_block_score numeric,
  pass_block_grade text,
  run_block_score numeric,
  run_block_grade text,
  overall_score numeric,
  overall_grade text,
  grade_formula_version text not null default 'v1',

  updated_at timestamptz not null default now(),
  primary key (team_abbr, season, week)
);

create index if not exists team_ol_stats_team_season_idx
  on team_ol_stats (team_abbr, season);

-- ============================================================================
-- espn_team_block_win_rates: manually-entered ESPN Pass/Run Block Win Rate,
-- team level. Typed in by hand via the internal /internal/espn-entry page,
-- since ESPN doesn't publish this through nflreadpy.
-- ============================================================================
create table if not exists espn_team_block_win_rates (
  team_abbr text not null references teams (team_abbr),
  season int not null,
  pass_block_win_rate numeric,
  run_block_win_rate numeric,
  source text not null default 'ESPN',
  entered_by text,
  entered_at timestamptz not null default now(),
  notes text,
  primary key (team_abbr, season)
);

-- ============================================================================
-- team_schedule_strength: Strength of Schedule, one row per team per
-- season (like espn_team_block_win_rates above, not weekly history like
-- team_ol_stats -- see pipeline/steps/pull_schedule_strength.py). Fed into
-- compute_grades.py as a 4th weighted component on Pass/Run Block.
-- ============================================================================
create table if not exists team_schedule_strength (
  team_abbr text not null references teams (team_abbr),
  season int not null,
  pass_sos_score numeric,   -- 0-100, higher = tougher pass rushes faced
  run_sos_score numeric,    -- 0-100, higher = tougher run defenses faced
  updated_at timestamptz not null default now(),
  primary key (team_abbr, season)
);

-- ============================================================================
-- espn_player_block_win_rates: same idea, but per player. player_id is
-- required (not free text) -- the entry form uses a searchable dropdown
-- against the real `players` table, so this data never accumulates typos or
-- name-variant duplicates the way free-text entry would.
-- ============================================================================
create table if not exists espn_player_block_win_rates (
  id bigint generated always as identity primary key,
  player_id text not null references players (player_id),
  player_name text not null,        -- denormalized copy, for display convenience
  team_abbr text references teams (team_abbr),
  season int not null,
  position text,
  pass_block_win_rate numeric,
  run_block_win_rate numeric,
  source text not null default 'ESPN',
  entered_by text,
  entered_at timestamptz not null default now(),
  notes text,
  unique (player_id, season)
);

-- ============================================================================
-- player_honors: Pro Bowl and AP All-Pro selections, hand-researched and
-- entered season by season (nflreadpy doesn't carry this) -- same category
-- as espn_team_block_win_rates above: manually curated, not pipeline-computed.
-- A player can earn both honors in the same season (common for the best
-- players), hence `honor` is part of the primary key rather than a single
-- column per player-season.
-- ============================================================================
create table if not exists player_honors (
  season int not null,
  team_abbr text not null references teams (team_abbr),
  player_name text not null,
  position text,
  honor text not null check (honor in ('pro_bowl', 'all_pro_1st', 'all_pro_2nd')),
  player_id text,                    -- no FK, same reasoning as ol_depth_chart.player_id
                                      -- above: honors span retired/departed players not
                                      -- in the current-roster-only `players` table
  primary key (season, team_abbr, player_name, honor)
);

-- Added after the table's initial creation -- see players' bio/draft columns above for why this is safe to re-run.
alter table player_honors add column if not exists player_id text;

-- ============================================================================
-- player_combine: NFL Combine (and pro-day-supplemented) workout numbers,
-- one row per player -- these are one-time career facts, not per-season
-- history, same reasoning as the draft columns on `players`. Two sources
-- feed this table: nflreadpy's load_combine() (official, ~65-80% OL
-- coverage, 6 raw drills, no percentiles) and a one-off mockdraftable.com
-- scrape (broader measurables -- arm/hand/wingspan -- plus its own
-- percentile-per-position numbers, which we display as-is rather than
-- computing our own). `source` records whichever pass most recently wrote
-- the row; a later mockdraftable pass overwrites an earlier nflreadpy-only
-- row for the same player. No FK on player_id, same reasoning as
-- ol_depth_chart/player_honors above: this spans retired players who
-- won't have a current `players` row.
-- ============================================================================
create table if not exists player_combine (
  player_id text primary key,
  player_name text not null,
  position text,

  arm_length numeric,
  hand_size numeric,
  wingspan numeric,
  forty numeric,
  bench int,
  vertical numeric,
  broad_jump numeric,
  cone numeric,
  shuttle numeric,

  -- percentiles are computed by pipeline/compute_combine_percentiles.py
  -- from the raw drill numbers above (per position group OT/OG/C, against
  -- every other tracked OL with a value for that field) -- not sourced
  -- from mockdraftable directly, since that was a one-off manual scrape
  -- never re-run for new draft classes. Null whenever there's no raw
  -- value to rank, or fewer than 2 other players to compare against.
  arm_length_percentile numeric,
  hand_size_percentile numeric,
  wingspan_percentile numeric,
  forty_percentile numeric,
  bench_percentile numeric,
  vertical_percentile numeric,
  broad_jump_percentile numeric,
  cone_percentile numeric,
  shuttle_percentile numeric,

  -- 'wikipedia' added later: fills the {{NFL predraft}}/{{NFL Combine}}
  -- template's numbers (often the Pro Day workout, not just the live
  -- Combine) for players nflreadpy/mockdraftable are missing entirely --
  -- see pipeline/_scratch/scrape_wikipedia_combine.py.
  source text not null check (source in ('nflreadpy', 'mockdraftable', 'wikipedia')),
  source_url text,                   -- mockdraftable/wikipedia player page, for attribution/debugging
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- player_archetypes: one derived label per player_id (not per-season --
-- based on career draft/combine/snap-history data, same "current best
-- classification" model the script itself uses), computed by
-- pipeline/compute_player_archetypes.py from data already in this DB
-- (players, player_combine, ol_depth_chart, player_honors). Not hand-
-- entered like player_honors above -- fully rule-derived, but the rules
-- are hand-tuned enough (see the script's docstring) that this is run
-- manually, not wired into pull_and_compute.py's automatic pipeline.
-- `reasons` are short (3-4 word) bullets explaining the archetype, e.g.
-- "90th %ile weight" -- built for direct display on the player page, not
-- meant to be parsed back apart.
-- ============================================================================
create table if not exists player_archetypes (
  player_id text primary key,        -- no FK, same reasoning as player_combine/ol_depth_chart:
                                      -- spans retired players not in the current-roster `players` table
  archetype text not null,
  reasons text[] not null default '{}',
  computed_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security: lock every table down, then open read-only access to
-- the public `anon` key. The service_role key (used server-side by the
-- pipeline and the /api/espn-entry route) always bypasses RLS, so it can
-- still write without needing its own policy below.
-- ============================================================================
alter table teams enable row level security;
alter table players enable row level security;
alter table ol_depth_chart enable row level security;
alter table ol_free_agency_moves enable row level security;
alter table ol_draft_picks enable row level security;
alter table injuries enable row level security;
alter table team_ol_stats enable row level security;
alter table team_schedule_strength enable row level security;
alter table espn_team_block_win_rates enable row level security;
alter table espn_player_block_win_rates enable row level security;
alter table player_honors enable row level security;
alter table player_combine enable row level security;
alter table player_archetypes enable row level security;
alter table player_injury_reports enable row level security;
alter table player_injury_rates enable row level security;
alter table player_contracts enable row level security;
alter table articles enable row level security;

drop policy if exists "public read access" on teams;
create policy "public read access" on teams for select using (true);

drop policy if exists "public read access" on players;
create policy "public read access" on players for select using (true);

drop policy if exists "public read access" on ol_depth_chart;
create policy "public read access" on ol_depth_chart for select using (true);

drop policy if exists "public read access" on ol_free_agency_moves;
create policy "public read access" on ol_free_agency_moves for select using (true);

drop policy if exists "public read access" on ol_draft_picks;
create policy "public read access" on ol_draft_picks for select using (true);

drop policy if exists "public read access" on injuries;
create policy "public read access" on injuries for select using (true);

drop policy if exists "public read access" on team_ol_stats;
create policy "public read access" on team_ol_stats for select using (true);

drop policy if exists "public read access" on team_schedule_strength;
create policy "public read access" on team_schedule_strength for select using (true);

drop policy if exists "public read access" on espn_team_block_win_rates;
create policy "public read access" on espn_team_block_win_rates for select using (true);

drop policy if exists "public read access" on espn_player_block_win_rates;
create policy "public read access" on espn_player_block_win_rates for select using (true);

drop policy if exists "public read access" on player_honors;
create policy "public read access" on player_honors for select using (true);

drop policy if exists "public read access" on player_combine;
create policy "public read access" on player_combine for select using (true);

drop policy if exists "public read access" on player_archetypes;
create policy "public read access" on player_archetypes for select using (true);

drop policy if exists "public read access" on player_injury_reports;
create policy "public read access" on player_injury_reports for select using (true);

drop policy if exists "public read access" on player_injury_rates;
create policy "public read access" on player_injury_rates for select using (true);

drop policy if exists "public read access" on player_contracts;
create policy "public read access" on player_contracts for select using (true);

-- Only published articles are visible to the anon/authenticated roles --
-- drafts stay readable by service_role (which bypasses RLS) for the admin
-- list page.
drop policy if exists "public read access" on articles;
create policy "public read access" on articles for select using (published = true);

-- ============================================================================
-- Grants: with "Automatically expose new tables" turned off in the Supabase
-- dashboard, tables aren't reachable through the Data API by default -- you
-- have to explicitly grant SELECT to the `anon`/`authenticated` roles even
-- though RLS policies above say "anyone can read". Both layers are required:
-- GRANT controls "can this role touch the table at all", RLS controls "which
-- rows does it see". This makes read access fully explicit in one file,
-- rather than depending on a dashboard checkbox.
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on
  teams,
  players,
  ol_depth_chart,
  ol_free_agency_moves,
  ol_draft_picks,
  injuries,
  team_ol_stats,
  team_schedule_strength,
  espn_team_block_win_rates,
  espn_player_block_win_rates,
  player_honors,
  player_combine,
  player_archetypes,
  player_injury_reports,
  player_injury_rates,
  player_contracts,
  articles
to anon, authenticated;

-- service_role is meant to bypass RLS and have full write access -- but it
-- turns out that same "auto-expose" setting also skips granting it table
-- privileges by default, so it needs the same explicit treatment here.
grant usage on schema public to service_role;

grant select, insert, update, delete on
  teams,
  players,
  ol_depth_chart,
  ol_free_agency_moves,
  ol_draft_picks,
  injuries,
  team_ol_stats,
  team_schedule_strength,
  espn_team_block_win_rates,
  espn_player_block_win_rates,
  player_honors,
  player_combine,
  player_archetypes,
  player_injury_reports,
  player_injury_rates,
  player_contracts,
  articles
to service_role;
