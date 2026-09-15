# De identity bridge: gebouwd, gemeten, en niet de bottleneck

## De uitkomst in één alinea

De vorige fase mat € 0,32 promotievoordeel per week en noemde een verdachte:
van 5.190 aanbiedingen raken er 52 een product dat wij kunnen kopen, dús moet
productidentiteit de beperking zijn. **Dat is getoetst en het klopt niet.** De
brug is gebouwd, hij werkt, hij verrijkt 56 producten met een EAN én een
`base_product_id` met 100 % precision — en hij levert **nul extra
promotiekoppelingen** op. 52 voor, 52 na.

Reproduceren:

```bash
pnpm identity:gap                                  # de trechter, stap voor stap
pnpm shelf:import -- --promotions-only             # de crosswalk uit wat er is
pnpm shelf:import data/external/shelf-snapshot.json # met echte schapdata
```

---

## 1. De trechter, gemeten

| populatie                             |     AH |  Jumbo |              samen |
| ------------------------------------- | -----: | -----: | -----------------: |
| Checkjebon-producten                  | 16.173 | 17.217 |         **33.390** |
| met winkelartikelnummer               | 16.173 | 17.217 | 33.390 (**100 %**) |
| waarvan in de promotiemomentopname    |  1.575 |  1.961 |              3.536 |
|                                       |        |        |                    |
| koopbaar (gematcht op een ingrediënt) |    536 |    486 |          **1.022** |
| met winkelartikelnummer               |    536 |    486 |  1.022 (**100 %**) |
| met EAN                               |      0 |      0 |                  0 |
| met `base_product_id`                 |      0 |      0 |                  0 |
| **exact koppelbaar aan een promotie** | **28** | **28** |             **56** |
| geen promotie beschikbaar             |    508 |    458 |                966 |
|                                       |        |        |                    |
| na kandidaatreductie                  |    345 |    314 |                659 |
| exact koppelbaar aan een promotie     |     17 |     13 |                 30 |

Lees die tabel van onder naar boven en de vraag beantwoordt zichzelf. Van onze
1.022 koopbare producten hebben er **1.022 een winkelartikelnummer**, en van de
5.190 aanbiedingen hebben er **5.190** er een. Er ontbreekt geen identiteit. Wat
ontbreekt is overlap: 966 van onze producten staan gewoon niet in de folder.

## 2. Waarom EAN en base_product_id niets toevoegen

Drie metingen, elk reproduceerbaar met `pnpm identity:gap`.

**Het artikelnummer is 100 % aanwezig aan beide kanten.** Uit de Checkjebon-slug
en uit PrijsProfeets `product_url`, voor elk record van beide bronnen. Binnen één
keten is dat nummer uniek. Een tweede identificator kan dan alleen hetzelfde
zeggen.

**`base_product_id` ís het artikelnummer.** In 5.190 van 5.190 records
(**100,00 %**) is de waarde letterlijk `<keten>_<artikelnummer>`:

```
product_url        https://www.ah.nl/producten/product/wi589397/hertog-jan-…
base_product_id    ah_wi589397
product_id         ah_wi589397_2026-09-14      ← plus de folderdatum
```

De "stabiele keteninterne sleutel" die de documentatie belooft is dus geen
eigen identiteit maar dezelfde identiteit met een voorvoegsel. Dat is geen
kritiek op de bron — het is een prima sleutel — maar het betekent dat ernaartoe
bruggen niets oplevert wat het artikelnummer niet al gaf.

**De EAN kan in theorie één ding toevoegen, en dat is zeldzaam.** Namelijk een
hernummerd artikel: één EAN op twee artikelnummers, zodat onze catalogus het
oude nummer draagt en de folder het nieuwe. In de momentopname gebeurt dat bij
**87 van 4.601 EAN's (1,9 %)**, en dan nog alleen als wij toevallig de andere
kant van het paar hebben. Dat is de bovengrens van de hele exercitie.

## 3. Wat de brug wél is

Gebouwd en getest, want hij is niet waardeloos — hij is alleen geen oplossing
voor dít probleem.

|                          |                                                                          |
| ------------------------ | ------------------------------------------------------------------------ |
| `ExternalRetailIdentity` | één product zoals beide bronnen het noemen, met herkomst                 |
| tiers                    | `RETAILER_ARTICLE_ID` → `RETAILER_URL` → `EAN` → `NAME_PACKAGE` → review |
| geen numerieke fallback  | `74004PAK` ≠ `74004DSL`, permanent vastgelegd in een test                |
| ambigu                   | geweigerd, niet opgelost                                                 |
| conflicterend            | twee EAN's op één artikel: allebei weg                                   |
| opslag                   | `data/external/identity-crosswalk.json`                                  |

Resultaat op de huidige data:

| keten | producten | records | art.id | url | EAN | naam+maat | review | ambigu | conflict |
| ----- | --------: | ------: | -----: | --: | --: | --------: | -----: | -----: | -------: |
| ah    |       536 |   3.052 |     28 |   0 |   0 |         0 |      0 |      0 |        0 |
| jumbo |       486 |   2.138 |     28 |   0 |   0 |         0 |      0 |      0 |        0 |

**56 producten verrijkt, alle 56 met de hand gecontroleerd: 56 CORRECT, 0 WRONG,
0 AMBIGUOUS — precision 100 %.** In alle 56 gevallen is de productnaam aan beide
kanten teken voor teken identiek en de verpakking gelijk waar beide bronnen er
een noemen. Dat is geen toeval: een koppeling op een exact, uniek
winkelartikelnummer is een gelijkheidstest, geen gelijkenis.

