# Bestaande Nederlandse supermarktprojecten, onderzocht

Datum: 14 september 2026 · Alle repositories lokaal gekloond en geïnspecteerd —
geen enkele claim hieronder komt uit een README zonder dat de broncode of de
data het bevestigde.

**Wat in deze omgeving wél en niet kon.** De sandbox waarin dit onderzoek
draaide laat alleen `github.com` en `raw.githubusercontent.com` door; `ah.nl`,
`jumbo.com`, `lidl.nl`, `checkjebon.nl` en `openfoodfacts.org` worden door de
egress-proxy geweigerd (HTTP 403 op CONNECT). Live probes van die bronnen zijn
dus **niet** gedaan en worden hieronder ook niet gesuggereerd. Dat bleek minder
beperkend dan verwacht: Checkjebon publiceert zijn dataset ín de repository, dus
die kon volledig gemeten worden — zie CHECKJEBON_VALIDATION.md.

---

## Samenvatting

| project                     | supermarkten          | laatste commit | databron                          | prijs   | pakket  | promoties   | nutrition | winkels | licentie     | werkt vandaag?     | nut                 |
| --------------------------- | --------------------- | -------------- | --------------------------------- | ------- | ------- | ----------- | --------- | ------- | ------------ | ------------------ | ------------------- |
| supermarkt/checkjebon       | 12 ketens (10 gevuld) | **2026-09-14** | eigen indexering, dataset in repo | ja      | deels   | nee         | nee       | nee     | **MIT**      | ja, geverifieerd   | **hoog**            |
| supermarkt/checkjebon-js    | idem                  | 2025-11-22     | leest bovenstaande JSON           | —       | —       | —           | —         | —       | MIT          | vermoedelijk       | laag (klein)        |
| gwillem/appie-go            | AH                    | **2026-09-13** | `api.ah.nl` mobiele backend       | ja      | ja      | ja (Bonus)  | ja        | ja      | **AGPL-3.0** | actief onderhouden | hoog als kennisbron |
| mrserzhan/ah-mcp            | AH                    | 2026-03-21     | `api.ah.nl` via zelfde route      | ja      | ja      | ja          | ja        | ja      | **AGPL-3.0** | onbekend           | matig               |
| EvickaStudio/lidl-discounts | Lidl                  | 2026-05-05     | `*.lidlplus.com` app-API          | ja      | deels   | **ja**      | nee       | **ja**  | Apache-2.0   | onbekend           | gericht nuttig      |
| Samvox1/nl-supermarkt-mcp   | via Checkjebon        | 2025-12-11     | Checkjebon + folderz.nl           | via CJB | via CJB | via folderz | nee       | nee     | **GEEN**     | verouderd          | alleen als bewijs   |
| BuzzGoMax/albert-heijn-api  | AH                    | 2026-06-02     | —                                 | —       | —       | —           | —         | —       | **GEEN**     | **nee: lege repo** | geen                |

---

## Per project

### supermarkt/checkjebon — MIT — de vondst van dit onderzoek

De repository bevat de dataset zelf: `data/supermarkets.json`, 10,1 MB,
**laatste wijziging 14 september 2026** (de dag van dit onderzoek, commit
"Update supermarkets.json"). De 50 commits in de shallow clone zijn vrijwel
allemaal datavernieuwingen, wat wijst op een dagelijkse cadans.

De README zegt expliciet: _"Product price data is updated frequently and **may be
reused in other projects**."_ Samen met de MIT-licentie is dat de enige bron in
dit onderzoek met een ondubbelzinnig herbruikbaarheidsstandpunt van de
uitgever zelf.

**Twee README-claims die de data tegenspreekt** — precies waar het vermoeden
over Lidl vandaan kwam:

1. De README noemt LIDL onder "niet opgenomen — geen online assortiment". De
   dataset bevat **22.070 Lidl-producten**, met als bronvermelding
   `Lidl (via boodschaapje.nl)`. Lidl zit er dus wél in, maar tweedehands via
   een derde partij. Dat is een extra schakel in de herkomst en een extra
   onbekende in de voorwaarden.
2. ALDI en Ekoplaza staan in de dataset met **0 producten**, terwijl ALDI in de
   README als ondersteund wordt genoemd.

Velden per product: naam, link-suffix, prijs (float euro), maataanduiding.
**Geen GTIN, geen categorie, geen merk als apart veld, geen promoties, geen
voedingswaarden, geen filiaalniveau, geen tijdstempel per product.** De
versheid is af te leiden uit de commitdatum van het bestand, niet uit de data.

Gemeten datakwaliteit: zie CHECKJEBON_VALIDATION.md.

### gwillem/appie-go — AGPL-3.0 — actief, maar niet zomaar te gebruiken

Het meest levende AH-project: laatste commit 13 september 2026, 67 commits,
integratietests aanwezig. Uit de broncode blijkt waar het op rust:

```
https://api.ah.nl           mobiele backend
https://login.ah.nl/login?client_id=appie-ios&response_type=code&redirect_uri=appie://login-exit
POST /mobile-auth/v1/auth/token/anonymous
```

Dat is categorie **3/4: een private, ongedocumenteerde mobiele endpoint,
reverse-engineered**, benaderd met de `client_id` van AH's eigen iOS-app. Er is
een anonieme-tokenroute waarvoor geen account nodig is.

Dit is geen officiële, gedocumenteerde API en de `client_id` is niet van ons.
Daar komt de licentie bovenop: **AGPL-3.0 is sterke copyleft**. Code hieruit
overnemen — of er een afgeleid werk van maken — zou onze applicatie onder AGPL
brengen. Voor een project dat voorlopig persoonlijk is, is dat geen ramp; het is
wel een keuze die bewust gemaakt moet worden en niet per ongeluk.

