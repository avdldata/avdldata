import sys
import traceback
from pathlib import Path

import classify
import config
import email_sender
import scraper
from poster import render_poster

OUT_DIR = Path(__file__).parent


def _isoweek(fixtures) -> int:
    return min(fx.match_date for fx in fixtures).isocalendar()[1]


def run() -> None:
    html = scraper.fetch_html(config.SOURCE_URL)
    fixtures = scraper.parse_fixtures(html)

    if not fixtures:
        email_sender.send_empty_week_email("senioren en jeugd")
        return

    senioren, jeugd, unclassified = classify.split(fixtures)

    warnings = []
    if unclassified:
        names = ", ".join(f"{fx.home_team} - {fx.away_team}" for fx in unclassified)
        warnings.append(f"Niet herkende teamnamen (als senioren behandeld): {names}")

    attachments = []
    for label, group in (("senioren", senioren), ("jeugd", jeugd)):
        if not group:
            continue
        img, missing_logos = render_poster(group, label.upper())
        out_path = OUT_DIR / f"poster_{label}.png"
        img.save(out_path)
        attachments.append(out_path)
        if missing_logos:
            warnings.append(f"Ontbrekende logo's ({label}): {', '.join(sorted(set(missing_logos)))}")

    if not attachments:
        email_sender.send_empty_week_email("senioren en jeugd")
        return

    isoweek = _isoweek(fixtures)
    email_sender.send_success_email(isoweek, attachments, warnings)


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        traceback.print_exc()
        try:
            email_sender.send_failure_email(str(exc), traceback.format_exc()[-2000:])
        except Exception:
            print("Also failed to send the failure-notification email:", file=sys.stderr)
            traceback.print_exc()
        sys.exit(1)
