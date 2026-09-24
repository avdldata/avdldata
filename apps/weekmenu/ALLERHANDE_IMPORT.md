# Allerhande-recepten importeren (alleen voor eigen gebruik)

Deze import haalt Allerhande-recepten binnen, zet ze om naar recepten die de
weekplanner kan gebruiken en bewaart ze **alleen op je eigen computer**. Ze gaan
nooit in git, nooit in de gedeelde receptenbibliotheek en worden nooit
gepubliceerd.

## Twee manieren om recepten binnen te halen

| commando                  | bron                      | status                                                                                  |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm allerhande:archive` | Common Crawl (webarchief) | **gebruik deze**: geen enkel verzoek naar ah.nl                                         |
| `pnpm allerhande:fetch`   | ah.nl zelf                | AH weigert deze verzoeken (403, gemeten op 24 september 2026); de tool stopt dan direct |

### Common Crawl (`pnpm allerhande:archive`)

[Common Crawl](https://commoncrawl.org) is een openbaar webarchief dat maandelijks
een groot deel van het web vastlegt en juist bedoeld is om in bulk te lezen.
De Allerhande-receptpagina's staan erin. De import:

- doorzoekt de index van de recentste crawls (standaard 3) op
  `www.ah.nl/allerhande/recept/*` en kiest per recept de nieuwste opname;
- haalt van elke opname alleen dat ene record op, met een byte-range uit het
  archiefbestand;
- bewaart alleen het schema.org-recept, precies als hieronder;
- vraagt één ding tegelijk met een pauze ertussen, en wacht als het archief
  druk is (de index geeft dan 503) zo lang als gevraagd;
- gaat na een onderbreking verder waar hij bleef.

Een recept dat in geen van de doorzochte crawls staat, komt niet binnen. Met
`--crawls 6` zoekt hij verder terug.

### Direct van ah.nl (`pnpm allerhande:fetch`)

**Wel:**

- `robots.txt` van ah.nl lezen en vóór elk verzoek raadplegen;
- de receptensitemap van Allerhande lezen;
- één pagina tegelijk opvragen, met minstens 5 seconden ertussen (of langer als
  `robots.txt` dat vraagt);
- zich eerlijk voorstellen als `weekmenu-prive-import/1.0`;
- van elke pagina alleen het gestructureerde schema.org-recept bewaren
  (ingrediënten, stappen, porties, tijd, voedingswaarde) — geen HTML, geen foto's;
- na een onderbreking verdergaan waar hij bleef, zonder iets dubbel op te halen.

**Niet — en daar zit geen instelling voor:**

- zich voordoen als browser, cookies of CAPTCHA's omzeilen, proxy's gebruiken,
  of een blokkadedienst als flaresolverr inzetten;
- doorgaan na een weigering. Bij een **403** stopt hij direct. Bij een **429**
  wacht hij één keer zo lang als AH vraagt en stopt hij bij de tweede. Na drie
  serverfouten of vijf pagina's zonder receptdata stopt hij ook.

Stopt de import met `BLOCKED`, dan wil AH deze verzoeken niet. Wat er al binnen
is, blijft bruikbaar.

Juridisch: de algemene voorwaarden van Albert Heijn staan kopiëren voor
privédoeleinden toe. Let wel: de uitzondering voor privégebruik in de
Databankenwet geldt alleen voor niet-elektronische databanken, dus een online
receptendatabank in bulk kopiëren valt daar niet onder. Die afweging is aan
jou. De tool beperkt zich tot wat `robots.txt` toestaat en stopt bij elke
weigering.

## Stappen (Windows, PowerShell)

De ontwikkelomgeving kan Common Crawl en ah.nl niet bereiken, dus dit draait op
je eigen computer. De app staat op de werkbranch, niet op `main`.

```powershell
cd C:\dev\avdldata
git checkout claude/weekly-menu-optimizer-fdagbe
git pull
cd apps\weekmenu
pnpm install

# 1. Proefrit: 50 recepten uit Common Crawl
pnpm allerhande:archive --limit 50

# 2. Omzetten en kijken wat er bruikbaar is
pnpm allerhande:convert
```

Ziet dat er goed uit, draai dan de volledige import. Met een halve seconde
tussen de verzoeken en een paar duizend tot ruim twintigduizend recepten duurt
dat enkele uren. Je kunt hem altijd afbreken (Ctrl+C) en later opnieuw
starten; hij gaat verder waar hij was.

```powershell
pnpm allerhande:archive
pnpm allerhande:convert
```

Zet daarna deze regel in `.env.local` (maak het bestand aan als het niet bestaat):

```
WEEKMENU_PRIVATE_RECIPES=data/private/allerhande/recipes.json
```

Start de app opnieuw (`pnpm build` en daarna `pnpm start`). In de terminal staat
dan `[catalogus] N privé-recepten geladen`. Op een receptpagina staat een regel
met de bron en een link naar het origineel.

## Wat je mag verwachten

De omzetting is streng, en dat is expres. Allergenen, vegetarisch, veganistisch
en zwangerschapsgeschiktheid worden in deze app afgeleid van de
**basisingrediënten**. Een regel die niet met zekerheid aan een basisingrediënt
te koppelen is, zou een allergeen kunnen verstoppen. Een recept met zo'n regel
komt daarom níet in de planner.

De app kent op dit moment 136 basisingrediënten, en Allerhande gebruikt er veel
meer. Reken er dus op dat in het begin maar een deel van de hoofdgerechten
bruikbaar is. `pnpm allerhande:convert` laat zien welke ingrediënten de meeste
recepten tegenhouden. Dat is de lijst om de catalogus mee uit te breiden: elk
nieuw basisingrediënt ontsluit in één keer alle recepten die er alleen nog op
wachtten.

Een recept wordt ook geweigerd als:

- het geen hoofdgerecht is;
- er een hoeveelheid zonder vaste maat in staat, zoals "1 blik" zonder gewicht
  of "1 bosje". Met gewicht erbij, zoals "1 blik (400 g)", wordt het wel
  omgerekend;
- de calorieën die de app zelf berekent meer dan 35% afwijken van wat
  Allerhande opgeeft. Dat wijst vrijwel altijd op een verkeerd gelezen
  hoeveelheid;
- het niet door dezelfde hoeveelheidscontroles komt als de eigen bibliotheek.

De redenen per recept staan in `data/private/allerhande/report.json`.

## Keuken onbekend

Allerhande vermeldt de keuken vaak niet. De app leidt die dan af uit de
trefwoorden en de naam ("nasi" → Aziatisch, "lasagne" → Italiaans). Lukt dat
niet, dan wordt het **Overig (keuken onbekend)**. Sluit je in je voorkeuren een
keuken uit, dan krijg je geen recepten met een onbekende keuken. Dat onbekende
recept zou precies de uitgesloten keuken kunnen zijn. Die optie staat daarom
ook in het voorkeurenscherm.

## Waar alles staat

| pad                                    | inhoud                                             |
| -------------------------------------- | -------------------------------------------------- |
| `data/private/allerhande/raw/`         | één bestand per opgehaald recept (schema.org-data) |
| `data/private/allerhande/recipes.json` | de bruikbare recepten, zoals de app ze laadt       |
| `data/private/allerhande/report.json`  | waarom de rest niet mee kon                        |

`data/private/` staat in `.gitignore`. Zet deze bestanden niet online, en zet
`WEEKMENU_PRIVATE_RECIPES` niet op een server die anderen kunnen bereiken.

## Code

| bestand                                                                                         | rol                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/services/recipes/allerhande/robots.ts`                                                     | robots.txt volgens RFC 9309                           |
| `src/services/recipes/allerhande/sitemap.ts`                                                    | sitemap en receptnummer                               |
| `src/services/recipes/allerhande/jsonld.ts`                                                     | schema.org-recept uit de pagina                       |
| `src/services/recipes/allerhande/crawl.ts`                                                      | de ophaallus voor ah.nl en de stopregels              |
| `src/services/recipes/allerhande/commoncrawl.ts`                                                | index, WARC-records en de ophaallus voor Common Crawl |
| `src/services/recipes/allerhande/convert.ts`                                                    | Allerhande-recept → planner-recept                    |
| `src/services/catalogue.ts`                                                                     | laadt de privé-recepten als de variabele gezet is     |
| `scripts/allerhande-archive.ts`, `scripts/allerhande-fetch.ts`, `scripts/allerhande-convert.ts` | de drie commando's                                    |
