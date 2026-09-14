# Hoe goed is de weekoptimizer?

Datum: 14 september 2026 · Gemeten op branch `claude/weekly-menu-optimizer-fdagbe`

De weekoptimizer is een heuristiek: hij bouwt niet elke mogelijke week. De vraag
die dit document beantwoordt is **hoeveel dat scheelt** — niet met een gevoel,
maar met een getal. Naast de productiezoektocht staat een uitputtende solver die
op kleine datasets écht elke geldige week doorrekent, met exact dezelfde
scorefunctie. Op 500 gegenereerde werelden zijn beide losgelaten.

Reproduceren: `pnpm bench 500`. Alles is geseed, dus dezelfde cijfers rollen er
op elke machine uit.

---

## Uitkomst

```
500 scenario's

  vergeleken                   500
  overgeslagen                   0
  onvergelijkbaar                0
  correctheidsfouten             0

  exact optimaal           100,0%   (500 van 500)
  gemiddelde gap             0,00%
  mediaan                    0,00%
  p95                        0,00%
  p99                        0,00%
  slechtste                  0,00%

  optimizer                  62,6 ms gemiddeld
  uitputtende solver        266,5 ms gemiddeld
```

Tegen de gestelde targets:

| Maat                   | Target  | Ideaal | Gemeten     | Oordeel |
| ---------------------- | ------- | ------ | ----------- | ------- |
| exact optimaal         | ≥ 95 %  | ≥ 97 % | **100,0 %** | gehaald |
| gemiddelde gap         | < 0,5 % | —      | **0,00 %**  | gehaald |
| p95                    | < 2 %   | —      | **0,00 %**  | gehaald |
| slechtste geval        | < 7 %   | < 5 %  | **0,00 %**  | gehaald |
| gemist haalbaar budget | < 1 %   | —      | **0,0 %** ¹ | gehaald |

¹ Bij een plafond vanaf 1,02× de goedkoopst mogelijke week. Bij exact 1,00×,
waar er per definitie precies één week bestaat die past, wordt 0,5 % gemist.

Voorganger, ter vergelijking, op dezelfde 500 seeds: 90,0 % exact, gemiddeld
0,27 %, p95 1,68 %, slechtste geval 11,68 %.

**Eén waarschuwing hoort bij dit cijfer.** 100 % exact geldt voor werelden van
7 tot 12 recepten — het formaat waarop een uitputtende solver nog meekan. Dat de
optimizer daar niets meer laat liggen bewijst niet dat hij dat bij 250 recepten
ook niet doet; het bewijst dat er geen bekende klasse van gevallen meer is
waarop hij faalt. Voor de grotere formaten staat verderop een zwakkere maar
eerlijke maat.

---

## Waar het optimum verdween

De vorige meting zei hoeveel kwaliteit er wegliep, niet waar. Dat is het
verschil tussen twee reparaties die niets met elkaar te maken hebben: als de
beste week nooit gebouwd wordt, is de zoektocht te smal; als hij gebouwd wordt
en daarna op plek 41 belandt, is de rangschikking fout en is breder zoeken
weggegooid werk.

`pnpm bench:recall` zet het optimum van de solver naast elke fase van de
pijplijn. Gemeten vóór deze fase, 120 scenario's:

| Waar het optimum bleef                   | Aandeel   |
| ---------------------------------------- | --------- |
| gevonden                                 | 89,2 %    |
| een gerecht haalde de receptenpool niet  | **0,0 %** |
| de week viel uit de beam                 | 6,7 %     |
| de week zat in de beam, buiten de top-20 | 4,2 %     |
| volledig geprijsd en tóch verloren       | **0,0 %** |

Twee nullen die veel uitsluiten. De receptenpool gooit nooit een gerecht van het
optimum weg, dus `candidatesPerSlot` verhogen doet niets. En er is geen enkel
geval waarin de optimale week wél volledig doorgerekend werd en tóch verloor —
de scorefunctie en de winnaarskeuze zijn dus in orde, en het probleem zit
uitsluitend in het zoeken.

Hoe ver komt breder zoeken alleen? Recall van de kandidaatgeneratie, per
beambreedte:

| beamWidth | 10     | 20     | 25     | 40     | 50     | 100    | 200    | 400    |
| --------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| recall    | 81,7 % | 88,3 % | 90,8 % | 93,3 % | 94,2 % | 98,3 % | 99,2 % | 99,2 % |

Bij 200 loopt het vast op 99,2 % en 400 voegt niets toe: **in één van de 120
scenario's bouwt de beam het optimum op geen enkele breedte.** Een deelmenu dat
er na drie gerechten onaantrekkelijk uitziet kan als complete week het beste
zijn, en een beam die op elk niveau afkapt komt daar nooit. Geen enkele breedte
repareert dat; één gerecht ruilen vanaf een goede buurweek wel.

