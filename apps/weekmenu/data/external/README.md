# Externe momentopnames

Hier komen momentopnames van externe databronnen te staan. Ze worden **niet**
meegecommit: elk bestand is ruim 10 MB, het verandert dagelijks, en het is met
één commando opnieuw op te halen.

## Checkjebon

Prijs- en verpakkingsdata voor een stuk of tien Nederlandse ketens. MIT
gelicentieerd, en de uitgever schrijft expliciet dat de data in andere projecten
hergebruikt mag worden.

```bash
curl -L -o data/external/checkjebon-snapshot.json \
  https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json
```

Daarna:

```bash
pnpm data:probe      # datakwaliteit per keten
pnpm data:coverage   # dekking van onze eigen receptcatalogus
pnpm data:week       # een echte week door de optimizer, in schaduwmodus
```

De datum van de momentopname is de commitdatum van dat bestand in de
Checkjebon-repository; de data zelf bevat geen tijdstempel per product. Wat dat
betekent voor versheid staat in `../../CHECKJEBON_VALIDATION.md`.

## PrijsProfeet

Aanbiedingen van Albert Heijn en Jumbo. **Niet meegecommit**, om twee redenen:
het bestand is ruim 11 MB en de gebruiksvoorwaarden van de gratis laag verbieden
expliciet het bouwen van een volledige databasekopie. Een werkmomentopname van
één folderperiode is iets anders dan zo'n kopie, maar hij hoort niet in een
repository thuis.

Zet een export neer als `data/external/promotions-snapshot.json` en lees hem in:

```bash
pnpm promo:import data/external/promotions-snapshot.json
```

Dat valideert het bestand, telt wat erin zit, koppelt het aan onze producten en
schrijft een rapport naar `promotions-import-report.json`. Daarna:

```bash
pnpm promo:prices    # normale prijs tegenover Checkjebon
pnpm promo:bench     # 50 weken, promoties aan tegenover uit
```

De momentopname waarop `PROMOTION_VALUE_BENCHMARK.md` deel B gebaseerd is:
5.190 records (3.052 AH, 2.138 Jumbo), opgehaald 2026-09-15T14:25+02:00,
folderperiode 9 t/m 22 september 2026.

Bronvermelding is verplicht op de gratis laag en staat in
`src/services/promotions/attribution.ts`. Het veldcontract staat in
`../../PRIJSPROFEET_SNAPSHOT_SCHEMA.md`.

## PrijsProfeet — schapdata

Gewone schapprijzen, geen aanbiedingen. Ze dragen een EAN en een stabiele
sleutel voor producten die **niet** in de folder staan, en dat is de enige reden
om ze op te halen. Ook niet meegecommit, om dezelfde twee redenen als hierboven.

Ophalen op een Windows-machine:

```powershell
cd <repo>\apps\weekmenu
.\scripts\fetch-shelf-snapshot.ps1
```

Inlezen:

```bash
pnpm shelf:import data/external/shelf-snapshot.json
```

Dat valideert, herkent de schaprecords, bouwt de identity crosswalk en schrijft
hem naar `identity-crosswalk.json`. Wat dat oplevert — en wat niet — staat in
`../../IDENTITY_BRIDGE.md`.

**Een schaprecord wordt nooit een korting.** Het krijgt een ander type en geen
enkele stap stroomafwaarts van de promotie-engine accepteert dat type.
