import re

from models import Fixture

# KNVB youth age-category prefixes: JO19, JO17, MO15, O13, etc. (optionally "-1" team suffix)
_JEUGD_RE = re.compile(r"\b(?:[JM]O|O)\d{1,2}(-\d+)?\b", re.IGNORECASE)
_VETERAN_RE = re.compile(r"\b\d{2}\+")
_WOMEN_RE = re.compile(r"\b(VR\d+|Dames)\b", re.IGNORECASE)


def classify(fixture: Fixture) -> str:
    """Returns "jeugd" or "senioren" for a fixture, based on the team names.

    Priority: jeugd age-codes first (a JO/MO/O prefix always wins), then veteran
    ("45+") and women's ("VR"/"Dames") adult teams, then plain senior teams as
    the default. Anything not matching any pattern also defaults to senioren,
    but callers should treat that as "unclassified" and surface it for review.
    """
    names = f"{fixture.home_team} {fixture.away_team}"
    if _JEUGD_RE.search(names):
        return "jeugd"
    return "senioren"


def is_recognized(fixture: Fixture) -> bool:
    names = f"{fixture.home_team} {fixture.away_team}"
    return bool(_JEUGD_RE.search(names) or _VETERAN_RE.search(names) or _WOMEN_RE.search(names)
                or re.search(r"\d", names))


def split(fixtures: list[Fixture]) -> tuple[list[Fixture], list[Fixture], list[Fixture]]:
    """Returns (senioren, jeugd, unclassified) — unclassified is a subset already
    included in senioren (the safe default), listed separately so callers can
    surface it as a warning."""
    senioren, jeugd, unclassified = [], [], []
    for fx in fixtures:
        if classify(fx) == "jeugd":
            jeugd.append(fx)
        else:
            senioren.append(fx)
            if not is_recognized(fx):
                unclassified.append(fx)
    return senioren, jeugd, unclassified
