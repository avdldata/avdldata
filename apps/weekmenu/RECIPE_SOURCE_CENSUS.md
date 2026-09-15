# Recipe source census

Gemeten, niet overgeschreven. Elk getal hieronder komt uit `pnpm recipes:census`
over data die daadwerkelijk is ingelezen.

## Wat bereikbaar was, en wat niet

De egress-policy van deze omgeving staat `github.com`, `api.github.com` en
`raw.githubusercontent.com` toe en weigert de rest. Gemeten:

| host                              | resultaat      | gevolg                                                  |
| --------------------------------- | -------------- | ------------------------------------------------------- |
| `raw.githubusercontent.com`       | 200            | elk bestand van elke publieke repo                      |
| `api.github.com`                  | 403            | geen tree-listing; deze sessie is aan één repo gebonden |
| `codeload` / archive-tarballs     | 403            | geen bulkdownload                                       |
| `www.themealdb.com`               | 403 op CONNECT | **niet ingelezen**                                      |
| `cosylab.iiitd.edu.in` (RecipeDB) | 403 op CONNECT | **niet ingelezen**                                      |

**RecipeDB en TheMealDB komen daarom in geen enkele telling voor.** Wat de
opdracht over hen zegt — 118.171 respectievelijk 793 recepten — is documentatie
van derden, geen meting van ons, en wordt hier niet als feit behandeld.

Zonder tree-API moest elke bron zijn eigen manier krijgen om te ontdekken welke
bestanden bestaan. Dat is de reden dat de adapters onderling meer verschillen
dan je zou verwachten.

## De drie bronnen die wél ingelezen zijn

### ForkRecipe — `futurechef/forkrecipe-recipes`

|                                                     |                                                        |
| --------------------------------------------------- | -----------------------------------------------------: |
| recepten (gevonden via de commit- en forkregisters) |                                                **594** |
| met ingrediënten                                    |                                            594 (100 %) |
| met hoeveelheden                                    |                                            594 (100 %) |
| met eenheden                                        |                                            594 (100 %) |
| met porties                                         | 162 (27,3 %) — geschat uit totaalgewicht, niet vermeld |
| met bereidingstijd                                  |                                            594 (100 %) |
| met instructies                                     |                                            594 (100 %) |
| met keuken                                          |                                            594 (100 %) |
| met dieetclassificatie                              |                                                      0 |
| dubbele titels                                      |                                                      2 |
| malformed                                           |                                                      0 |
| **DINNER**                                          |                                       **170 (28,6 %)** |
| POSSIBLE_DINNER                                     |                                             50 (8,4 %) |
| NOT_DINNER                                          |                                           306 (51,5 %) |
| AMBIGUOUS                                           |                                            68 (11,4 %) |
| ingrediëntregels                                    |                                                  5.328 |
| omrekenbaar naar g/ml/stuks                         |                                     **2.719 (51,0 %)** |

De README claimt 916 recepten; via de registers zijn er 594 te vinden en op te
halen. Het verschil is niet verklaard en wordt niet weggepoetst: 594 is wat we
hebben.

**Waarom maar 51 % van de regels omrekenbaar is.** De corpus gebruikt twee
systemen naast elkaar. 144 recepten staan op `ratioSystem: "weight"` met
absolute grammen; 422 staan op `"parts"` en 31 op `"bakers_percentage"`, en die
geven verhoudingen zonder basisgewicht. Geteld over de bestanden: **223 van 597
hebben uitsluitend absolute eenheden.** Een verhouding is niet in een
boodschappenlijst om te zetten zonder een getal dat het recept niet noemt, dus
die regels worden geweigerd in plaats van geschat.

### Open Recipe Archive — `AdamBouhmad/open-recipe-archive`

|                                                  |                      |
| ------------------------------------------------ | -------------------: |
| recepten                                         |           **54.843** |
| collecties                                       |                   31 |
| met ingrediënten                                 |       54.843 (100 %) |
| met hoeveelheden                                 |      36.193 (66,0 %) |
| met eenheden                                     |      18.030 (32,9 %) |
| met porties                                      |                    0 |
| met bereidingstijd                               |                    0 |
| met instructies                                  |       54.843 (100 %) |
| met keuken                                       |       54.843 (100 %) |
| dubbele titels                                   |                9.032 |
| **DINNER**                                       |   **6.456 (11,8 %)** |
| POSSIBLE_DINNER                                  |       9.948 (18,1 %) |
| NOT_DINNER                                       |      17.700 (32,3 %) |
| AMBIGUOUS                                        |      20.739 (37,8 %) |
| ingrediëntregels                                 |              388.107 |
| omrekenbaar naar g/ml/stuks                      | **155.193 (40,0 %)** |
| waarvan geweigerd wegens ontbrekende hoeveelheid |     231.354 (59,6 %) |

Verreweg de grootste bron en verreweg de vrijste licentie. Ook verreweg de
lastigste, en dat zit niet in het formaat maar in de inhoud: dit zijn kookboeken
van 1785 tot 1931. Een typisch record:

```
- one water squash
- milk
- salt
- one spoonful of wheat flour
```

Twee regels zonder hoeveelheid, één "spoonful", en een "water squash". Bijna zes
op de tien ingrediëntregels in deze corpus noemen geen hoeveelheid.

### recipe-dataset (13k) — `josephrmartinez/recipe-dataset`

