"""Shared player-name normalization for joining nflverse sources that don't
share a common player ID (e.g. PFR snap counts vs ESPN depth charts, or
nflreadpy's combine data vs our own player_id-keyed tables). Strips
punctuation and generational suffixes and collapses whitespace, so
"Brian O'Neill" and "Trent Williams Jr." match consistently across
sources that format names slightly differently."""

import re

import pandas as pd

_SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?")
_PUNCT_RE = re.compile(r"[.'’]")
_SPACE_RE = re.compile(r"\s+")


def normalize_name(name: str | None) -> str | None:
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return None
    n = name.lower()
    n = _PUNCT_RE.sub("", n)
    n = _SUFFIX_RE.sub("", n)
    n = _SPACE_RE.sub(" ", n).strip()
    return n
