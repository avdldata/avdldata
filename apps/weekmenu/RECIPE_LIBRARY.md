# De receptbibliotheek

Van 56 naar 138 avondmaaltijden, en wat daarvan wel en niet klopt.

Alles hieronder komt uit `pnpm recipes:report`, `pnpm recipes:reassess` en
`pnpm recipes:impact`. Er staat geen getal in dat niet opnieuw te draaien is.

---

## 1. Drie getallen, en waarom ze verschillen

|                                    |         |
| ---------------------------------- | ------: |
| **A — productierecords**           |     141 |
| **B — nu selecteerbaar**           | **127** |
| **C — uniek binnen selecteerbaar** | **126** |
| niet beschikbaar (datagat)         |      14 |

Alleen **C** telt. A is wat er in de bibliotheek staat; B is wat de planner je
vandaag mag voorzetten; C is hoeveel verschillende avondmaaltijden dat werkelijk
zijn.

Het verschil tussen A en B is geen kwaliteitsoordeel over die veertien
gerechten. Het is een gat in onze prijsdata: ze noemen een ingrediënt dat in
geen enkele momentopname voorkomt, en een weekmenu dat je niet kunt kopen is
geen weekmenu. Ze blijven als record in de bibliotheek staan, met de reden
eraan vast, en `partitionByAvailability` houdt ze uit de generatiepool. Er wordt
niets gegokt, niets op € 0 gezet, geen demo-product voor in de plaats geschoven
en geen regel stil overgeslagen — zie §10.

## 2. Waar de bibliotheek nu staat

|                                           |     vóór |        na |
| ----------------------------------------- | -------: | --------: |
| recepten                                  |       56 |   **141** |
| uniek na dedupe                           |       55 |   **140** |
| selecteerbaar op echte prijsdata          |       42 |   **127** |
| canonical ingrediënten gebruikt (van 136) |      112 |       129 |
| koopbaar bij alleen AH                    | 34 (61%) | 103 (73%) |
| koopbaar bij alleen Jumbo                 | 23 (41%) |  60 (43%) |
| koopbaar bij alleen Lidl                  |  9 (16%) |  33 (23%) |
| weken zonder dat een gerecht terugkomt    |        7 |    **19** |
| diversiteitswaarschuwingen                |        4 |     **0** |
| validatiefouten                           |        0 |         0 |
| licenties buiten INTERNAL / PUBLIC_DOMAIN |        0 |     **0** |

### Spreiding

| primaire koolhydraat |            | cuisine     |            | primair eiwit |            |
| -------------------- | ---------: | ----------- | ---------: | ------------- | ---------: |
| aardappel            | 35 (24,8%) | mediterraan | 27 (19,1%) | peulvrucht    | 26 (18,4%) |
| peulvruchten         | 23 (16,3%) | nederlands  | 25 (17,7%) | kip           | 24 (17,0%) |
| rijst                | 22 (15,6%) | aziatisch   | 24 (17,0%) | zuivel        | 20 (14,2%) |
| pasta                | 21 (14,9%) | italiaans   | 22 (15,6%) | vis           | 20 (14,2%) |
| granen               |  13 (9,2%) | mexicaans   |  12 (8,5%) | rund          | 17 (12,1%) |
| noedels              |  10 (7,1%) | indiaas     |  12 (8,5%) | varken        |  12 (8,5%) |
| wraps                |   9 (6,4%) | grieks      |  11 (7,8%) | plantaardig   |  10 (7,1%) |
| brood                |   7 (5,0%) | frans       |   8 (5,7%) | ei            |   7 (5,0%) |
| geen                 |   1 (0,7%) |             |            | geen          |   5 (3,5%) |

De poort: geen koolhydraat boven 25%, geen cuisine of eiwit boven 30%, en elke
maaltijdstijl minstens vier keer. Alle zestien stijlen halen dat.

65 van de 141 gerechten zijn vegetarisch, 32 veganistisch. Die twee labels komen
uit de ingrediënten, nooit uit een tag; zie §5.

## 3. Waarom alle 85 nieuwe recepten zelf zijn geschreven

Eerst is gemeten of het anders kon. Geen nieuwe internetresearch, geen
scraping — alleen de drie corpora die er al lagen, opnieuw beoordeeld met de
136 canonical ingrediënten van nu (`pnpm recipes:reassess`):

