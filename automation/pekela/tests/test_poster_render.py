import conftest  # noqa: F401  (sets up sys.path)
from datetime import date

from models import Fixture
from poster import WIDTH, render_poster


def _fixtures(n: int) -> list[Fixture]:
    return [
        Fixture(date(2026, 5, 9), "14:30", "Sportpark Test", f"Team Home {i}", f"Team Away {i}")
        for i in range(n)
    ]


def test_renders_at_minimum_row_count():
    img, missing = render_poster(_fixtures(2), "SENIOREN")
    assert img.size[0] == WIDTH
    assert img.size[1] > 0
    assert len(missing) == 4  # 2 fixtures x 2 teams, no logos in the test library


def test_renders_at_high_row_count_without_error():
    img, _ = render_poster(_fixtures(7), "JEUGD")
    assert img.size[0] == WIDTH
    # more rows should always produce a taller canvas than fewer rows
    img_small, _ = render_poster(_fixtures(2), "JEUGD")
    assert img.size[1] > img_small.size[1]


def test_long_team_name_does_not_crash():
    fixtures = [Fixture(date(2026, 5, 9), "14:30", "Sportpark Test",
                         "Een Heel Erg Lange Teamnaam FC 1", "Nog Een Lange Naam SV 2")]
    img, _ = render_poster(fixtures, "SENIOREN")
    assert img.size[0] == WIDTH


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
