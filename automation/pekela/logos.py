import hashlib
import json
import re
from pathlib import Path

LOGOS_DIR = Path(__file__).parent / "logos"
ALIASES_PATH = LOGOS_DIR / "aliases.json"

# Palette used to derive a stable placeholder color per club when no logo exists yet.
PLACEHOLDER_PALETTE = [
    (211, 47, 47), (25, 118, 210), (56, 142, 60), (251, 140, 0),
    (123, 31, 162), (0, 121, 107), (191, 54, 12), (48, 63, 159),
]

_STRIP_SUFFIX = re.compile(
    r"\s*(\d+|VR\d+|[JMO]O?\d{1,2}(-\d+)?|45\+\d*|35\+\d*)$", re.IGNORECASE
)


def slugify(name: str) -> str:
    cleaned = _STRIP_SUFFIX.sub("", name).strip()
    slug = re.sub(r"[^a-z0-9]+", "-", cleaned.lower()).strip("-")
    return slug


def _load_aliases() -> dict[str, str]:
    if ALIASES_PATH.exists():
        return json.loads(ALIASES_PATH.read_text())
    return {}


def resolve_logo_path(team_name: str) -> Path | None:
    aliases = _load_aliases()
    slug = aliases.get(team_name.lower(), slugify(team_name))
    candidate = LOGOS_DIR / f"{slug}.png"
    return candidate if candidate.exists() else None


def placeholder_color(slug: str) -> tuple[int, int, int]:
    idx = int(hashlib.sha1(slug.encode()).hexdigest(), 16) % len(PLACEHOLDER_PALETTE)
    return PLACEHOLDER_PALETTE[idx]


def initials(team_name: str) -> str:
    cleaned = _STRIP_SUFFIX.sub("", team_name).strip()
    words = [w for w in re.split(r"\s+", cleaned) if w]
    letters = "".join(w[0] for w in words if w[0].isalpha())
    return (letters or cleaned[:2]).upper()[:3]
