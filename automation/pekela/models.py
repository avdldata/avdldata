from dataclasses import dataclass
from datetime import date


@dataclass
class Fixture:
    match_date: date
    time: str | None
    venue: str | None
    home_team: str
    away_team: str