En de weken die de beam wél bouwt, rangschikt hij als volgt (breedte 400):

| rang van het optimum | mediaan | p75 | p90 | slechtste |
| -------------------- | ------- | --- | --- | --------- |
|                      | 2       | 6   | 18  | 252       |

Een uitstekende kop en een lange staart. Meestal staat het optimum bovenaan;
soms staat het op plek 252. Om die staart met doorrekenen te vangen zou je
honderden weken volledig moeten prijzen — twintig keer het werk voor de tien
procent gevallen waar het om gaat.

**Conclusie van de meting:** dit is een rangschikkingsprobleem, geen
zoekruimteprobleem. Dat is precies waarom de reparatie geen bredere beam is.

---

## Wat elke stap oplevert

`pnpm bench:ablation 120`. Elke variant is een configuratie, niet een aparte
codepad — zo blijft de oude optimizer permanent draaibaar en kan geen variant
stiekem in iets anders verschillen dan de instelling die getest wordt. Elk
scenario houdt zijn eigen gewichten; een variant doorrekenen met andere
gewichten dan de solver gebruikte, geeft cijfers die plausibel ogen en nergens
op slaan.

| variant                           | exact   | gem.   | p99    | slechtst | ms   | p95 ms |
| --------------------------------- | ------- | ------ | ------ | -------- | ---- | ------ |
| baseline (beam 40, top-20)        | 89,2 %  | 0,33 % | 6,97 % | 7,09 %   | 16,4 | 51,1   |
| beam 100, top-100 (alleen breder) | 98,3 %  | 0,05 % | 1,21 % | 5,25 %   | 61,0 | 199,9  |
| + 1-swap                          | 98,3 %  | 0,02 % | 1,13 % | 1,83 %   | 24,0 | 69,6   |
| + 2-swap                          | 100,0 % | 0,00 % | 0,00 % | 0,00 %   | 36,4 | 96,9   |
| + 2 startpunten                   | 100,0 % | 0,00 % | 0,00 % | 0,00 %   | 50,5 | 119,8  |

De reservoirs uit de volgende paragraaf staan hier niet in: op werelden van
twaalf recepten valt er na 2-swap niets meer te winnen, dus ze veranderen deze
tabel niet. Ze verdienen hun plek op de grote catalogi.

Geen enkele variant scoort op ook maar één seed slechter dan de baseline, en
geen enkele variant produceerde een correctheidsfout.

Wat er uit valt af te lezen:

- **Alleen breder zoeken werkt, maar duur.** Beam 100 met top-100 haalt 98,3 %
  voor bijna vier keer de rekentijd, en houdt een slechtste geval van 5,25 %.
- **Eén gerecht ruilen is goedkoper én beter in de staart.** Dezelfde 98,3 %
  voor 24 ms, en een slechtste geval van 1,83 % in plaats van 5,25 %.
- **Twee gerechten tegelijk halen de rest op.** Precies de gevallen die
  overbleven hadden twee wijzigingen tegelijk nodig; geen enkele reeks losse
  ruilen komt daar, want de tussenstap is slechter dan het vertrekpunt.
- **Een breder beam helpt wél onder de verfijning.** Van 40 naar 100 in zijn
  eentje: 89,2 % → 90,0 %. Onder het ruilen: het slechtste geval van 4,36 % naar
  1,83 %. Niet omdat er meer weken doorgerekend worden, maar omdat er _andere_
  twintig doorgerekend worden, en de verfijning dus ergens anders begint.

En één waarschuwing tegen intuïtie: **meer weken volledig doorrekenen maakte het
slechter.** `fullyEvaluatedWeeks` van 20 naar 50 kostte twee tot drie keer de
rekentijd en gaf een slechter slechtste geval (2,17 % tegen 1,83 %). Een betere
startweek kan in een slechter lokaal optimum lopen. Daarom staat hij nog steeds
op 20.

---

## Hoe de zoektocht nu werkt

Drie fasen, elk met een eigen bestand en een eigen budget.

**Stage A — kandidaatgeneratie** (`candidates.ts`). Beam search over de zeven
dagen, gededupliceerd op de verzameling gerechten zodat de beam niet volloopt
met permutaties van één menu. Rangschikt op een ruwe schatting die hele pakken
van het per kilo goedkoopste product telt. Die schatting is opzettelijk
pessimistisch — zie "Wat er onderweg misging".

