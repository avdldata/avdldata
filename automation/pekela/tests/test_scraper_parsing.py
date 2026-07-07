"""Tests the text-parsing logic in scraper.py against synthetic snippets in
the same style as the club's own posters. Does not touch the network — the
selector-matching half of scraper.py (_extract_rows) can only be verified
against real HTML once that's captured via tools/dump_html.py.

Blocks are written with each field on its own line, matching how
BeautifulSoup's get_text("\\n") renders separate block-level elements —
which is the realistic shape given the reference posters visually show date,
time+venue, and the match-up as distinct lines.
"""
import conftest  # noqa: F401  (sets up sys.path)
from datetime import date

from scraper import _parse_block


def test_parses_full_block_with_all_fields():
    text = "zaterdag 9 mei\n12:00 Sportpark Loppersum\nSC Loppersum 2 - VV Pekela 2"
    fx = _parse_block(text, today=date(2026, 4, 1))
    assert fx is not None
    assert fx.match_date == date(2026, 5, 9)
    assert fx.time == "12:00"
    assert fx.venue == "Sportpark Loppersum"
    assert fx.home_team == "SC Loppersum 2"
    assert fx.away_team == "VV Pekela 2"


def test_parses_two_word_venue():
    text = "zondag 10 mei\n10:00 Sportpark de Goorns\nGieten 3 - VV Pekela 2"
    fx = _parse_block(text, today=date(2026, 4, 1))
    assert fx is not None
    assert fx.venue == "Sportpark de Goorns"
    assert fx.home_team == "Gieten 3"
    assert fx.away_team == "VV Pekela 2"


def test_parses_block_without_time_or_venue():
    text = "zondag 10 mei\nGieten 3 - VV Pekela 2"
    fx = _parse_block(text, today=date(2026, 4, 1))
    assert fx is not None
    assert fx.time is None
    assert fx.venue is None
    assert fx.home_team == "Gieten 3"
    assert fx.away_team == "VV Pekela 2"


def test_returns_none_without_a_date():
    assert _parse_block("SC Loppersum 2 - VV Pekela 2", today=date(2026, 4, 1)) is None


def test_returns_none_without_teams():
    assert _parse_block("zondag 10 mei 10:00 Sportpark de Goorns", today=date(2026, 4, 1)) is None


def test_year_rolls_over_season_boundary():
    text = "zaterdag 10 januari\n12:00 Sportpark Test\nVV Pekela 1 - SC Loppersum 1"
    fx = _parse_block(text, today=date(2026, 12, 1))
    assert fx is not None
    assert fx.match_date == date(2027, 1, 10)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
