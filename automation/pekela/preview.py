from datetime import date

from models import Fixture
from poster import render_poster

SENIOREN_SAMPLE = [
    Fixture(date(2026, 5, 9), "12:00", "SPORTPARK LOPPERSUM", "SC Loppersum 2", "VV Pekela 2"),
    Fixture(date(2026, 5, 9), "12:30", "SPORTPARK BURG. BOEKHOVEN", "VV Pekela 4", "Wagenborger Boys 2"),
    Fixture(date(2026, 5, 9), "14:30", "SPORTPARK D'OOSTERD", "SC Scheemda 1", "VV Pekela 1"),
    Fixture(date(2026, 5, 9), "14:30", "SPORTPARK BURG. BOEKHOVEN", "VV Pekela 3", "Meeden 2"),
    Fixture(date(2026, 5, 10), "10:00", "SPORTPARK DE GOORNS", "Gieten 3", "VV Pekela 2"),
]

JEUGD_SAMPLE = [
    Fixture(date(2026, 5, 9), "09:00", "SPORTPARK BURG. BOEKHOVEN", "VV Pekela JO19-1", "Veendam 1894 JO19-1"),
    Fixture(date(2026, 5, 9), "10:30", "SPORTPARK BURG. BOEKHOVEN", "VV Pekela JO15-1", "SC Loppersum JO15-1"),
    Fixture(date(2026, 5, 9), "11:00", "SPORTPARK DE GOORNS", "VV Pekela MO17-1", "Wildervank MO17-1"),
]

if __name__ == "__main__":
    render_poster(SENIOREN_SAMPLE, "SENIOREN").save("preview_senioren.png")
    render_poster(JEUGD_SAMPLE, "JEUGD").save("preview_jeugd.png")
    print("done")
