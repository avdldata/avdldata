"""Scrapes the weekly fixture list from vvpekela.nl.

IMPORTANT: this module was written without the ability to load the live page
(the development sandbox has no general internet access). The parsing logic
below is a best-effort, layered approach:

  1. Try a couple of plausible structured selectors (table rows / card divs)
     that are common on Dutch amateur-club CMS sites.
  2. If none of those match anything, fall back to scanning the whole page's
     text, grouped into per-fixture blocks around each date it finds.

Either way, each candidate block of text (which may itself contain several
lines — the date, "time + venue", and "home - away" often live in separate
elements) is handed to `_parse_block`, which extracts fields by finding each
one's own regex and only treating whatever's left over as the team names —
this avoids one field's greedy match eating into the next. Whichever path
actually works against the real page, isolate the fix to `_extract_rows`
(structured selectors) or the regexes below — nothing else in this file
should need to change. Run `tools/dump_html.py` against the live URL first
(from an environment with internet access, e.g. GitHub Actions) to capture
real markup, then adjust here and add it as a regression fixture under
tests/fixtures/.
"""
import re
from datetime import date

import requests
from bs4 import BeautifulSoup

from models import Fixture

URL = "https://www.vvpekela.nl/316/programma-komende-week/"
USER_AGENT = "Mozilla/5.0 (compatible; VVPekelaPosterBot/1.0; +https://www.vvpekela.nl)"

MONTHS_NL = {
    "januari": 1, "februari": 2, "maart": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "augustus": 8, "september": 9, "oktober": 10, "november": 11, "december": 12,
}
WEEKDAYS_NL = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]

# "zaterdag 9 mei" — day name, day number, month name
_DATE_RE = re.compile(
    r"\b(?:%s)\b\s+(\d{1,2})\s+(%s)\b" % ("|".join(WEEKDAYS_NL), "|".join(MONTHS_NL)),
    re.IGNORECASE,
)
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
# venue tokens are restricted to the *same line* ([ \t] rather than \s between
# words) so this can never cross into a "home - away" line that follows it
_VENUE_RE = re.compile(r"\bSportpark(?:[ \t]+[A-Za-zÀ-ÿ.''-]+){0,2}", re.IGNORECASE)
_DASH_SPLIT_RE = re.compile(r"(.+?)\s*[-–]\s*(.+)")


class ScrapeError(Exception):
    pass


def fetch_html(url: str = URL, timeout: int = 15) -> str:
    resp = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return resp.text


def _resolve_year(month: int, today: date) -> int:
    # the site doesn't print a year; roll into next year if we're clearly
    # looking at a fixture from the other side of a Dec/Jan season boundary
    if today.month >= 11 and month <= 2:
        return today.year + 1
    return today.year


def _parse_block(text: str, today: date) -> Fixture | None:
    date_m = _DATE_RE.search(text)
    if not date_m:
        return None
    day, month_name = int(date_m.group(1)), date_m.group(2).lower()
    year = _resolve_year(MONTHS_NL[month_name], today)
    try:
        match_date = date(year, MONTHS_NL[month_name], day)
    except ValueError:
        return None

    time_m = _TIME_RE.search(text)
    venue_m = _VENUE_RE.search(text)

    # cut out whatever we've already recognized (date/time/venue); whatever's
    # left over should just be the "home - away" pairing, regardless of
    # whether the source concatenated everything on one line or several
    remainder = text
    for m in sorted((m for m in (date_m, time_m, venue_m) if m), key=lambda m: m.start(), reverse=True):
        remainder = remainder[:m.start()] + " " + remainder[m.end():]
    teams_m = _DASH_SPLIT_RE.search(" ".join(remainder.split()))
    if not teams_m:
        return None
    home_team, away_team = teams_m.group(1).strip(), teams_m.group(2).strip()
    if not home_team or not away_team:
        return None

    return Fixture(
        match_date=match_date,
        time=f"{time_m.group(1)}:{time_m.group(2)}" if time_m else None,
        venue=venue_m.group(0).strip() if venue_m else None,
        home_team=home_team,
        away_team=away_team,
    )


def _extract_rows(soup: BeautifulSoup) -> list[Fixture]:
    """Structured-selector attempt. Best-effort guesses at common container
    patterns; verify/replace against the real page's markup."""
    today = date.today()
    candidates = (
        soup.select("tr")
        + soup.select("[class*='wedstrijd']")
        + soup.select("[class*='programma'] li")
        + soup.select("[class*='match']")
    )
    fixtures: list[Fixture] = []
    seen_text = set()
    for el in candidates:
        text = el.get_text("\n", strip=True)
        if not text or text in seen_text:
            continue
        seen_text.add(text)
        fx = _parse_block(text, today)
        if fx:
            fixtures.append(fx)
    return fixtures


def _iter_blocks(lines: list[str]) -> list[str]:
    """Groups page lines into one block per fixture, starting a new block at
    each line that contains a date (the date/time+venue/teams for one match
    typically span 2-3 consecutive lines in rendered text)."""
    blocks: list[list[str]] = []
    for line in lines:
        if _DATE_RE.search(line) or not blocks:
            blocks.append([line])
        else:
            blocks[-1].append(line)
    return ["\n".join(b) for b in blocks]


def _extract_rows_fallback(soup: BeautifulSoup) -> list[Fixture]:
    """Whole-page text scan, used only if structured selectors find nothing."""
    today = date.today()
    lines = [ln for ln in soup.get_text("\n", strip=True).splitlines() if ln.strip()]
    fixtures = []
    for block in _iter_blocks(lines):
        fx = _parse_block(block, today)
        if fx:
            fixtures.append(fx)
    return fixtures


def parse_fixtures(html: str) -> list[Fixture]:
    soup = BeautifulSoup(html, "lxml")
    fixtures = _extract_rows(soup)
    if not fixtures:
        fixtures = _extract_rows_fallback(soup)
    if not fixtures:
        # Distinguish "page structure changed" from "legitimately no matches this
        # week": only treat as a real empty week if the page explicitly says so.
        if re.search(r"geen wedstrijden", html, re.IGNORECASE):
            return []
        raise ScrapeError(
            "No fixtures found and no 'geen wedstrijden' message present — "
            "the page structure likely no longer matches scraper.py's selectors."
        )
    return fixtures
