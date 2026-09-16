# De receptbibliotheek

Van 56 naar 138 avondmaaltijden, en wat daarvan wel en niet klopt.

Alles hieronder komt uit `pnpm recipes:report`, `pnpm recipes:reassess` en
`pnpm recipes:impact`. Er staat geen getal in dat niet opnieuw te draaien is.

---

## 1. Waar de bibliotheek nu staat

|                                           |     vóór |            na |
| ----------------------------------------- | -------: | ------------: |
| recepten                                  |       56 |       **138** |
| uniek na dedupe                           |       55 |       **137** |
| canonical ingrediënten gebruikt (van 136) |      112 |           129 |
| koopbaar bij AH + Jumbo + Lidl samen      | 42 (75%) | **124 (90%)** |
| koopbaar bij alleen AH                    | 34 (61%) |      96 (70%) |
| koopbaar bij alleen Jumbo                 | 23 (41%) |      56 (41%) |
| koopbaar bij alleen Lidl                  |  9 (16%) |      33 (24%) |
| weken zonder dat een gerecht terugkomt    |        7 |        **19** |
| gerechten die daarbij aan bod komen       |       49 |           133 |
| diversiteitswaarschuwingen                |        4 |         **0** |
| validatiefouten                           |        0 |             0 |
| licenties buiten INTERNAL / PUBLIC_DOMAIN |        0 |         **0** |

De poort uit de opdracht was 120 ná deduplicatie. Dat is 137 geworden.

### Spreiding

| primaire koolhydraat |            | cuisine     |            | primair eiwit |            |
| -------------------- | ---------: | ----------- | ---------: | ------------- | ---------: |
| aardappel            | 34 (24,6%) | nederlands  | 25 (18,1%) | peulvrucht    | 26 (18,8%) |
| peulvruchten         | 23 (16,7%) | mediterraan | 25 (18,1%) | kip           | 24 (17,4%) |
| rijst                | 22 (15,9%) | aziatisch   | 23 (16,7%) | zuivel        | 20 (14,5%) |
| pasta                | 21 (15,2%) | italiaans   | 22 (15,9%) | vis           | 19 (13,8%) |
| granen               |  12 (8,7%) | mexicaans   |  12 (8,7%) | rund          | 17 (12,3%) |
| noedels              |   9 (6,5%) | indiaas     |  12 (8,7%) | varken        |  12 (8,7%) |
| wraps                |   8 (5,8%) | grieks      |  11 (8,0%) | plantaardig   |   9 (6,5%) |
| brood                |   8 (5,8%) | frans       |   8 (5,8%) | ei            |   6 (4,3%) |
| geen                 |   1 (0,7%) |             |            | geen          |   5 (3,6%) |

De poort: geen koolhydraat boven 25%, geen cuisine of eiwit boven 30%, en
elke maaltijdstijl minstens vier keer. Alle zestien stijlen halen dat —
noedels ging van 1 naar 9, wraps van 2 naar 8, curry van 2 naar 4.

63 van de 138 gerechten zijn vegetarisch, 31 veganistisch. Die twee labels
komen uit de ingrediënten, nooit uit een tag; zie §5.

---

## 2. Waarom alle 82 nieuwe recepten zelf zijn geschreven

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

## 3. De kwaliteitspoort op de nieuwe recepten

82 recepten, allemaal met de hand nagelopen op titel, stappen, hoeveelheid per
persoon, eiwit, calorieën en koopbaarheid (`data/recipes/new-recipe-audit-sprint2.json`):

| verdict | aantal |   aandeel |
| ------- | -----: | --------: |
| GOOD    |     75 | **91,5%** |
| FIXABLE |      7 |      8,5% |
| REJECT  |      0 |        0% |

De eis was ≥90% GOOD.

De zeven FIXABLE zijn geen fouten maar bekende beperkingen: zes gerechten
gebruiken pitabrood, dat in de huidige prijssnapshot alleen bij Lidl staat, en
`snijbonen-spek-aardappel` is met 419 kcal het lichtste gerecht van de batch.

Elf recepten zijn tijdens de audit aangepast, en dat is waar de audit zijn
werk deed:

- `hollandse-groentesoep-balletjes` haalde 348 kcal — geen avondmaaltijd;
- `aardappel-bloemkoolcurry` en `ratatouille-aardappel` bleven onder 15 g
  eiwit per portie;
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

---

## 4. De guards

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

## 5. Dieetlabels worden afgeleid, nooit beweerd

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

## 6. Wat een grotere bibliotheek níét oplost

Gevraagd om twintig weken achter elkaar geeft de planner **twintig keer
dezelfde zeven gerechten**.

Dat is geen tekort aan recepten. Dezelfde bibliotheek levert negentien weken
achter elkaar zonder dat één gerecht terugkomt, zodra je hem vraagt om iets wat
er nog niet op tafel heeft gestaan. Het is dat de optimizer geen geheugen
heeft: de herhalingsstraf telt herhaling _binnen_ een week, en nergens staat
wat er vorige week is gegeten. Bij gelijke invoer is de goedkoopste week een
constante.

Cross-week-geschiedenis is een optimizerwijziging en valt buiten deze sprint.
Het gedrag staat vastgepind in `tests/integration/recipe-library-planning.test.ts`
in een test die hoort te falen zodra die geschiedenis er komt.

**Dit is de belangrijkste conclusie van de sprint**: 82 recepten erbij leveren
uit zichzelf geen variatie op. Ze maken variatie mogelijk; iets moet er nog om
vragen.

---

## 7. Twee bugs die de grotere bibliotheek zichtbaar maakte

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
| alternatieven over 7 dagen (138 recepten) |           4 |        35 |
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

## 8. Snelheid en aanbiedingen

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

## 9. Hoe je dit zelf naloopt

```bash
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

## 10. Wat er niet in zit

- **Zeven ingrediënten staan in geen enkele prijssnapshot**: stokbrood,
  paprika-geel, rode peper, verse basilicum, bosui, passata en rode currypasta.
  Veertien recepten raken er een. Ze zijn gewoon in de winkel te krijgen; ze
  staan alleen niet in de folder- en prijsdata die we hebben.
- **Zeven canonical ingrediënten worden door geen enkel recept gebruikt**:
  crème fraîche, doperwten, kwark, maïstortilla, sriracha, tonijn in blik en
  zongedroogde tomaten. Maïstortilla en sriracha zijn twee van de negentien
  nieuwe taxonomieconcepten, en juist die twee zijn met de huidige data
  nergens te koop — een recept eromheen schrijven zou een onkoopbaar recept
  opleveren.
- **Vormgebonden varianten** (krieltjes, diepvriesspinazie, aardappelpartjes)
  worden nog door geen recept gevraagd. De provider filtert ze eruit zolang
  geen recept zich er expliciet voor opgeeft, en dat opgeven loopt via de
  product-matching, die deze sprint niet wordt aangeraakt.
- **Risottorijst** staat in de taxonomie als niet-uitwisselbaar, maar er is
  geen enkel risottorijstproduct in de snapshot. Een risotto zou dus gewone
  rijst kopen, en dat is precies wat `substitutable: false` verbiedt. Er is
  daarom geen risottorecept; `aspergerijst-parmezaan` vraagt om gewone rijst en
  heet ook niet anders.
- **Hachee en hutspot** blijven als enige duplicaatpaar staan: zes van de zeven
  ingrediënten gemeen, allebei Nederlands gestoofd rundvlees op gestampte
  aardappel. Voor een kok twee gerechten, voor de maat bijna één — en de maat
  heeft er een punt.