Niet één breedte maar **drie: 40, 100 en 200**, om de beurt afgetapt. Zie
"Waarom drie beambreedtes" hieronder; dat was de laatste vondst van deze fase en
de enige die het gedrag op grote catalogi echt veranderde.

**Stage B — volledig doorrekenen** (`evaluate-week.ts`). De twintig best
geschatte weken door de échte scorefunctie: aggregatie, verpakkingen,
aanbiedingen, winkelcombinaties, reiskosten, voeding, verspilling, variatie.

**Stage C — verfijnen** (`local-search.ts`). Vanaf de beste twee doorgerekende
weken: ruil één gerecht, herprijs met de **volledige** scorefunctie, neem de
beste verbetering, herhaal tot niets meer verbetert. Daarna hetzelfde met twee
gerechten tegelijk. Nooit met een goedkopere heuristiek — juist de blindheid van
die schatting voor winkelverdeling en aanbiedingen is de oorzaak die dit moet
repareren.

Waarom twee startpunten: een hebzuchtige wandeling erft het geluk van waar hij
begint. Tegen het best bekende resultaat op grote werelden haalde één startpunt
drie scenario's niet; twee startpunten halen er daarvan twee alsnog en brengen
de gemiddelde afwijking van +0,42 % naar +0,09 %. Drie startpunten kosten de
helft meer en vinden niets wat twee niet vindt.

Budgetten, allemaal in `DEFAULT_SEARCH_CONFIG`: 200 evaluaties voor het ruilen
van één gerecht, 200 voor twee, hoogstens acht rondes, twee startpunten. Het
evaluatiebudget wordt **tussen** rondes besteed en nooit middenin: halverwege
stoppen zou van "beste verbetering" stilletjes "beste verbetering onder maandag,
dinsdag en de helft van woensdag" maken, en dan bepaalt de volgorde waarin de
dagen langskomen de uitkomst.

---

## Waarom drie beambreedtes

Dit was de laatste vondst van deze fase, en hij ging tegen de verwachting in.

Eén scenario uit de grote-werelden-benchmark — seed 107922, 100 recepten —
weigerde mee te werken: de **oude** optimizer vond er een betere week dan de
nieuwe. Uitgeplozen per instelling:

| instelling                     | score    |
| ------------------------------ | -------- |
| beam 40, géén verfijning (oud) | 1914     |
| beam 40 + verfijning           | 1617     |
| beam 60 + verfijning           | 1992     |
| beam 100 + verfijning          | 1992     |
| beam 200 + verfijning          | **1552** |

**Een bredere beam is niet betrouwbaar een betere beam.** De breedte bepaalt
welke deelweken elk slot overleven, en een menu dat er na drie gerechten
onaantrekkelijk uitziet kan als complete week het beste zijn. Welke breedte
gelijk heeft, hangt van het scenario af.

Dat maakt elke vaste breedte een willekeurige gok. De oplossing is er drie te
draaien — 40, 100 en 200 — en hun resultaten om de beurt af te tappen in plaats
van ze samen te voegen en opnieuw op schatting te sorteren. Dat laatste zou de
hele shortlist teruggeven aan de breedte die toevallig de laagste schattingen
produceert, precies het ene gezichtspunt waar dit vanaf moet.

Kosten: twee extra beam-passes, verwaarloosbaar naast het prijzen van een week.
Opbrengst: op seed 107922 een week die **19 % beter** scoort dan wat de vaste
breedte 100 vond, en over alle grote werelden een gemiddelde afwijking van
+2,36 % naar +0,00 % bij 100 recepten.

Dit is het enige reservoir dat gebouwd is, en het is gebouwd omdat de meting
erom vroeg — niet omdat meerdere reservoirs een goed idee leken.

### Eén meting die twee keer gecorrigeerd moest worden

De eerste conclusie was dat twéé startpunten dit geval oplosten. Dat was fout:
de regel die de afwijking meldde stond buiten het stuk uitvoer waar ik naar
keek. De tweede conclusie was dat de nieuwe optimizer hier gewoon slechter was
dan de oude. Ook fout: beide vonden 1914 respectievelijk 1992, terwijl 1552
bestond en geen van beide hem zag.

Dat is precies waarom het corpus de beste score van **álle** varianten bewaart en
niet die van de huidige. Een benchmark die alleen de huidige instelling bijhoudt,
beoordeelt de optimizer tegen zichzelf en meldt tevreden dat er niets te
verbeteren valt.

---

## De ondergrens: exacte snoei, geen vermomde heuristiek

Een buur wordt overgeslagen als bewijsbaar vaststaat dat hij niet kan winnen.
Dat is alleen eerlijk als de ondergrens echt onbereikbaar is — een grens die
"meestal klopt" is geen grens maar een heuristiek met een hoed op, en gooit het
optimum weg precies in de gevallen waar hij ernaast zit.

