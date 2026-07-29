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
  updated_at timestamptz not null default now()
);

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
  snaps int not null,
  primary key (team_abbr, season, position, depth_rank)
);

alter table ol_depth_chart drop constraint if exists ol_depth_chart_player_id_fkey;

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
-- Row Level Security: lock every table down, then open read-only access to
-- the public `anon` key. The service_role key (used server-side by the
-- pipeline and the /api/espn-entry route) always bypasses RLS, so it can
-- still write without needing its own policy below.
-- ============================================================================
alter table teams enable row level security;
alter table players enable row level security;
alter table ol_depth_chart enable row level security;
alter table injuries enable row level security;
alter table team_ol_stats enable row level security;
alter table espn_team_block_win_rates enable row level security;
alter table espn_player_block_win_rates enable row level security;

drop policy if exists "public read access" on teams;
create policy "public read access" on teams for select using (true);

drop policy if exists "public read access" on players;
create policy "public read access" on players for select using (true);

drop policy if exists "public read access" on ol_depth_chart;
create policy "public read access" on ol_depth_chart for select using (true);

drop policy if exists "public read access" on injuries;
create policy "public read access" on injuries for select using (true);

drop policy if exists "public read access" on team_ol_stats;
create policy "public read access" on team_ol_stats for select using (true);

drop policy if exists "public read access" on espn_team_block_win_rates;
create policy "public read access" on espn_team_block_win_rates for select using (true);

drop policy if exists "public read access" on espn_player_block_win_rates;
create policy "public read access" on espn_player_block_win_rates for select using (true);

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
  injuries,
  team_ol_stats,
  espn_team_block_win_rates,
  espn_player_block_win_rates
to anon, authenticated;

-- service_role is meant to bypass RLS and have full write access -- but it
-- turns out that same "auto-expose" setting also skips granting it table
-- privileges by default, so it needs the same explicit treatment here.
grant usage on schema public to service_role;

grant select, insert, update, delete on
  teams,
  players,
  ol_depth_chart,
  injuries,
  team_ol_stats,
  espn_team_block_win_rates,
  espn_player_block_win_rates
to service_role;
