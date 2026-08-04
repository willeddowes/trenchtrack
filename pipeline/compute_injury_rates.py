"""Computes each tracked OL player's career "weeks missed to injury" rate
and its percentile against every other tracked player, writing the result
to `player_injury_rates`. Run manually (not part of pull_and_compute.py,
same reasoning as compute_player_archetypes.py -- see that table's comment
in supabase/schema.sql): `venv/bin/python compute_injury_rates.py` from
`pipeline/`. Re-run whenever injury or depth-chart data changes and you
want percentiles refreshed -- full upsert, safe to re-run any time.

Regular season only, both sides of the rate:
  - Numerator: player_injury_reports rows (already Out-only, see that
    table's comment) with week <= that season's regular-season length.
    Playoff "Out" weeks are excluded -- not every team makes the playoffs,
    so counting them would reward/punish players for their team's success
    rather than their own health.
  - Denominator ("possible weeks"): 17 weeks per season before 2021, 18
    from 2021 on (the NFL's real regular-season length each year) for
    every season the player has a REAL (non-projected, i.e. snaps is not
    null) ol_depth_chart row -- a season that hasn't been played yet
    (e.g. the 2026 preview season) shouldn't count as a chance to have
    missed games. Not adjusted for the player's own bye week (which they
    can never be marked Out for anyway, so this is a small uniform
    undercount of "possible" -- doesn't distort the ranking between
    players, since it applies equally to everyone).

This is necessarily an approximation, not a clinical injury record: it
doesn't know exactly which weeks a player was actually on a given
roster within a season (e.g. a midseason signing), just the season
totals ol_depth_chart already tracks.
"""

from write_to_supabase import fetch_all, get_client, upsert_player_injury_rates


def regular_season_weeks(season: int) -> int:
    return 18 if season >= 2021 else 17


def main():
    client = get_client()

    depth = fetch_all(client, "ol_depth_chart", "player_id,season,snaps", not_null="player_id")
    injuries = fetch_all(client, "player_injury_reports", "player_id,season,week")

    # Real (non-projected) tracked seasons per player.
    seasons_by_player: dict[str, set[int]] = {}
    for row in depth:
        if row["snaps"] is None:
            continue
        seasons_by_player.setdefault(row["player_id"], set()).add(row["season"])

    weeks_missed_by_player: dict[str, int] = {}
    for row in injuries:
        if row["week"] > regular_season_weeks(row["season"]):
            continue  # playoff week, excluded from both sides of the rate
        weeks_missed_by_player[row["player_id"]] = weeks_missed_by_player.get(row["player_id"], 0) + 1

    rates: dict[str, dict] = {}
    for player_id, seasons in seasons_by_player.items():
        possible_weeks = sum(regular_season_weeks(s) for s in seasons)
        if possible_weeks == 0:
            continue
        weeks_missed = weeks_missed_by_player.get(player_id, 0)
        rates[player_id] = {
            "weeks_missed": weeks_missed,
            "possible_weeks": possible_weeks,
            "missed_rate": weeks_missed / possible_weeks,
        }

    all_rates = [r["missed_rate"] for r in rates.values()]

    def percentile_rank(value: float, population: list[float]) -> float:
        lower = sum(1 for v in population if v < value)
        equal = sum(1 for v in population if v == value)
        return 100 * (lower + 0.5 * equal) / len(population)

    rows = [
        {
            "player_id": player_id,
            "weeks_missed": r["weeks_missed"],
            "possible_weeks": r["possible_weeks"],
            "missed_rate": r["missed_rate"],
            "missed_percentile": percentile_rank(r["missed_rate"], all_rates),
        }
        for player_id, r in rates.items()
    ]

    upsert_player_injury_rates(client, rows)
    print(f"Wrote injury rates for {len(rows)} players.")


if __name__ == "__main__":
    main()
