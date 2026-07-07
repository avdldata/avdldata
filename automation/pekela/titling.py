from models import Fixture

MONTHS_NL = {
    1: "JANUARI", 2: "FEBRUARI", 3: "MAART", 4: "APRIL", 5: "MEI", 6: "JUNI",
    7: "JULI", 8: "AUGUSTUS", 9: "SEPTEMBER", 10: "OKTOBER", 11: "NOVEMBER", 12: "DECEMBER",
}


def build_title(fixtures: list[Fixture], category_label: str) -> tuple[str, str]:
    """Returns (line1, line2) for the poster header.

    line2 is one deterministic rule: "WEEK N" if every fixture falls in the
    same ISO week, otherwise a date range "D MONTH T/M D MONTH".
    """
    line1 = f"PROGRAMMA {category_label}"
    dates = sorted(f.match_date for f in fixtures)
    first, last = dates[0], dates[-1]
    if first.isocalendar()[1] == last.isocalendar()[1] and first.year == last.year:
        line2 = f"WEEK {first.isocalendar()[1]}"
    else:
        line2 = f"{first.day} {MONTHS_NL[first.month]} T/M {last.day} {MONTHS_NL[last.month]}"
    return line1, line2