Elke term is daarom exact of weggelaten:

| term                                                                                 | behandeling                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boodschappen                                                                         | goedkoopste verpakking per ingrediënt bij wélke winkel dan ook — het winkelmaximum wordt gerelaxeerd, en een constraint laten vallen kan de uitkomst alleen verlagen |
| voeding                                                                              | exact — hangt alleen van de gerechten en het gezin af                                                                                                                |
| herhaling                                                                            | exact — idem, inclusief dezelfde geneste afronding                                                                                                                   |
| voorkeuren                                                                           | exact — en de enige term die negatief kan zijn                                                                                                                       |
| reiskosten, extra-winkelopslag, verspilling, budgetoverschrijding, onbeschikbaarheid | weggelaten; nooit negatief                                                                                                                                           |

De laatste cent wordt weggegeven omdat `scoreWeek` zijn totaal half-up afrondt.

Geverifieerd op **4.078 complete weken in 25 werelden: nul overschrijdingen**
(`tests/unit/optimization/lower-bound.test.ts`).

Er wordt afgerekend tegen de week die de ronde probeert te verslaan, niet tegen
de beste ooit gevondene. Dat laatste zou meer snoeien en nog steeds nooit het
antwoord weggooien, maar het kan de wandeling verleggen — en een versnelling die
stilletjes de uitkomst verandert is geen versnelling.

**Wat de snoei oplevert is niet minder werk maar dieper zoeken.** Hetzelfde
evaluatiebudget dekt ongeveer 1.200 extra buren op de demodataset, en daarmee
ging 120 seeds van 98,3 % naar 100,0 % exact.

### Een aanname die níét klopte

De meest voor de hand liggende ondergrens voor een boodschappenrekening is
"hoeveelheid × de beste prijs per gram die er te vinden is". Die is **onveilig**,
want hij gaat ervan uit dat meer kopen meer kost. Dat is niet waar: een
3-voor-€2,60 maakt drie pakken goedkoper dan twee, en de verpakkingssolver pakt
dat terecht. De "ondergrens" zou dan bóven de echte prijs liggen en het optimum
wegsnoeien zonder dat iemand het merkt.

Vastgelegd in een test, zodat een toekomstige optimalisatie die op monotonie
leunt erover struikelt in plaats van eroverheen te lopen.

---

## Het harde budgetmaximum

Een plafond is de enige instelling waar "goed genoeg" het verkeerde antwoord is:
"geen week past onder € 50" terwijl er wél een past, is geen iets minder goed
plan maar een onware mededeling.

Het plafond wordt daarom afgeleid van de **goedkoopste week die de solver
vindt**, niet als fractie van een typische prijs. Bij factor 1,00 past er per
definitie precies één week; elke factor daarboven is aantoonbaar haalbaar. Een
misser is dan ondubbelzinnig van de optimizer en nooit van het scenario.

`pnpm bench:budget 200`:

| plafond                       | gehaald | gemist    | ergste overschrijding |
| ----------------------------- | ------- | --------- | --------------------- |
| 1,00× de goedkoopst mogelijke | 199/200 | **0,5 %** | 9,70 %                |
| 1,02×                         | 200/200 | **0,0 %** | —                     |
| 1,05×                         | 200/200 | **0,0 %** | —                     |
| 1,10×                         | 200/200 | **0,0 %** | —                     |
| 1,25×                         | 200/200 | **0,0 %** | —                     |

Was: 4,1 % gemist.

**Wat het repareerde.** Zolang het plafond niet gehaald is, rangschikt de
verfijning op boodschappenbedrag in plaats van op totaalscore. `comparePlans`
zet weken die passen altijd vóór weken die niet passen, maar daaronder beslist
de volledige score — en die loopt vrolijk naar een mooiere week die net zo
onbetaalbaar is. Zodra iets past telt de volledige score weer, dus het is
letterlijk fase 1 "vind iets haalbaars", fase 2 "optimaliseer binnen het
haalbare", in een handvol regels en zonder nieuwe architectuur.

De teruggegeven week wordt altijd door de échte winnaarsregel gekozen uit alles
wat onderweg gezien is. Een zoektocht naar betaalbaarheid kan daardoor nooit
iets slechters opleveren dan waar hij begon.

**Een fout in de meting zelf.** `budgetFactor` stond in `ScenarioOptions` en
werd nergens gebruikt — de benchmark kon dus helemaal geen plafond zetten en elke
run met `--budget` mat gewoon de gewone situatie. Vervangen door een echt bedrag.

---

## Grote werelden

