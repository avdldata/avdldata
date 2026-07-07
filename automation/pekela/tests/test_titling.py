import conftest  # noqa: F401  (sets up sys.path)
from datetime import date

from models import Fixture
from titling import build_title


def _fx(d: date) -> Fixture:
    return Fixture(d, "14:30", "Sportpark Test", "Team A", "Team B")


def test_single_week_uses_week_label():
    fixtures = [_fx(date(2026, 5, 9)), _fx(date(2026, 5, 10))]
    line1, line2 = build_title(fixtures, "SENIOREN")
    assert line1 == "PROGRAMMA SENIOREN"
    assert line2 == f"WEEK {date(2026, 5, 9).isocalendar()[1]}"


def test_multi_week_uses_date_range():
    fixtures = [_fx(date(2026, 5, 9)), _fx(date(2026, 5, 20))]
    line1, line2 = build_title(fixtures, "JEUGD")
    assert line1 == "PROGRAMMA JEUGD"
    assert line2 == "9 MEI T/M 20 MEI"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
