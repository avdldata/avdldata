"""Bulk-populate the logo library from Wikipedia, for amateur football clubs in
Groningen, Friesland and Drenthe.

NOT TESTED against the live internet: this development sandbox has no general
network access (confirmed 403 even for wikipedia.org), so this script is
written against the documented MediaWiki API but must be run and spot-checked
for real before being trusted — e.g. via a manual GitHub Actions
`workflow_dispatch` run, or locally.

Approach: for each Wikipedia category of football clubs by province, list the
category's member articles, then ask the "pageimages" API for each article's
page image — for Dutch football club articles this is reliably the infobox
club logo. Downloaded as logos/<slug>.png, with the article title (and a
lowercased alias) recorded in aliases.json so scraper output can resolve to it.

Usage: python tools/bulk_fetch_logos.py [--dry-run]
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))
from logos import LOGOS_DIR, ALIASES_PATH, slugify  # noqa: E402

API = "https://nl.wikipedia.org/w/api.php"
CATEGORIES = [
    "Categorie:Voetbalclub in Groningen (provincie)",
    "Categorie:Voetbalclub in Friesland",
    "Categorie:Voetbalclub in Drenthe",
]
USER_AGENT = "VVPekelaPosterBot/1.0 (informational, non-commercial logo lookup)"


def _get(params: dict) -> dict:
    params = {**params, "format": "json"}
    resp = requests.get(API, params=params, headers={"User-Agent": USER_AGENT}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def category_members(category: str) -> list[str]:
    titles = []
    cmcontinue = None
    while True:
        params = {"action": "query", "list": "categorymembers", "cmtitle": category, "cmlimit": 500}
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        data = _get(params)
        titles += [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break
    return titles


def page_image_url(title: str) -> str | None:
    data = _get({
        "action": "query", "titles": title, "prop": "pageimages", "piprop": "original",
    })
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        original = page.get("original")
        if original:
            return original.get("source")
    return None


def main(dry_run: bool = False) -> None:
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    aliases = json.loads(ALIASES_PATH.read_text()) if ALIASES_PATH.exists() else {}

    all_titles: set[str] = set()
    for cat in CATEGORIES:
        found = category_members(cat)
        print(f"{cat}: {len(found)} clubs")
        all_titles.update(found)

    fetched, skipped, failed = 0, 0, 0
    for title in sorted(all_titles):
        clean_title = re.sub(r"\s*\(.*?\)\s*$", "", title).strip()
        slug = slugify(clean_title)
        dest = LOGOS_DIR / f"{slug}.png"
        aliases[title.lower()] = slug
        aliases[clean_title.lower()] = slug

        if dest.exists():
            skipped += 1
            continue

        try:
            img_url = page_image_url(title)
            if not img_url:
                failed += 1
                print(f"  no image found: {title}")
                continue
            if dry_run:
                print(f"  would fetch: {title} <- {img_url}")
                continue
            img_resp = requests.get(img_url, headers={"User-Agent": USER_AGENT}, timeout=15)
            img_resp.raise_for_status()
            dest.write_bytes(img_resp.content)
            fetched += 1
            print(f"  fetched: {title} -> {dest.name}")
        except requests.RequestException as exc:
            failed += 1
            print(f"  failed: {title} ({exc})")

    if not dry_run:
        ALIASES_PATH.write_text(json.dumps(aliases, indent=2, ensure_ascii=False, sort_keys=True))

    print(f"\nDone. fetched={fetched} skipped(existing)={skipped} failed={failed}")
    print("Spot-check the downloaded logos before relying on them — automatic "
          "name matching occasionally grabs the wrong page image.")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