Boven een stuk of vijfentwintig recepten is er geen optimum meer om tegen af te
zetten: C(25, 7) is 480.700 volledig doorgerekende weken en het wordt alleen maar
erger. De meting daar laten vallen zou makkelijk en fout zijn, want de formaten
die niemand kan verifiëren zijn precies de formaten die een echte receptenbank
heeft.

De meetlat verandert dus in plaats van te verdwijnen.
`tests/support/best-known.json` legt per scenario de beste score vast die ooit
gehaald is — door **wélke variant dan ook**, de oude optimizer inbegrepen.

Dat "wélke dan ook" is wezenlijk. Het corpus is daardoor een _unie_, geen doel
dat één instelling kan reproduceren: op deze schaal wint elke instelling andere
scenario's. Precies matchen eisen zou de meting permanent rood maken en niets
leren. Daarom geldt een marge van 2 % — ruim boven het verschil tussen de
gemeten instellingen, ruim onder wat als een slechtere week zichtbaar is — en
worden kleinere afwijkingen wel gemeld maar niet als regressie geteld.

`pnpm bench:large`, 12 seeds per formaat:

| recepten | ms mediaan | ms p90 | tegen best bekend | deterministisch |
| -------- | ---------- | ------ | ----------------- | --------------- |
| 25       | 459        | 1078   | 0,00 %            | ja              |
| 50       | 408        | 496    | +0,09 %           | ja              |
| 100      | 469        | 645    | 0,00 %            | ja              |
| 250      | 425        | 674    | 0,00 %            | ja              |

Eén scenario blijft 1,06 % onder het best bekende resultaat (seed 187112 bij 50
recepten). Dat wordt gemeld en niet weggepoetst.

Dezelfde seeds met de baseline-optimizer (`pnpm bench:large --baseline`):

| recepten | ms mediaan | tegen best bekend |
| -------- | ---------- | ----------------- |
| 25       | 19         | +6,36 %           |
| 50       | 16         | +3,53 %           |
| 100      | 15         | +6,27 %           |
| 250      | 16         | +8,56 %           |

Op grote catalogi levert de nieuwe optimizer dus **3,5 % tot 8,6 % betere weken**
voor ongeveer twintig keer de rekentijd — en de rekentijd groeit niet mee met de
catalogus, omdat de kandidatenpoel begrensd is.

Determinisme is expliciet getoetst: twee identieke runs, identiek plan, op elk
formaat.

---

## Snelheid

`pnpm bench:perf`, gemiddelde over vijf runs:

```
De catalogus die een gebruiker vandaag ziet

  demo, 1 winkel                  1354 ms
  demo, 2 winkels                 1426 ms
  demo, 3 winkels                 1451 ms
  demo, hard budgetmaximum        1097 ms

Een catalogus die een stuk groter is

  112 recepten, 3 winkels         1400 ms
  224 recepten, 3 winkels         1921 ms
  448 recepten, 3 winkels          810 ms
```

Alles binnen de gestelde twee seconden, maar niet meer in de categorie
"uitstekend", en de marge op 224 recepten is smal. Dit is een bewuste ruil: de
opdracht stelde kwaliteit boven honderd milliseconden latency, en dit is wat die
kwaliteit kost — van 65 ms in V1 naar ongeveer 1,4 s, voor een optimizer die op
alles wat verifieerbaar is niets meer laat liggen.

De rekentijd groeit **niet** mee met de catalogus: 448 recepten kost minder dan
112, omdat elke fase een harde bovengrens uit de configuratie heeft en alleen het
rangschikken met de catalogus meeschaalt. De piek bij 224 is een eigenschap van
die dataset, geen trend.

Knoppen, als latency later toch zwaarder gaat wegen — elk één regel in
`DEFAULT_SEARCH_CONFIG`, en elk gemeten:

| knop                | levert op  | kost                                              |
| ------------------- | ---------- | ------------------------------------------------- |
| `restarts: 1`       | ~40 % tijd | +0,33 % gemiddelde afwijking op grote werelden    |
| `beamWidths: [100]` | ~25 % tijd | één gemeten week 19 % slechter op 100 recepten    |
| `twoSwap: false`    | ~35 % tijd | 100 % → 98,3 % exact, slechtste geval 0 % → 1,8 % |

### Een meetfout die eruit moest

De grote-catalogusmeting klopte niet. `inflatedRecipes` maakte de catalogus
groter door recepten te **klonen**, en klonen zijn hetzelfde gerecht — dus werd
de goedkoopste week vijf keer dezelfde pasta. Dat is inderdaad goedkoop, en het
is precies het zwaarste geval voor de verpakkingssolver: weinig ingrediënten in
enorme hoeveelheden. De benchmark mat "de hele week één gerecht eten is traag"
en presenteerde dat als "een grote catalogus is traag" — 2,6 tot 3,1 seconden,
wat bijna de verkeerde beslissing over 2-swap opleverde.

