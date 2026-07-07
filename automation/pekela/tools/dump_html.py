"""One-off: fetch the live vvpekela.nl schedule page and save it, so scraper.py's
selectors can be developed/verified against real markup instead of guesswork.

Run this from an environment with real internet access (GitHub Actions via
workflow_dispatch, or a normal dev machine) — not from this project's
development sandbox, which has no general network access.

Usage: python tools/dump_html.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from scraper import URL, fetch_html  # noqa: E402

OUT_PATH = Path(__file__).parent.parent / "tests" / "fixtures" / "sample_programma.html"

if __name__ == "__main__":
    html = fetch_html(URL)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(html, encoding="utf-8")
    print(f"Saved {len(html)} bytes to {OUT_PATH}")
