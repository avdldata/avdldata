import conftest  # noqa: F401  (sets up sys.path)
from datetime import date

from classify import classify, is_excluded, is_recognized, split
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


def test_18plus_women_and_35_45plus_men_are_excluded():
    for name in ["VV Pekela 45+1", "VV Pekela 35+ 1", "VV Pekela VR18+ 1", "VV Pekela Vrouwen 18+ 1"]:
        assert is_excluded(_fx(name)), name
        # also when it's only the opponent that is an excluded team
        assert is_excluded(_fx("VV Pekela 1", name)), name


def test_regular_senior_women_and_men_are_not_excluded():
    for name in ["VV Pekela 1", "VV Pekela VR1", "VV Pekela Dames 1", "VV Pekela JO19-1", "Meeden 145"]:
        assert not is_excluded(_fx(name)), name


def test_real_programma_2_t_m_4_oktober():
    """Team names copied from the club's own week-40 programme: the 13 Friday
    18+/35+/45+ matches must go, the 5 regular weekend matches must stay."""
    excluded = [
        ("Bareveld VR18+1", "VV Pekela VR18+1"), ("VV Pekela 45+1", "Wildervank 45+1"),
        ("VV Pekela 45+1", "Pekelder Boys 45+1"), ("VV Pekela VR18+2", "Pekelder Boys VR18+1"),
        ("Westerwolde 35+1", "VV Pekela 35+1"), ("Bareveld 45+1", "VV Pekela 45+1"),
        ("Onstwedder Boys 35+1", "VV Pekela 35+1"), ("VV Pekela VR18+1", "Wildervank VR18+1"),
        ("VV Pekela VR18+2", "Bareveld VR18+1"), ("VV Pekela 35+1", "Noordster 35+1"),
        ("VV Pekela VR18+1", "Pekelder Boys VR18+1"), ("VV Pekela VR18+2", "Wildervank VR18+1"),
        ("VV Pekela VR18+2", "VV Pekela VR18+1"),
    ]
    kept = [
        ("VV Pekela 2", "Noordscheschut 3"), ("VV Pekela 1", "SJS 1"), ("BATO VR1", "VV Pekela VR2"),
        ("VV Pekela 4", "SPW 2"), ("VV Pekela 2 (ZON)", "Alteveer 2 (ZON)"),
    ]
    senioren, jeugd, unclassified = split([_fx(h, a) for h, a in excluded + kept])
    assert [(f.home_team, f.away_team) for f in senioren] == kept
    assert jeugd == [] and unclassified == []


def test_split_drops_excluded_fixtures_from_every_list():
    fixtures = [
        _fx("VV Pekela 1", "SC Loppersum 2"),
        _fx("VV Pekela 45+1", "Gieten 45+1"),
        _fx("VV Pekela VR18+ 1", "Meeden VR18+ 1"),
        _fx("VV Pekela JO17-1", "Veendam 1894 JO17-1"),
    ]
    senioren, jeugd, unclassified = split(fixtures)
    assert [f.home_team for f in senioren] == ["VV Pekela 1"]
    assert len(jeugd) == 1
    assert unclassified == []


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok: {name}")