| corpus              | licentie      | totaal | dinner | bruikbaar vóór | bruikbaar nu | koopbaar | productie-veilig |
| ------------------- | ------------- | -----: | -----: | -------------: | -----------: | -------: | ---------------: |
| forkrecipe          | CC-BY-SA      |    594 |    220 |             10 |           10 |        5 |                0 |
| open-recipe-archive | PUBLIC_DOMAIN | 54.843 | 16.404 |            138 |          141 |      130 |          **130** |
| recipe-dataset      | UNKNOWN       | 13.489 |  5.180 |            251 |          285 |      161 |                0 |

De taxonomie-uitbreiding maakte 37 extra kandidaten bruikbaar. Van alles wat
overblijft zijn er 130 die zowel de technische poort halen (avondmaaltijd,
≥90% van de regels naar een canonical ingrediënt, ≥80% parseerbare
hoeveelheden, elk ingrediënt te koop) als de licentiepoort.

Die 130 zijn met de hand beoordeeld — 110 uniek na titelnormalisatie. Het
resultaat staat in `data/recipes/candidate-audit-sprint2.json`:

| verdict | aantal |
| ------- | -----: |
| GOOD    |  **0** |
| FIXABLE |     21 |
| REJECT  |     89 |

De meest voorkomende afwijsredenen: bijgerecht (35), licht eiergerecht (14),
**hoofdingrediënt matchte niet** (10), gebak (8), voorafsoep (9), component
zoals een saus of deeg (7).

Die derde reden is de scherpste. _Sopa de Albondiguillas_ — gehaktballensoep —
haalt de dekkingspoort omdat bloem, ei, melk, boter en zout allemaal matchen
en het gehakt niet. Importeren zou een gehaktballensoep zonder gehakt
opleveren. Hetzelfde geldt voor _Schnellklopps_, _Tomatbiff_, _Sillgratin_ en
_Timbal på Kalv_.

En daarachter zit een systematisch probleem met het corpus: de kandidaten
halen de dekkingspoort **juist omdat** ze weinig, uitsluitend basale
ingrediënten hebben. Dat is het profiel van een negentiende-eeuws recept voor
een saus of een soufflé, niet van een avondmaaltijd. Hoge dekking correleert
hier negatief met "is dit een gerecht".

Parafraseren was geen uitweg: eigen stappen schrijven bij andermans recept en
het dan INTERNAL noemen is de herkomst wegpoetsen. Dus zijn de 82 recepten
hier geschreven — titel, hoeveelheden en stappen — en staat in elk recept
`provenance: { kind: 'INTERNAL', licence: 'INTERNAL' }`.

### Licentierapport

| licentie                | in productie |
| ----------------------- | -----------: |
| INTERNAL                |          138 |
| PUBLIC_DOMAIN           |            0 |
| CC_BY                   |            0 |
| CC_BY_SA                |            0 |
| NON_COMMERCIAL_RESEARCH |        **0** |
| UNKNOWN                 |        **0** |

`isProductionSafeLicence` laat alleen INTERNAL en PUBLIC_DOMAIN door. CC-BY-SA
staat daar bewust buiten: share-alike op recepttekst in een commerciële app is
een verplichting die we niet willen aangaan, en `mayBePublishedCommercially`
zei dat al voor deze sprint.

---

## 4. De kwaliteitspoort op de nieuwe recepten

85 recepten, allemaal met de hand nagelopen op titel, stappen, hoeveelheid per
persoon, eiwit, calorieën en koopbaarheid, en na elke wijziging opnieuw door de
automatische validatie (`data/recipes/new-recipe-audit-sprint2.json`):

| verdict | bij de audit | na de close-out |
| ------- | -----------: | --------------: |
| GOOD    |           75 |          **85** |
| FIXABLE |            7 |           **0** |
| REJECT  |            0 |           **0** |

Alle 85 zijn selecteerbaar; geen van de datagaten in §10 raakt een recept uit
deze batch.

### De zeven FIXABLE, één voor één afgesloten

Geen van de zeven is weggestreept of heretiketteerd; elk had een inhoudelijke
oplossing:

