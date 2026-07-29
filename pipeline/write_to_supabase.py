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


def replace_ol_depth_chart(client: Client, season: int, rows: list[dict]) -> None:
    """Like replace_injuries -- each run replaces the whole season's ranked
    list, since the shape of the ranking (how many backups logged snaps at
    a position) can legitimately change between runs."""
    client.table("ol_depth_chart").delete().eq("season", season).execute()
    if rows:
        client.table("ol_depth_chart").insert(_records(rows)).execute()


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