De opdracht vroeg om 100 AH- en 100 Jumbo-links. Er zijn er 56 in totaal; dat is
de hele populatie, niet een steekproef eruit.

### Promotiekoppelingen, voor en na

| keten | variant          | stable id | winkel-id | EAN | naam+maat | toegepast |
| ----- | ---------------- | --------: | --------: | --: | --------: | --------: |
| ah    | zonder crosswalk |         0 |        28 |   0 |         0 |    **28** |
| ah    | met crosswalk    |        28 |         0 |   0 |         0 |    **28** |
| jumbo | zonder crosswalk |         0 |        28 |   0 |         0 |    **24** |
| jumbo | met crosswalk    |        28 |         0 |   0 |         0 |    **24** |

De koppelingen verhuizen van tier 1 naar tier 0 — waar ze thuishoren, want een
artikelnummer kan heruitgegeven worden en een base id heet permanent — maar het
aantal verandert niet. **52 → 52. 1,0 % van 5.190, voor en na.**

## 4. Wat schapdata dan nog oplevert

De brug is gebouwd op wat er nu ligt: de promotiemomentopname draagt de
identiteiten van de 3.536 producten die deze folderweek in de aanbieding zijn.
Een schapmomentopname zou die van de andere 29.854 toevoegen.

Dat is niet nutteloos, maar het verplaatst de grens niet:

- **wél**: een product dat vandaag niet in de folder staat krijgt alvast een EAN
  en een stabiele sleutel, zodat volgende week de koppeling op tier 0 begint in
  plaats van op tier 1;
- **wél**: een echte prijsvergelijking over de hele catalogus in plaats van over
  52 producten (zie `PRICE_SOURCE_COMPARISON.md`);
- **niet**: meer promotiekoppelingen. Dat aantal wordt bepaald door hoeveel van
  onze 1.022 koopbare producten in de folder staan, en dat verandert niet door
  ze beter te kennen.

Het ophaalscript staat klaar: `scripts/fetch-shelf-snapshot.ps1`.

## 5. Wat de bottleneck wél is

```
33.390  AH- en Jumbo-producten in Checkjebon
 1.022  daarvan koopbaar: gematcht op een van onze 50 ingrediënten   3,1 %
    56  daarvan deze week in de folder                               5,5 %
    52  waarvan de aanbieding ook te modelleren is
   0,6  belanden gemiddeld in een weekmandje
```

De eerste stap is de vernauwing: **96,9 % van de catalogus valt af omdat we er
geen recept voor hebben**, niet omdat we niet weten wat het is. En de tweede
stap valt tegen omdat de folder scheef ligt: 28,3 % van alle aanbiedingen is
non-food, en verse groente, vlees en vis samen zijn 6,0 %.

Dat is één meting met twee gevolgen voor de volgorde van werken:

1. **receptuitbreiding is de hefboom, niet identity resolution.** Elk nieuw
   ingrediënt vergroot de koopbare catalogus, en daarmee lineair de kans dat een
   aanbieding hem raakt. Het kost geen nieuwe databron en geen nieuwe koppellaag.
2. **een derde keten is nog steeds voorbarig.** De tweede verdient zichzelf
   praktisch niet terug (€ 0,00 zonder promoties, − € 0,18 met); een derde
   verdubbelt het koppelwerk om met die tweede te concurreren.

## 6. Hoe het cijfer voortaan heet

> **CAPTURED PROMOTION VALUE AT CURRENT LINK COVERAGE: € 0,32 per week**

Niet "de werkelijke waarde van promoties". De brondata is echt en de meting is
echt, maar slechts 1,0 % ervan bereikt onze koopbare catalogus. Wat de overige
99 % waard zou zijn is niet gemeten en kan niet uit dit getal worden afgeleid.

Deze fase heeft één ding definitief uitgesloten: dat die 99 % door betere
identiteitsresolutie bereikbaar wordt. Dat is een nuttige uitkomst — hij bespaart
het bouwen van een EAN-pijplijn die niets zou opleveren — maar het is een
negatief resultaat en het wordt hier als zodanig opgeschreven.

---

## Het ophaalscript

`scripts/fetch-shelf-snapshot.ps1` draait lokaal op Windows en schrijft
`data/external/shelf-snapshot.json` in exact het formaat dat
[PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md) beschrijft.

```powershell
cd <repo>\apps\weekmenu

# zonder sleutel — de publieke endpoints werken, met een lagere limiet
.\scripts\fetch-shelf-snapshot.ps1

# of met een gratis sleutel, uit een omgevingsvariabele en niet uit een bestand
$env:PRIJSPROFEET_API_KEY = '<sleutel>'
.\scripts\fetch-shelf-snapshot.ps1
```

Daarna:

```bash
pnpm shelf:import data/external/shelf-snapshot.json
pnpm identity:gap
```

Het script pauzeert 400 ms tussen verzoeken, wacht dertig seconden bij een
rate limit in plaats van door te rammen, ontdubbelt op de stabiele sleutel, en
**schrijft liever geen bestand dan een leeg bestand** — een lege momentopname
ziet er stroomafwaarts uit als "geen aanbiedingen deze week", en dat is precies
de fout die niemand opmerkt.

Twee dingen om te controleren voordat je hem draait, want ze staan in de
documentatie en niet in dit script: het pad (`/v1/products`) en de parameternaam
voor de status (`promotion_status=shelf`). Als de bron iets anders gebruikt,
past dat in twee regels bovenin het script.