De kloon verschuift nu zijn ingrediënten, keuken en eiwit, zodat de catalogus
groeit in variatie in plaats van in kopieën. Daarmee kost de grootste catalogus
785 ms.

### Waar de tijd heen gaat

Per volledig doorgerekende week, demodataset, drie winkels:

```
  aggregatie                       0,07 ms
  verpakkingsmatrix                0,61 ms
  winkelcombinaties                0,31 ms
  volledige evaluatie              0,91 ms
```

De verpakkingsmatrix domineert. Twee dingen halen daar werk uit, beide exact:

- **Verpakkingscache.** Hoeveel pakken rijst je bij de Lidl koopt hangt af van
  hoeveel rijst de week nodig heeft en van niets anders. De verfijning prijst
  honderden weken die in één gerecht verschillen, dus zes van de zeven gerechten
  vragen telkens exact dezelfde hoeveelheden. Gemeten: 41 % treffers.
- **Uitleg alleen voor de winnaar.** `buildWeekReasons` en `buildDayReasons`
  werden voor élke kandidaatweek gebouwd en voor één getoond. De winnaar wordt
  nu één keer opnieuw geprijsd, mét uitleg.

---

## Wat er onderweg misging en verbeterd is

Bewaard omdat een benchmark die alleen eindstanden laat zien niets leert.

### De variatiepoort blokkeerde het optimum

De variatieregels waren een veto: een week met twee keer kip kon niet eens
gebouwd worden. In het slechtste gemeten scenario was het optimum precies zo'n
week, € 13 goedkoper. Nu is herhaling geprijsd met hetzelfde gewicht als in de
scorefunctie, zodat de zoektocht de afweging maakt die hij altijd had moeten
maken — en het speciale geval voor huishoudens die de regels niet kúnnen halen,
verdween ermee.

### De volgorde van de week werd nooit geoptimaliseerd

Alleen de regel "niet drie keer dezelfde keuken achter elkaar" hangt van de
volgorde af. De solver probeerde volgordes, de optimizer nam de volgorde die de
beam toevallig opleverde — dus mat de benchmark deels een verschil dat niets met
zoeken te maken had. Nu doen beide een exacte branch-and-bound over de
volgordes, behalve in de vervang-flow: daar is de volgorde een keuze van de
gebruiker.

### De heuristiek "won" van de uitputtende solver

Op twee seeds scoorde de heuristiek beter dan het exhaustieve optimum, wat
onmogelijk is. `bestOrdering` was zelf heuristisch en gaf soms de volgorde van de
aanroeper terug. Herschreven als exacte branch-and-bound. De benchmark heeft nu
een expliciete controle (`WORSE_THAN_OPTIMAL_IS_FINE_BUT_THIS_IS_IMPOSSIBLE`) die
hierop afgaat, want als dit gebeurt zijn alle andere cijfers betekenisloos.

### Een verbetering die het regressiecorpus tegenhield

Aanbiedingen meenemen in de ruwe schatting lijkt evident juist — de kassa rekent
ze ook. Over 120 scenario's verbeterde het gemiddelde. Het slechtste geval ging
van 11,7 % naar 27,7 %, omdat de aanbieding hoort bij de winkel die per gram het
goedkoopst is en het plan daar misschien niet komt. Een schatting die optimistisch
is over een korting die het plan niet kan innen, is slechter dan een die
consequent voorzichtig is.

**Dit is niet opnieuw geprobeerd in deze fase**, precies zoals gevraagd: er is
geen nieuw bewijs dat het anders zou uitpakken, en het geval dat het afwees staat
gepind.

### Twee tests die te streng waren om waar te zijn

De boodschappenlijst mocht "hoogstens één regel per ingrediënt" hebben. Dat hield
toevallig stand tot de zoektocht een week vond waarin kikkererwten het goedkoopst
zijn als één blik van 800 g plus één van 400 g. Dat is de juiste uitkomst. De test
toetst nu wat hij bedoelde: de lijst spiegelt de **verpakking**, nooit het menu,
en de verpakking wordt per week opgelost en niet per dag.

De zoekruimtetest toetste `weeksFullyEvaluated ≤ weeksGenerated` — waar sinds de
verfijning niets meer van klopt, want die prijst weken die de beam nooit bouwde.
Nu wordt er getoetst tegen de geconfigureerde grenzen.

---

## De regressieset