| recept                                  | wat er aan de hand was                                    | wat er is gebeurd                                                                        |
| --------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `snijbonen-spek-aardappel`              | 419 kcal, 15 g eiwit — lichtste van de batch              | spek 200 → 300 g; nu 494 kcal, 19 g eiwit                                                |
| `italiaanse-kipstoof-olijven`           | pitabrood als koolhydraat, in de snapshot alleen bij Lidl | een cacciatore heeft geen brood nodig: nu met aardappel, bij alle drie de ketens te koop |
| `uiensoep-kaaskorst`                    | acht uien snijden voor doordeweeks                        | nu zes; het brood blijft, want de kaaskorst ís het gerecht                               |
| `gigantes-witte-bonen-tomaat`           | pitabrood beperkte de koopbaarheid                        | brood naast een bonenschotel is een bijgerecht: nu `optional`                            |
| `griekse-kikkererwtensalade-geitenkaas` | idem                                                      | idem                                                                                     |
| `mexicaanse-bonensalade-avocado`        | idem                                                      | idem                                                                                     |
| `kikkererwtenstoof-spinazie-citroen`    | idem                                                      | idem                                                                                     |

Na die wijzigingen zijn alle 85 opnieuw langs schema, hoeveelheden, nutritie,
dieet en allergenen, schaling naar 1–8 porties, deduplicatie en koopbaarheid:
**0 fouten, 0 waarschuwingen, 85 van 85 selecteerbaar.**

### De elf die tijdens de audit al waren aangepast

Ook die zijn opnieuw door alle validators gehaald — een "fix" die niet opnieuw
is nagerekend is geen fix:

- `hollandse-groentesoep-balletjes` haalde 348 kcal — geen avondmaaltijd;
- `aardappel-bloemkoolcurry` en `ratatouille-aardappel` bleven onder 15 g eiwit
  per portie;
- `enchilada-ovenschotel-kip` (899 kcal, 60 g eiwit), `pastaschotel-rookworst`
  (977 kcal) en `burrito-kip-zwarte-bonen` (941 kcal) waren te zwaar;
- vier recepten deelden meer dan 75% van hun ingrediënten met een bestaand
  gerecht en zijn vervangen of aangepast;
- `kip-mosterdroomsaus` had 88 g groente per persoon.

Vijf bestaande gerechten haalden de eiwiteis ook niet — `pompoen-risotto-stijl`
zat op 8 g. Die hebben nu een eiwitbron die bij het gerecht past. Hun
handgeschreven nutritionregel is verwijderd in plaats van bijgewerkt: die
beschreef het oude gerecht, en een bijgewerkte regel zou een tweede kopie van
dezelfde berekening zijn.

### En drie die bij de close-out zijn bijgeschreven

Het verplaatsen van de kipstoof van brood naar aardappel tilde het
aardappelaandeel naar 25,4% — net over de poort. Drie nieuwe gerechten met een
ander koolhydraat brengen het terug naar 24,8%: `mie-vegagehakt-ketjap`,
`wrap-roerei-paprika-spinazie` en `bulgur-zalm-venkel`. Alle drie gebruiken
alleen bestaande canonical ingrediënten en zijn bij alle drie de ketens te koop.

---

## 5. De guards

`src/domain/recipes/validation.ts` draait 28 controles over elk recept bij elke
wijziging. Ze repareren niets; ze noemen het regelnummer en de reden, want de
afweging hoort bij iemand die kan zeggen waarom.

| grens                         | waarde                    |
| ----------------------------- | ------------------------- |
| eiwitbron per persoon         | 60–350 g                  |
| eiwit per portie (berekend)   | ≥ 15 g                    |
| droge pasta/rijst per persoon | 50–250 g, fout boven 1 kg |
| aardappel per persoon         | ≤ 600 g                   |
| olie per persoon              | ≤ 40 ml                   |
| droge specerij per persoon    | ≤ 20 g                    |
| groente per persoon           | ≥ 100 g                   |
| kcal per portie               | 350–1200, fout boven 2000 |
| stappen                       | 2–14                      |
| bereidingstijd                | > 0 en ≤ 240 min          |

