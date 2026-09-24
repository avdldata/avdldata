# Allerhande-recepten importeren (alleen voor eigen gebruik)

Deze import haalt Allerhande-recepten binnen, zet ze om naar recepten die de
weekplanner kan gebruiken en bewaart ze **alleen op je eigen computer**. Ze gaan
nooit in git, nooit in de gedeelde receptenbibliotheek en worden nooit
gepubliceerd.

## Wat hij doet, en wat hij bewust niet doet

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

De ontwikkelomgeving kan ah.nl niet bereiken, dus dit draait op je eigen computer.

```powershell
cd C:\dev\avdldata\apps\weekmenu
git pull
pnpm install

# 1. Proefrit: 20 recepten (ongeveer twee minuten)
pnpm allerhande:fetch --limit 20

# 2. Omzetten en kijken wat er bruikbaar is
pnpm allerhande:convert
```

Ziet dat er goed uit, draai dan de volledige import. Bij 5 seconden per recept
duren 1.000 recepten ongeveer anderhalf uur. Je kunt hem altijd afbreken
(Ctrl+C) en later opnieuw starten; hij gaat verder waar hij was.

```powershell
pnpm allerhande:fetch
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

| bestand                                                        | rol                                               |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `src/services/recipes/allerhande/robots.ts`                    | robots.txt volgens RFC 9309                       |
| `src/services/recipes/allerhande/sitemap.ts`                   | sitemap en receptnummer                           |
| `src/services/recipes/allerhande/jsonld.ts`                    | schema.org-recept uit de pagina                   |
| `src/services/recipes/allerhande/crawl.ts`                     | de ophaallus en de stopregels                     |
| `src/services/recipes/allerhande/convert.ts`                   | Allerhande-recept → planner-recept                |
| `src/services/catalogue.ts`                                    | laadt de privé-recepten als de variabele gezet is |
| `scripts/allerhande-fetch.ts`, `scripts/allerhande-convert.ts` | de twee commando's                                |