Statistiek alleen leert je niets twee keer. Deze seeds staan vast in
`tests/integration/optimizer-quality.test.ts`. Alle tien waren ooit een gemeten
misser — de slechtste gevallen van 500 scenario's, met gaps van 3 % tot 12 %.
Alle tien zijn nu **exact**, en daar zijn ze op vastgezet: alles boven nul is een
regressie met een seed eraan.

| seed    | wat het geval bijzonder maakt                             |
| ------- | --------------------------------------------------------- |
| 3228008 | was het slechtste van 500: 3 winkels, maar 1 toegestaan   |
| 3869447 | veel verspilling tegenover een dure herhalingsboete       |
| 955255  | de winkelcombinatie weegt zwaarder dan het menu           |
| 883984  | verpakkingsgroottes en aanbiedingen bepalen alles         |
| 250464  | precies 7 kandidaten: alleen de volgorde is nog een keuze |
| 131679  | krappe variatieregels met drie winkels                    |
| 3988232 | was het slechtste toen 1-swap er eenmaal in zat           |
| 2420270 | was het slechtste toen 2-swap er eenmaal in zat           |
| 377168  | weerstond elke verbreding van de beam                     |
| 234626  | het zwaarste budgetgeval dat gemeten is                   |

---

## Hoe dit gemeten is

**Dezelfde meetlat voor beide.** De optimizer en de solver delen `evaluateWeek`
en `selectBestPlan`. Ze verschillen uitsluitend in welke weken ze aanbieden,
nooit in hoe een week beoordeeld wordt — anders meet de benchmark het verschil
tussen twee meningen over "goed" in plaats van de kwaliteit van de zoektocht. De
solver staat met een ESLint-regel buiten de applicatielaag.

**De scenario's.** Eén integer per wereld, geen klok en geen `Math.random`.
Gevarieerd: 7–12 recepten, 5–12 ingrediënten, 1–3 winkels, verpakkingsgroottes,
alle vijf de aanbiedingstypes, 1–3 gezinsleden, voorkeuren, én de gewichten voor
verspilling, herhaling en winkelopslag. Dat laatste telt: een zoektocht die
alleen op de standaardinstellingen goed presteert is daarop afgesteld en niet
gezond.

**Correctheid staat los van kwaliteit.** Kwaliteit is een meting met een
ondergrens; correctheid is absoluut. Elke geproduceerde week wordt apart getoetst
op dieetregels, het winkelmaximum, verzwegen ontbrekende producten,
aanbiedingsvoorwaarden en of de verpakkingsregels optellen tot het weektotaal.
Nul fouten over alle 500 scenario's, in elke variant.

---

## De tien vragen van deze fase, beantwoord

1. **Waar verdwijnen optimale weken?** Nooit in de receptenpool (0 %). Vóór deze
   fase: 6,7 % viel uit de beam, 4,2 % zat erin maar buiten de top-20. Nu: 0 %.

2. **Is het een zoekprobleem of een rangschikkingsprobleem?** Rangschikking. Het
   optimum staat mediaan op rang 2 van de gegenereerde weken, maar p90 op 18 en
   in het slechtste geval op 252. Nul gevallen waarin een volledig doorgerekend
   optimum alsnog verloor, dus de scorefunctie is niet de oorzaak.

3. **Hoeveel kandidaten zijn er nodig?** Recall loopt van 93,3 % bij breedte 40
   naar 98,3 % bij 100 en stopt op 99,2 % bij 200. Breedte 400 voegt niets toe:
   in één van de 120 scenario's bouwt de beam het optimum op **geen enkele**
   breedte. Breder zoeken heeft dus een plafond dat onder 100 % ligt.

4. **Wat is de kleinste top-K met vrijwel gelijke kwaliteit?** 20 — en groter is
   aantoonbaar slechter. 50 en 100 kosten twee tot drie keer de rekentijd en
   gaven een slechter slechtste geval, omdat een betere startweek in een slechter
   lokaal optimum kan lopen.

5. **Betaalt 1-swap zich terug?** Ja, het meest van alles. 89,2 % → 98,3 % exact
   en het slechtste geval van 7,09 % → 1,83 %, voor 24 ms tegen 16 ms. Goedkoper
   én beter dan breder zoeken (61 ms, 5,25 % slechtste geval).

6. **Betaalt 2-swap zich terug?** Ja. 98,3 % → 100 % en het slechtste geval naar
   nul, voor 36 ms tegen 24 ms. Precies de resterende gevallen hadden twee
   wijzigingen tegelijk nodig — geen reeks losse ruilen komt daar, want de
   tussenstap is slechter dan het vertrekpunt. De eerste meting suggereerde dat
   het te duur was; die meting was zelf kapot (zie "Snelheid").