Verder: onbekende ingrediënten, niet-converteerbare eenheden, gram-op-milliliter,
stuks zonder stukgewicht, fractionele stuks ("5,5 wraps"), schaling naar 1 tot 8
porties, reproduceerbaarheid van de nutritionberekening, dubbele ids, ontbrekende
provenance, niet-productie-veilige licenties en tags die de afgeleide
dieetlabels tegenspreken.

Wat er nu nog uit komt: zeven waarschuwingen, nul fouten. Zes gerechten zitten
onder 100 g groente per persoon — carbonara heeft er 1 — en die zijn zo bedoeld.

Drie meetfouten die de guards zelf blootlegden en die dus hersteld zijn:

- **tomaat uit blik telde niet als groente**, omdat het in het schap bij de
  conserven staat. Penne arrabbiata werd gerapporteerd als een gerecht met 9
  gram groente;
- **"bouillon" in een stap maakte hachee een soep**. Bouillon gaat net zo goed
  in een stoofpot of een risotto; alleen de naam of de tag telt nu. Hachee viel
  hierdoor met hutspot in dezelfde duplicaatbak;
- **acht bestaande gerechten waren veganistisch volgens hun ingrediënten maar
  niet zo getagd**. Wie op veganistisch filterde kreeg ze nooit te zien.

---

## 6. Dieetlabels worden afgeleid, nooit beweerd

`vegetarian`, `vegan`, `allergens` en `pregnancySuitable` komen uit de
canonical ingrediënten, in `normaliseRecipe`. Een tag is een belofte aan wie
erop filtert; een tag die de ingrediënten tegenspreekt is een fout, geen
slordigheid. De validatie weigert `vegetarisch` op een gerecht met vlees, en
waarschuwt bij een veganistisch gerecht dat de tag mist — anders is het
onvindbaar voor precies de persoon die ernaar zocht.

De filters zijn getest op de nieuwe recepten: een veganistisch huishouden
krijgt uitsluitend veganistische gerechten, een coeliakiehuishouden geen
gluten, een zwangere geen rauw-risicogerecht, en een uitsluiting van `ui` en
`knoflook` laat geen enkel recept met ui of knoflook door.

---

## 7. Variatie: wat werkt, en wat niet

Drie verschillende dingen, die eerder op één hoop lagen.

**"Maak mijn week" voor een nieuwe week.** De planner rekent de goedkoopste
week uit die aan alle harde regels voldoet, uit de selecteerbare pool. Er is
geen geheugen: dezelfde invoer levert dezelfde week. Vraag je twintig weken na
elkaar, dan krijg je twintig keer hetzelfde menu. Dat is niet stuk — het is de
determinismegarantie die de hele engine draagt — maar het is wel een beperking,
en hij staat in §12.

**"Maak een andere week".** Deze knop deed hetzelfde als hierboven en gaf dus
letterlijk dezelfde zeven gerechten terug: een knop die zichtbaar niets doet.
Hij vraagt nu om een week _zonder_ de gerechten die je al hebt gezien. Gemeten
over tien keer drukken, door de browser:

|                                         |               |
| --------------------------------------- | ------------: |
| volledig identieke weken                |  **0 van 10** |
| gemiddeld gewijzigde gerechten per druk | **7,0 van 7** |

De lijst met geziene gerechten zit in de knop, niet in de database. Het is het
geheugen van één keukentafelsessie, geen voorkeur om te bewaren: na een reload
begint de app weer bij zijn beste week. Raakt de bibliotheek op — zo'n zeventien
weken — dan zegt de knop dat, en begint opnieuw.

**Een andere startdatum.** De datum bepaalt welke prijzen en aanbiedingen
gelden (`onDate`). In DEMO-modus verschuiven de aanbiedingen per week en kan de
week daardoor veranderen; in REAL-modus is de prijsmomentopname één vaste
opname, dus verandert er in de praktijk niets.

Vastgepind in `tests/e2e/regenerate-week.spec.ts`: tien keer drukken mag geen
enkele keer dezelfde week teruggeven, én "maak mijn week" moet reproduceerbaar
blijven.

---

## 8. Drie bugs die de grotere bibliotheek zichtbaar maakte

