# Welke bronnen we werkelijk gaan gebruiken

Datum: 14 september 2026 · Onderbouwing: GITHUB_DATA_SOURCE_RESEARCH.md en
CHECKJEBON_VALIDATION.md. Alleen gemeten resultaten, geen README-claims.

---

## Het besluit

**Geen enkele keten krijgt één bron die alles levert.** Dat was de aanname
waarmee deze fase begon en de meting heeft hem weerlegd: de bron met de beste
prijsdekking heeft geen voedingswaarden, geen promoties en geen GTIN, en de bron
met rijke productdata is een private mobiele endpoint met copyleft-implementaties.

De architectuur wordt daarom per **capability** samengesteld, niet per keten:

```
                          RECEPT
                            ↓
                  CANONIEK INGREDIENT
                            ↓
                   productmatching  ← conservatief, review-flow
                            ↓
   ┌────────────────────────┼────────────────────────┐
   │                        │                        │
Checkjebon              AH direct                 Lidl Plus
prijs + pakket          rijke metadata            aanbiedingen
AH/Jumbo/PLUS/…         (NOG NIET GEBOUWD)        (NOG NIET GEBOUWD)
   │                        │                        │
   └────────────────────────┼────────────────────────┘
                            ↓
                  genormaliseerde producten
                            ↓
                    package optimizer
                            ↓
                   supermarkt optimizer

NEVO            → canonieke nutrition (fallback)
Open Food Facts → optionele verrijking op GTIN (NIET bruikbaar zonder GTIN)
```

## Wat nu gebouwd is, en wat niet

| onderdeel                                       | status                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `PackageParser`                                 | **gebouwd**, getest op echte labels, gemeten over 107.611 producten |
| conservatieve matching naar canoniek ingredient | **gebouwd**, getest, gemeten                                        |
| Checkjebon als prijs/pakketbron                 | **gebouwd** als momentopname-provider                               |
| echte week door de optimizer                    | **werkt** — zie REAL_DATA_VALIDATION.md                             |
| AH directe provider                             | **niet gebouwd** — besluit hieronder                                |
| Lidl-aanbiedingen                               | **niet gebouwd** — alleen als kandidaat beschreven                  |
| Open Food Facts-verrijking                      | **niet gebouwd** — zonder GTIN kansloos                             |
| promoties uit echte data                        | **niet mogelijk** met de huidige bron                               |

---

## Per bron, met reden

### Checkjebon — GEBRUIKEN, als prijs- en pakketbron

De enige bron in dit onderzoek met een verdedigbare positie: MIT-licentie, en
de uitgever schrijft zelf _"may be reused in other projects"_. Dagelijks
bijgewerkt. Prijsdekking 100 %, pakketdekking bij AH 96,8 %.

Beperkingen die we **niet** wegpoetsen: geen GTIN, geen categorie, geen
promoties, geen voedingswaarden, geen filiaalprijzen, en geen tijdstempel per
product. Prijsscope is `CHAIN`, nooit `LOCATION`.

Lidl in deze dataset komt via `boodschaapje.nl` — tweedehands, met 75,7 %
ontbrekende maataanduiding en veel non-food. Bruikbaar als signaal, niet als
catalogus.

### AH via `api.ah.nl` — NOG NIET GEBRUIKEN, bewust

Dit is de enige route naar rijke productdata: voedingswaarden, EAN, Bonus,
filialen. Technisch werkt hij aantoonbaar — `appie-go` is actief onderhouden en
had gisteren nog een commit.

Drie redenen om hem nu niet te bouwen, in volgorde van gewicht:

1. **Het is een private mobiele endpoint**, benaderd met `client_id=appie-ios`
   — de identifier van AH's eigen app, niet van ons. Dat is geen beveiliging
   omzeilen en geen gelekte sleutel, maar het is ook geen officiële,
   gedocumenteerde API waarvan het gebruik ergens is toegestaan.
2. **De enige werkende implementaties zijn AGPL-3.0.** Zelf schrijven kan, maar
   dan zonder die code te lezen als blauwdruk.
3. **We hebben hem nog niet nodig.** De optimizer draait al op echte data zonder
   voedingswaarden en zonder promoties. Eerst de matching op orde brengen levert
   meer op dan een tweede bron toevoegen aan een matching die 1.409 producten
   in review heeft staan.