|                             |                           |
| --------------------------- | ------------------------: |
| recepten                    |                **13.489** |
| met ingrediënten            |            13.489 (100 %) |
| met hoeveelheden            |           13.449 (99,7 %) |
| met eenheden                |           13.361 (99,1 %) |
| met porties                 |                         0 |
| met instructies             | 0 (bewust niet ingelezen) |
| dubbele titels              |                       196 |
| **DINNER**                  |        **2.409 (17,9 %)** |
| POSSIBLE_DINNER             |            2.771 (20,5 %) |
| ingrediëntregels            |                   148.312 |
| omrekenbaar naar g/ml/stuks |      **124.622 (84,0 %)** |
| geweigerd: verpakkingsmaat  |             2.499 (1,7 %) |

Structureel de beste van de drie: 84,0 % van de regels is om te rekenen, tegen
51 % en 40 %. En tegelijk de enige die niet gebruikt mag worden — zie hieronder.

De 2.499 geweigerde regels zijn "1 can", "1 package", "1 bunch": een aantal van
iets waarvan het recept de maat niet noemt. Die worden bij naam geweigerd in
plaats van als één stuk geteld — zie de noot bij de eenhedentabel hieronder.

### Public Domain Recipes — `ronaldl29/public-domain-recipes`

Bereikbaar, maar **niet op te sommen**: de recepten staan als losse bestanden in
`content/` en zonder tree-API is er geen manier om te weten welke. De repo heeft
geen manifest en de gepubliceerde site staat niet op de allowlist. 0 recepten
ingelezen, en daarom komt deze bron in geen enkele telling voor.

## Licentie

| bron                 | licentie                  | classificatie   | productierecept? | commercieel publiceren? |
| -------------------- | ------------------------- | --------------- | :--------------: | :---------------------: |
| ForkRecipe           | CC BY-SA 4.0              | `CC_BY_SA`      |        ja        |         **nee**         |
| Open Recipe Archive  | publiek domein (pre-1931) | `PUBLIC_DOMAIN` |        ja        |           ja            |
| recipe-dataset (13k) | zie hieronder             | `UNKNOWN`       |     **nee**      |         **nee**         |

**recipe-dataset is als `UNKNOWN` geclassificeerd, niet als CC BY-SA 3.0.** De
README van de repo zegt zelf dat de data van de Epicurious-website is gescraped,
via Kaggle is verspreid en hier ongewijzigd is herpubliceerd. Geen van die
stappen creëert een licentie. Wat de repo over zijn eigen voorwaarden zegt kan
niet meer rechten verlenen dan de herverpakker zelf had, en de onderliggende
tekst is van Condé Nast.

Gevolg in code, niet in een afspraak: `mayBecomeProduction('UNKNOWN')` is
`false`, dus een kandidaat uit deze bron kan de selectie niet halen. De bron
wordt wel gebruikt waar dat wél mag — het tellen van ingrediëntfrequenties en
het meten van de parser — want dat is analyse over feiten, geen reproductie van
expressie.

**ForkRecipe is CC BY-SA**, dus bruikbaar maar besmettelijk: de tekst
overnemen verplicht ons onze eigen afgeleide onder dezelfde voorwaarden te
delen. Voor een persoonlijke app is dat prima. Voor een commerciële release is
het een keuze die bewust gemaakt moet worden, en daarom staat hij hier apart.

## De kern in één tabel

|                                | ForkRecipe | Open Recipe Archive | recipe-dataset |
| ------------------------------ | ---------: | ------------------: | -------------: |
| omvang                         |        594 |              54.843 |         13.489 |
| structuur (regels omrekenbaar) |       51 % |                40 % |       **84 %** |
| dinners                        |        170 |               6.456 |          2.409 |
| licentie voor productie        |         ja |              **ja** |            nee |
| licentie voor commercie        |        nee |              **ja** |            nee |
| modern eetbaar                 |     **ja** |     nee (1785–1931) |             ja |

Geen enkele bron scoort op alle vier. Dat is de uitkomst van deze census en het
verklaart alles wat er in
[RECIPE_CANDIDATE_REPORT.md](RECIPE_CANDIDATE_REPORT.md) gebeurt.

## Vijf correcties die de tellingen hebben veranderd

Deze census is twee keer gedraaid. De eerste keer met classificatie- en
parserregels die er goed uitzagen en het niet waren; de tweede keer nadat
unittests vijf concrete fouten hadden blootgelegd. De cijfers hierboven zijn de
tweede meting. De eerste stond hier eerder en was op vier plaatsen te laag en op
één plaats te hoog.

| wat er mis was                                                         | gevolg voor de telling                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `\bpotato\b` matcht "potatoes" niet, en corpora schrijven het meervoud | koolhydraat-anker gemist → dinners structureel te laag |
| `pepper` gold als groente, en zwarte peper zit in vrijwel elk recept   | elk kruidenmengsel kreeg een gratis groente-anker      |
| "1 can chicken thighs" — het parserwoordenboek kende "can" niet        | verpakkingsmaat werd als **één stuk** geteld           |
| `parseAmount('1/2')` las de teller als het hele getal                  | halve hoeveelheden verdubbeld                          |
| `parseDuration('45 mins')` gaf niets terug                             | bereidingstijd ontbrak, en viel terug op een standaard |

De derde is de ernstigste, omdat hij stil was: een blik tomaten werd één
tomaat, zonder weigering en zonder melding. Sinds de fix kent de regelparser de
verpakkingswoorden wél, juist zodat `normaliseAmount` ze hardop kan weigeren met
`PACKAGE_DEPENDENT`. Dat is de reden dat de omrekenbaarheid van recipe-dataset
in deze meting **lager** is dan in de eerste (84,0 % tegen 85,7 %): de eerste
meting telde 2.499 verpakkingsregels ten onrechte als omgerekend.

Alle vijf staan nu vastgepind in `tests/unit/recipes/`.