**Een vastgezet gerecht buiten de pool liet de zoekopdracht leeglopen.** De
beam plaatst alleen recepten die in `pool` staan, en dat is de gerangschikte
top-28. Vroeg de gebruiker om een gerecht daarbuiten, dan had de slot niets te
plaatsen, kwam de beam met nul weken terug en meldde de optimizer "er passen
maar 133 recepten bij jullie instellingen" — terwijl het er 133 waren. Bij 56
recepten was de pool de halve bibliotheek en viel het nooit op; bij 138 brak
het "vervang dit gerecht" op drie van de zeven dagen.

|                                           | vóór de fix | na de fix |
| ----------------------------------------- | ----------: | --------: |
| alternatieven over 7 dagen (56 recepten)  |          27 |        35 |
| alternatieven over 7 dagen (141 recepten) |           4 |        35 |
| dagen zonder enige optie                  |           3 |     **0** |

**`RangeError: Invalid array length`** kwam uit `new Array(NaN + 1)` in de
verpakkingsoptimalisatie wanneer de gevraagde hoeveelheid niet eindig was. Die
melding wijst nergens naar; het is nu een benoemde weigering
(`REQUIREMENT_NOT_FINITE`).

Daarnaast zette de audit-flow-browsertest alle voorkeuren op "Nooit" en daarna
op "Neutraal" terug — wat niet hetzelfde is als terugzetten. Elke spec erna
plande een week voor een huishouden zonder voorkeuren. Dat viel niet op zolang
die week toevallig ook een aanbieding bevatte.

---

## 9. Snelheid en aanbiedingen

Gemeten met beide bibliotheken in dezelfde run, afwisselend en na opwarmen
(`pnpm recipes:impact`):

|                                 |    vóór |          na |
| ------------------------------- | ------: | ----------: |
| optimizer, snelste van 5        | 1935 ms | **1118 ms** |
| bereikbare promoties (van 5190) |      57 |          71 |

De planner werd sneller, niet langzamer. Dat is niet nagejaagd — deze sprint
raakt de optimizer niet aan — maar het is wel gemeten en gecontroleerd op
volgorde-effecten: naïef achter elkaar gemeten kwam er 2006 tegen 1158 uit,
wat alleen de JIT-opwarming was.

"Bereikbaar" is niet "gekocht". De goedkoopste week die de planner nu vindt
kost € 35,69 voor zeven avondmaaltijden voor twee, en koopt niets in de
aanbieding — er is simpelweg geen aanbieding nodig. Het aanbiedingenbewijs uit
sprint 1 draait daarom met alleen Albert Heijn, waar de meeste gekoppelde
aanbiedingen zitten.

---

## 10. De zeven ingrediënten zonder prijsdata

Veertien recepten raken een ingrediënt dat in geen enkele momentopname
voorkomt. Ze staan in de bibliotheek, maar de planner mag ze niet kiezen.

| ingrediënt        | recepten | waarom er geen product is                                                                                                    |
| ----------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `stokbrood`       |        6 | Vers brood zit niet in de Checkjebon-prijslijst; die dekt het kruidenierschap, niet de bakkerijafdeling.                     |
| `paprika-geel`    |        3 | Alleen rode paprika matcht; gele wordt in de productnamen zelden apart benoemd en valt daardoor uit de identiteitskoppeling. |
| `verse-basilicum` |        2 | Verse kruidenpotjes staan wel in het schap maar niet in de momentopname.                                                     |
| `rode-peper`      |        2 | Idem: losse verse pepers ontbreken in de feed.                                                                               |
| `passata`         |        1 | Gezeefde tomaten matchen op `tomatenblokjes` of vallen af; er is geen eigen product overgebleven.                            |
| `rode-currypasta` |        1 | Wereldkeuken-pasta's zijn dun gedekt in de momentopname.                                                                     |
| `bosui`           |        1 | Idem als verse kruiden.                                                                                                      |

Geraakte recepten: `linzensoep`, `pompoensoep`, `salade-blauwe-kaas`,
`shakshuka`, `tofu-shakshuka-stijl`, `tonijnsteak-groenten`,
`bulgur-gegrilde-groenten`, `couscous-geroosterde-groenten`,
`geroosterde-groenten-couscous`, `pasta-pesto-kip`, `penne-arrabbiata`,
`garnalen-knoflookpasta`, `thaise-rode-curry-kip`, `burrito-bowl`.

