import os

SOURCE_URL = "https://www.vvpekela.nl/316/programma-komende-week/"

EMAIL_TO = os.environ.get("EMAIL_TO", "arjanvanderlaaan@gmail.com")
GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
GITHUB_RUN_ID = os.environ.get("GITHUB_RUN_ID", "")
