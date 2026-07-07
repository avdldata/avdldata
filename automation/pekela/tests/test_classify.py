import conftest  # noqa: F401  (sets up sys.path)
from datetime import date

from classify import classify, is_recognized, split
from models import Fixture


def _fx(home: str, away: str = "Opponent 1") -> Fixture:
    return Fixture(date(2026, 5, 9), "14:30", "Sportpark Test", home, away)


def test_youth_prefixes_classify_as_jeugd():
    for name in ["VV Pekela JO19-1", "VV Pekela JO8-2", "SC Loppersum MO15-1", "Meeden O10-1"]:
        assert classify(_fx(name)) == "jeugd", name


def test_senior_plain_team_classifies_as_senioren():
    assert classify(_fx("VV Pekela 2")) == "senioren"
    assert classify(_fx("VV Pekela 1")) == "senioren"


def test_veterans_and_women_classify_as_senioren():
    assert classify(_fx("VV Pekela 45+1")) == "senioren"
    assert classify(_fx("VV Pekela VR1")) == "senioren"
    assert classify(_fx("VV Pekela Dames 1")) == "senioren"


def test_unrecognized_name_defaults_to_senioren_but_flagged():
    fx = _fx("Onbekende Club", "Ander Team")
    assert classify(fx) == "senioren"
    assert is_recognized(fx) is False


def test_split_buckets_and_flags_unclassified():
    fixtures = [
        _fx("VV Pekela 1", "SC Loppersum 2"),
        _fx("VV Pekela JO17-1", "Veendam 1894 JO17-1"),
        _fx("Onbekende Club", "Ook Onbekend"),
    ]
    senioren, jeugd, unclassified = split(fixtures)
    assert len(senioren) == 2
    assert len(jeugd) == 1
    assert len(unclassified) == 1


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