Alle veertien zijn bestaande recepten van vóór deze sprint; geen van de 85
nieuwe raakt een gat. Het dichten ervan is datawerk, geen receptwerk, en
gebeurt niet in deze close-out.

---

## 11. Hoe je dit zelf naloopt

```bash
pnpm recipes:selectable          # de drie getallen: records, selecteerbaar, uniek
pnpm recipes:report              # profiel, diversiteitspoort, validatie, koopbaarheid
pnpm recipes:report --menu base  # dezelfde meting op de bibliotheek van vóór sprint 2
pnpm recipes:reassess            # de kandidaatcorpora opnieuw door de poort
pnpm recipes:impact              # vóór/na: weken, snelheid, bereikbare promoties
pnpm test                        # 780 unit- en integratietests
pnpm test:e2e                    # 15 browsertests
```

Vastgelegde data:

| bestand                                      | wat erin staat                                 |
| -------------------------------------------- | ---------------------------------------------- |
| `data/recipes/baseline-before.json`          | het profiel van de 56                          |
| `data/recipes/baseline-after.json`           | het profiel van de 138                         |
| `data/recipes/candidate-audit-sprint2.json`  | de 110 externe kandidaten, per stuk beoordeeld |
| `data/recipes/new-recipe-audit-sprint2.json` | de 82 nieuwe recepten, per stuk beoordeeld     |

---

## 12. Wat er niet in zit

- **De planner onthoudt niet wat je vorige week at.** Een nieuwe week voor een
  ongewijzigd huishouden levert opnieuw het optimizer-optimum op. Dat is
  aanvaardbaar zolang "maak een andere week" één druk verderop staat en
  aantoonbaar varieert (§7), maar het blijft een beperking: cross-week
  geschiedenis is werk voor een volgende sprint.
- **Zeven ingrediënten hebben geen prijsdata** en houden veertien bestaande
  recepten buiten de pool — §10.
- **Zeven canonical ingrediënten worden door geen enkel recept gebruikt**:
  crème fraîche, doperwten, kwark, maïstortilla, sriracha, tonijn in blik en
  zongedroogde tomaten. Maïstortilla en sriracha zijn twee van de negentien
  nieuwe taxonomieconcepten, en juist die twee zijn nergens te koop — een
  recept eromheen schrijven zou een onkoopbaar recept opleveren.
- **Vormgebonden varianten** (krieltjes, diepvriesspinazie, aardappelpartjes)
  worden nog door geen recept gevraagd. De provider filtert ze eruit zolang
  geen recept zich er expliciet voor opgeeft, en dat opgeven loopt via de
  product-matching, die deze sprint niet wordt aangeraakt.
- **Risottorijst** staat in de taxonomie als niet-uitwisselbaar, maar er is geen
  enkel risottorijstproduct in de momentopname. Een risotto zou dus gewone rijst
  kopen, en dat is precies wat `substitutable: false` verbiedt. Er is daarom
  geen risottorecept; `aspergerijst-parmezaan` vraagt om gewone rijst en heet
  ook niet anders.

### Hachee en hutspot: beoordeeld en allebei behouden

Het enige duplicaatpaar dat overblijft, met 86% gedeelde ingrediënten. De maat
is hier een false positive, en dat is te controleren aan de recepten zelf:

|                       | hachee                       | hutspot met rundvlees          |
| --------------------- | ---------------------------- | ------------------------------ |
| techniek              | twee uur stoven              | samen koken en stampen         |
| wat het gerecht maakt | azijn en laurier bij veel ui | 500 g wortel door de puree     |
| rol van de aardappel  | bijgerecht naast de stoof    | onderdeel van het gerecht zelf |
| kooktijd              | 135 min                      | 105 min                        |

De overlap komt doordat beide Nederlandse gerechten dezelfde basis delen —
runderstoof, aardappel, ui, boter, melk, bouillon — en die basis is nu eenmaal
zes van de zeven regels. Wat ze onderscheidt zit in één ingrediënt dat de maat
niet kan wegen (`wortel` in de een, `azijn` in de ander) en in een techniek die
alleen in de stappen staat.

De drempel is daarom niet verlaagd en er is niets verwijderd: het paar staat
vastgepind in `tests/integration/recipe-selectability.test.ts` als het enige
geaccepteerde duplicaat, zodat een tweede paar wél opvalt.