Als deze route later toch gewenst is, is dat een bewuste keuze over
gebruiksvoorwaarden en licentie — niet iets dat er stilzwijgend in rolt.

### Lidl Plus-aanbiedingen — KANDIDAAT voor `LidlPromotionProvider`

`stores.lidlplus.com` en `offers.lidlplus.com`, zonder login, met prijs, oude
prijs, korting, geldigheidsperiode en filialen met coördinaten. Apache-2.0
referentie-implementatie.

Alleen aanbiedingen, geen catalogus — en dat modelleren we eerlijk: Lidl zou een
`PromotionProvider` en een `StoreProvider` krijgen, en géén `CatalogProvider`.
Niet forceren dat elke keten dezelfde bronstructuur heeft.

### Jumbo — GEEN eigen provider

Precies zoals gehoopt: via Checkjebon is er prijsdata, dus directe scraping is
niet nodig. De prijs daarvan is dat 41,7 % van de Jumbo-producten geen
maataanduiding heeft en de bruikbare dekking daardoor op 39,3 % blijft steken.

### Open Food Facts — NIET NU

Zou nuttig zijn voor voedingswaarden en verpakkingsinfo, maar matcht betrouwbaar
alleen op GTIN. Checkjebon levert geen GTIN. Zonder GTIN blijft alleen fuzzy
matching op naam over, en dat is precies wat we net hebben afgeschaft omdat het
verkeerde producten koppelt. Zodra er een bron mét GTIN is, wordt dit meteen
interessant.

### NEVO — ONGEWIJZIGD

Blijft waar het hoort: generieke voedingswaarden per canoniek ingredient, als
fallback wanneer een product geen eigen etiketwaarden heeft. Niet voor prijs,
niet voor productidentiteit.

---

## Bronprioriteit

Vastgelegd zodat later altijd uit te leggen is waar een getal vandaan komt.

**Voedingswaarden**

1. geverifieerd etiket van het concrete product — nog geen bron voor
2. Open Food Facts op GTIN — nog geen GTIN
3. **canoniek ingredient (NEVO-stijl)** ← wat we vandaag gebruiken

**Prijzen**

1. directe, geverifieerde supermarktbron — nog niet gebouwd
2. **Checkjebon** ← wat we vandaag gebruiken
3. geen prijs — het product doet niet mee

**Nooit**: demo-prijzen stil mengen met echte prijzen. De modus is `REAL_ONLY`
of `SEED_ONLY`; er is geen stille tussenweg.

---

## GO / NO-GO per keten

Op basis van gemeten dekking, niet op basis van hoeveel producten er binnenkomen.

### Albert Heijn — **GO**

- 16.173 producten, 100 % prijs, 96,8 % leesbaar pakket
- 87,9 % van de benodigde ingrediënten heeft een kandidaat; 58,9 % is direct
  bruikbaar
- draait aantoonbaar end-to-end door de optimizer
- beste dekking van alle ketens, en de enige met een realistisch pad naar rijke
  data als dat later gewenst is

### Jumbo — **PARTIAL**

- 17.217 producten, 100 % prijs, maar **41,7 % zonder maataanduiding**
- bruikbare dekking 39,3 % — te laag om een week eerlijk op te prijzen
- geen eigen provider nodig of gewenst; verbetering moet van de bron komen of
  van pakketinformatie uit een tweede bron

### Lidl — **NO-GO als catalogus, PARTIAL als aanbiedingenbron**

- de 22.070 "Lidl-producten" zijn tweedehands via boodschaapje.nl, 75,7 % zonder
  maat, met veel non-food (sokken, autostoelkussens, kerstverlichting)
- als catalogusbron ongeschikt
- de Lidl Plus-aanbiedingenroute is wél gericht bruikbaar, maar dekt per definitie
  alleen acties

---

## Wat de volgende stap moet zijn

Niet een tweede keten. **De matching bij AH.**

1.409 AH-producten staan op review en 18 ingrediënten hebben nergens een
bruikbaar product terwijl het product aantoonbaar bestaat — het heet alleen
anders. Aliassen toevoegen en de reviewflow doorlopen tilt de bruikbare dekking
van 58,9 % richting de 87,9 % die al gematcht is. Dat is meer winst dan welke
extra bron ook, en het kost geen enkele nieuwe afhankelijkheid.

Pas daarna is de vraag "AH direct of Lidl-aanbiedingen erbij" de moeite waard.
