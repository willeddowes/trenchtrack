"""All Supabase reads/writes for the pipeline, in one place. Uses the
service_role key, which bypasses Row Level Security entirely -- that's fine
here since this code only ever runs on your own machine (or later, in a
GitHub Action), never in the browser.

Uses supabase-py's .upsert(), which means "insert this row, or if a row
with the same primary key already exists, update it instead" -- so it's
always safe to re-run the pipeline without creating duplicate rows.
"""

import os

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _records(df_or_rows) -> list[dict]:
    """Accepts either a list of dicts or a pandas DataFrame, and returns
    a list of plain dicts ready to send to Supabase (NaN -> None, since
    Postgres/JSON don't understand NaN)."""
    if isinstance(df_or_rows, pd.DataFrame):
        rows = df_or_rows.where(pd.notna(df_or_rows), None).to_dict(orient="records")
    else:
        rows = df_or_rows
    return [{k: (None if pd.isna(v) else v) if not isinstance(v, (list, dict)) else v
             for k, v in row.items()} for row in rows]


def upsert_players(client: Client, rows: list[dict]) -> None:
    if not rows:
        return
    client.table("players").upsert(_records(rows), on_conflict="player_id").execute()


def fetch_all(client: Client, table: str, select: str, not_null: str | None = None) -> list[dict]:
    """PostgREST caps an unpaginated select at 1000 rows -- ol_depth_chart
    and players both already exceed that -- so anything reading a whole
    table has to page through it with .range() instead of trusting one
    execute() to return everything."""
    page_size = 1000
    rows: list[dict] = []
    from_ = 0
    while True:
        query = client.table(table).select(select)
        if not_null:
            query = query.not_.is_(not_null, "null")
        page = query.range(from_, from_ + page_size - 1).execute().data
        rows.extend(page)
        if len(page) < page_size:
            break
        from_ += page_size
    return rows


def upsert_player_combine(client: Client, rows: list[dict]) -> None:
    if not rows:
        return
    client.table("player_combine").upsert(_records(rows), on_conflict="player_id").execute()


def replace_ol_depth_chart(client: Client, season: int, rows: list[dict]) -> None:
    """Like replace_injuries -- each run replaces the whole season's ranked
    list, since the shape of the ranking (how many backups logged snaps at
    a position) can legitimately change between runs."""
    client.table("ol_depth_chart").delete().eq("season", season).execute()
    if rows:
        client.table("ol_depth_chart").insert(_records(rows)).execute()


def fetch_ol_depth_chart(client: Client, seasons: list[int]) -> pd.DataFrame:
    """Reads back our own stored O-line depth-chart history for the given
    seasons -- used by pull_free_agency_moves.py to find each player's real
    past snap totals (a read of already-computed data, not a fresh nflreadpy
    pull)."""
    resp = (
        client.table("ol_depth_chart")
        .select("team_abbr,season,player_id,player_name,snaps")
        .in_("season", seasons)
        .execute()
    )
    if not resp.data:
        return pd.DataFrame(columns=["team_abbr", "season", "player_id", "player_name", "snaps"])
    return pd.DataFrame(resp.data)


def replace_free_agency_moves(client: Client, season: int, rows: list[dict]) -> None:
    """Same delete-and-replace pattern as replace_ol_depth_chart -- each run
    recomputes the full gained/lost list for the season being previewed."""
    client.table("ol_free_agency_moves").delete().eq("season", season).execute()
    if rows:
        client.table("ol_free_agency_moves").insert(_records(rows)).execute()


def replace_injuries(client: Client, season: int, rows: list[dict]) -> None:
    """Injuries aren't upserted -- each run replaces the whole current
    report for the season, since last week's "Questionable" tag shouldn't
    linger once a player is off the report entirely."""
    client.table("injuries").delete().eq("season", season).execute()
    if rows:
        client.table("injuries").insert(_records(rows)).execute()


def upsert_team_ol_stats(client: Client, df: pd.DataFrame) -> None:
    if df.empty:
        return
    client.table("team_ol_stats").upsert(_records(df), on_conflict="team_abbr,season,week").execute()


def fetch_espn_team_rates(client: Client, season: int) -> pd.DataFrame:
    """Reads whatever ESPN team-level win rates have been manually entered
    so far for this season, so compute_grades.py can blend them in. Any
    team not yet entered simply won't appear in this DataFrame -- see
    compute_grades.py for how that's handled."""
    resp = (
        client.table("espn_team_block_win_rates")
        .select("team_abbr,pass_block_win_rate,run_block_win_rate")
        .eq("season", season)
        .execute()
    )
    if not resp.data:
        return pd.DataFrame(columns=["team_abbr", "pass_block_win_rate", "run_block_win_rate"])
    return pd.DataFrame(resp.data)