7. **Zijn meerdere reservoirs nodig?** Eén soort wel, de andere niet. De
   multi-objective reservoirs uit het voorstel — laagste afval, beste
   voorkeuren, beste nutritiefit — zijn niet gebouwd: de meting wees uit dat het
   optimum al hoog in de ranglijst stond, dus een ander rangschikkingscriterium
   lost niets op. Wat wél nodig bleek is een reservoir per **beambreedte**,
   omdat een bredere beam aantoonbaar niet betrouwbaar beter is (zie hierboven).
   En het budgetreservoir bestaat nu als de fase-1-rangschikking in de
   verfijning: vijf regels in plaats van een tweede generatiepijplijn.

8. **Helpt feasibility-first bij een hard budget?** Ja. Gemiste haalbare
   plafonds van 4,1 % naar 0,0 % vanaf 1,02× de goedkoopst mogelijke week, en
   0,5 % bij exact 1,00× waar er precies één week bestaat die past.

9. **Is er veilige pruning, en levert die iets op?** Ja en ja, maar niet op de
   manier die je verwacht. Geverifieerd op 4.078 weken zonder één overschrijding.
   De winst zit niet in minder werk maar in dieper zoeken binnen hetzelfde
   budget: ongeveer 1.200 extra buren, en daarmee 98,3 % → 100 %.

10. **Houdt de kwaliteit stand bij grotere catalogi?** Voor zover meetbaar, ja.
    Bij 25 tot 250 recepten kan niets meer exact geverifieerd worden, maar tegen
    de baseline op dezelfde seeds levert de nieuwe optimizer 3,5 % tot 8,6 %
    betere weken, volledig deterministisch, in 408–469 ms mediaan. Eén van de 48
    scenario's blijft 1,06 % onder het best bekende resultaat. De rekentijd
    groeit niet mee met de catalogus.

---

## Wat hierna: echte supermarktdata

De targets zijn gehaald, dus het antwoord op "eerst nog een optimalisatieronde of
door naar echte data?" is: **door naar echte data.** Er is geen bekende klasse
van gevallen meer waarop de optimizer faalt, en verder optimaliseren zonder
echte prijzen is optimaliseren tegen verzonnen invoer.

Twee dingen om mee te nemen.

**De latency-marge is smaller geworden.** De demo zit op 1,45 s van de 2 s, en
de zwaarste gemeten catalogus op 1,92 s. Echte data maakt elke evaluatie duurder
— meer producten per ingrediënt betekent een grotere verpakkingszoektocht, meer
winkels betekent meer combinaties. Meet dat opnieuw zodra de eerste echte feed
binnen is. De drie knoppen in "Snelheid" geven elk 25 tot 40 procent terug tegen
een gemeten prijs in kwaliteit; `restarts: 1` is de goedkoopste van de drie.

Eerlijk gezegd is dit het punt waar deze fase ophoudt nuttig te zijn. Verder
optimaliseren zonder echte prijzen is optimaliseren tegen verzonnen invoer, en
de volgende echte winst zit niet in de zoektocht maar in de vraag of de prijzen
kloppen.

**Wat er als eerste nodig is, in deze volgorde:**

1. **Productprijzen per winkellocatie, met verpakkingsgrootte en eenheid.** Dit
   is het fundament: zonder `packageAmount` in een genormaliseerde eenheid kan de
   verpakkingssolver niets, en die bepaalt de rekening. Een prijs zonder
   pakgrootte is onbruikbaar.
2. **Koppeling product → canoniek ingrediënt.** Het lastigste stuk en het
   makkelijkst te onderschatten. Een recept mag nooit aan een merk of
   winkelproduct vastzitten; die koppeling is een aparte, onderhouden laag. Reken
   op handmatige correctie en bouw daar vanaf dag één ruimte voor.
3. **Aanbiedingen met geldigheidsvenster en minimumaantal.** De vijf types die de
   engine kent dekken wat AH, Jumbo en Lidl in de praktijk doen. Belangrijk is de
   geldigheidsdatum: een verlopen aanbieding die als korting wordt getoond is een
   onware mededeling, geen afrondingsfout.
4. **Beschikbaarheid per locatie.** De optimizer rekent onbeschikbaarheid al af
   en meldt het; zonder echte voorraadinformatie is dat een aanname.
5. **Prijsgeschiedenis.** Alleen nodig om "dit is echt een aanbieding" te kunnen
   onderbouwen in plaats van te beweren. Kan later.

En de randvoorwaarde die blijft gelden: neem niet aan dat deze bronnen gratis of
vrij herbruikbaar zijn, en label alles wat geen geverifieerde actuele
prijsinformatie is duidelijk als demo.
