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