**Wat we ermee gedaan hebben:** gelezen om te begrijpen welke bron bestaat.
Geen regel code overgenomen. Het bestáán van een endpoint is een feit, geen
auteursrechtelijk beschermd werk; de implementatie eromheen wel.

### mrserzhan/ah-mcp — AGPL-3.0

Zelfde bron (`api.ah.nl`, `login.ah.nl`), in Go, als MCP-server. Laatste commit
maart 2026. Voor ons minder interessant dan appie-go: het voegt een
MCP-serverlaag toe die wij niet willen — onze optimizer moet niet via een
third-party MCP-server met onbekende businesslogica aan zijn data komen.

### EvickaStudio/lidl-discounts — Apache-2.0 — beperkt maar eerlijk afgebakend

Twee endpoints, uit de broncode:

```
https://stores.lidlplus.com/api/v4/{country}                     filialen
https://offers.lidlplus.com/app/api/v4/{country}/{store}/offers  aanbiedingen
```

De README stelt dat deze routes **geen account-login vereisen**, en in de code
staat inderdaad geen Authorization-header — alleen een `httpx.Client` met vaste
headers. Het datamodel (`lidl/models.py`) kent prijs, oude prijs, korting en een
geldigheidsperiode, en de filialen hebben coördinaten.

Dit dekt **alleen aanbiedingen**, niet de catalogus. Dat is precies wat het
beweert te zijn, en het maakt het een geloofwaardige kandidaat voor een
`LidlPromotionProvider` — en uitdrukkelijk niet voor een `LidlCatalogProvider`.
Apache-2.0 staat hergebruik toe mits de licentie en wijzigingen vermeld worden.

Nog steeds een ongedocumenteerde app-endpoint: behandelen als instabiel.

### Samvox1/nl-supermarkt-mcp — GEEN LICENTIE

Rust blijkens de broncode op:

```
https://www.checkjebon.nl/data/supermarkets.json
https://www.folderz.nl/aanbiedingen/{category}
https://www.themealdb.com/api/json/v1/1
```

Dus: dezelfde Checkjebon-data die wij rechtstreeks gebruiken, plus scraping van
folderz.nl (een folderaggregator — eigen voorwaarden, niet onderzocht omdat we
het niet gaan gebruiken). Laatste commit december 2025.

**Zonder licentie worden geen rechten verleend.** Geen code, geen schema, geen
architectuur overgenomen. Het bewijst wel iets nuttigs: dat Checkjebon in de
praktijk als prijsbron gebruikt wordt, en het verklaart de Lidl-verwarring —
projecten die Checkjebon als bron gebruiken krijgen Lidl-data mee die volgens
de Checkjebon-README niet zou bestaan.

### BuzzGoMax/albert-heijn-api — GEEN LICENTIE — leeg

Eén commit ("Add README"), één bestand (`README.md`), geen code. Er valt niets
te onderzoeken en niets te gebruiken.

---

## Licentieclassificatie en wat we hebben overgenomen

| project                     | classificatie                                           | overgenomen?                                         |
| --------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| supermarkt/checkjebon       | **PERMISSIVE** (MIT) + expliciete open-data-toestemming | de **data**, als momentopname. Geen code             |
| supermarkt/checkjebon-js    | PERMISSIVE (MIT)                                        | niets                                                |
| gwillem/appie-go            | **COPYLEFT** (AGPL-3.0)                                 | niets. Alleen gelezen om te weten welke bron bestaat |
| mrserzhan/ah-mcp            | **COPYLEFT** (AGPL-3.0)                                 | niets                                                |
| EvickaStudio/lidl-discounts | PERMISSIVE (Apache-2.0)                                 | niets — nog niet nodig                               |
| Samvox1/nl-supermarkt-mcp   | **NO_LICENSE**                                          | niets                                                |
| BuzzGoMax/albert-heijn-api  | **NO_LICENSE**                                          | niets (repo is leeg)                                 |

Geen enkele repository leverde tokens, cookies, app-secrets of ingebakken
credentials die wij overgenomen hebben, en er is niet naar gezocht om ze te
gebruiken. De `client_id=appie-ios` in appie-go is geen geheim maar wel een
identifier van een ander; dat is een reden om die route bewust te kiezen of te
laten, niet om hem stilzwijgend over te nemen.

---

## Wat dit betekent voor de bronkeuze

- **Checkjebon is de enige bron met een verdedigbare positie voor prijzen**:
  permissieve licentie, expliciete herbruikbaarheidstoestemming, dagelijkse
  vernieuwing, en meetbaar omdat de dataset in de repo staat.
- **AH via `api.ah.nl` is de enige bron met rijke productdata** (nutrition,
  Bonus, EAN, filialen), maar het is een private mobiele endpoint benaderd met
  andermans client-id, en de enige werkende implementaties zijn AGPL.
- **Lidl heeft geen catalogusbron**, alleen een aanbiedingenroute. De
  "22.070 Lidl-producten" in Checkjebon komen van boodschaapje.nl en zijn
  grotendeels non-food met ontbrekende maataanduiding (75,7 % leeg).
- **Jumbo heeft geen eigen bruikbare route** in dit onderzoek; via Checkjebon is
  er wel prijsdata, maar 41,7 % van de producten mist een maataanduiding.

De keuze die hieruit volgt staat in REAL_DATA_ARCHITECTURE_DECISION.md.
