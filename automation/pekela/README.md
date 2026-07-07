# VV Pekela — wekelijkse programma-posters

Genereert elke donderdag automatisch twee posters (senioren, jeugd) met het
wedstrijdprogramma van vvpekela.nl, en mailt ze naar de ingestelde ontvanger.
Draait via `.github/workflows/pekela-poster.yml` (cron + handmatige
`workflow_dispatch`).

## Hoe het werkt
1. `scraper.py` haalt `programma-komende-week` op en zet elke wedstrijd om in
   een `Fixture`.
2. `classify.py` verdeelt de wedstrijden in senioren (mannen, vrouwen,
   veteranen) en jeugd (JO/MO/O-teams), op basis van de teamnaam.
3. `poster.py` tekent per groep een PNG (Pillow) met de kleuren/het patroon
   van de club's eigen Canva-ontwerp, dynamisch geschaald voor elk aantal
   wedstrijden.
4. `email_sender.py` verstuurt de posters (of een foutmelding / "geen
   wedstrijden"-bericht) via Gmail.

## Eenmalige setup
1. **Gmail app-wachtwoord**: zet 2FA aan op het verzendende Gmail-account,
   maak een [app-wachtwoord](https://myaccount.google.com/apppasswords) aan.
2. **GitHub secrets/variables** (repo Settings → Secrets and variables →
   Actions):
   - Secret `GMAIL_ADDRESS` — het verzendende adres.
   - Secret `GMAIL_APP_PASSWORD` — het app-wachtwoord.
   - Variable `EMAIL_TO` — ontvanger (standaard: arjanvanderlaaan@gmail.com,
     zie `config.py`).
3. **Logo-bibliotheek vullen**: `python tools/bulk_fetch_logos.py` haalt
   logo's van Wikipedia voor clubs in Groningen/Friesland/Drenthe. Dit script
   is nog niet getest tegen het echte internet (de ontwikkel-sandbox had geen
   netwerktoegang) — draai het dus voor het eerst vanaf een omgeving met
   internet, en controleer daarna kort visueel of de gedownloade logo's
   kloppen (`automation/pekela/logos/`). Ontbrekende/foute logo's kun je
   gewoon zelf vervangen: sla een vierkante PNG op als
   `logos/<club-slug>.png` (zie `logos.py:slugify()` voor de naamgeving).
4. **Scraper verifiëren tegen de echte pagina**: draai
   `python tools/dump_html.py` (ook vanaf een omgeving met internet) om de
   live pagina op te slaan onder `tests/fixtures/sample_programma.html`, en
   pas zo nodig de selectors in `scraper.py` aan.
5. **Eerste run controleren**: trigger de workflow handmatig via
   `workflow_dispatch` in de Actions-tab, controleer de geüploade
   poster-artifacts en de ontvangen e-mail, voordat je op de wekelijkse cron
   vertrouwt.

## Lokaal ontwikkelen / testen
- `python preview.py` rendert twee voorbeeldposters met verzonnen data (geen
  netwerk nodig) naar `preview_senioren.png` / `preview_jeugd.png`.
- `cd tests && python test_*.py` draait de unit tests (classificatie,
  titel-logica, scraper-parsing, poster-rendering) — allemaal zonder netwerk.
