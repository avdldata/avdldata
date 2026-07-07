import smtplib
from email.message import EmailMessage
from pathlib import Path

import config


def _run_url() -> str:
    if config.GITHUB_REPOSITORY and config.GITHUB_RUN_ID:
        return f"https://github.com/{config.GITHUB_REPOSITORY}/actions/runs/{config.GITHUB_RUN_ID}"
    return ""


def _send(subject: str, body: str, attachments: list[Path] | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = config.GMAIL_ADDRESS
    msg["To"] = config.EMAIL_TO
    msg["Subject"] = subject
    msg.set_content(body)

    for path in attachments or []:
        data = path.read_bytes()
        msg.add_attachment(data, maintype="image", subtype="png", filename=path.name)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
        smtp.send_message(msg)


def send_success_email(isoweek: int, attachments: list[Path], warnings: list[str]) -> None:
    body = "De programma-posters van deze week zijn bijgevoegd."
    if warnings:
        body += "\n\nLet op:\n" + "\n".join(f"- {w}" for w in warnings)
    _send(f"VV Pekela programma - week {isoweek}", body, attachments)


def send_empty_week_email(category_label: str) -> None:
    _send(
        f"VV Pekela programma - geen wedstrijden ({category_label})",
        f"Er staan deze week geen {category_label.lower()}-wedstrijden gepland. Geen poster nodig.",
    )


def send_failure_email(reason: str, details: str = "") -> None:
    body = f"De wekelijkse poster-run is mislukt.\n\nReden: {reason}\n"
    if details:
        body += f"\nDetails:\n{details}\n"
    run_url = _run_url()
    if run_url:
        body += f"\nActions-run: {run_url}\n"
    _send("VV Pekela programma - FOUT bij genereren", body)
