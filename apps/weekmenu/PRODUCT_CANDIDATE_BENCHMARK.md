# Reviewwachtrij en productkandidaten, gemeten

Datum: 14 september 2026 · Echte AH-data uit de Checkjebon-momentopname ·
Reproduceren: `pnpm match:review`, `pnpm perf:real`, `pnpm perf:stress`

Twee doelen deze fase: van de reviewwachtrij iets maken dat een mens kan
afwerken, en de latency omlaag brengen zonder de gekozen oplossing te
verslechteren. De zoekstrategie is niet aangeraakt.

---

## Samenvatting

|                                         | voor          | na            |
| --------------------------------------- | ------------- | ------------- |
| reviewbeslissingen die er echt toe doen | 1.172 (alles) | **146**       |
| beoordelingen tot 96 % gewogen dekking  | onbekend      | **1**         |
| productkandidaten p95 per ingredient    | 11            | **6**         |
| optimizer gemiddeld (100 weken)         | 1.506 ms      | **1.252 ms**  |
| optimizer p95                           | 2.274 ms      | **2.084 ms**  |
| uitkomsten die verslechterden           | —             | **0 van 100** |

Doel `mean < 1,5 s` gehaald. Doel `p95 < 2,0 s` **niet** gehaald: 2,08 s. Waarom
dat niet verder is opgerekt staat onderaan.

---

## De reviewwachtrij

### Wat er in zat

1.232 producten in `NEEDS_REVIEW` over 94 ingrediënten. Ongesorteerd is dat geen
wachtrij maar een muur, en het overgrote deel verandert niets: een veertiende
cashewnoot voor een ingredient dat er al tien bruikbare heeft, beweegt geen week.

### Wat er na prioritering overblijft

Iedere regel krijgt een score uit vier termen — receptfrequentie, dekkingsgat,
schaarste, en of het product überhaupt bruikbaar zou zijn — en elke regel kan
uitleggen waar hij staat.

| band       | producten | betekenis                                                                    |
| ---------- | --------- | ---------------------------------------------------------------------------- |
| **HIGH**   | **20**    | ingredient dat recepten nodig hebben en dat nog geen bruikbaar product heeft |
| **MEDIUM** | **126**   | te weinig alternatieven voor hoe vaak het gebruikt wordt                     |
| LOW        | 141       | relevant, maar weinig winst                                                  |
| OPTIONAL   | 860       | ingredient heeft al ≥ 3 bruikbare producten in ≥ 2 maten                     |
| IRRELEVANT | 85        | geen enkel actief recept gebruikt dit                                        |

**146 van 1.232 zijn de moeite waard.** De rest is niet "nog niet gedaan" maar
"klaar" of "niet ons probleem", en dat onderscheid is expres bewaard: alleen het
tweede verandert als de receptcatalogus groeit.

De belangrijkste ontwerpkeuze zit in `OPTIONAL`. Knoflook komt in 31 recepten
voor — veruit de hoogste frequentie — en heeft vier bruikbare producten in
meerdere maten. Een vijfde verandert niets. Populariteit zegt hoeveel een
ingredient _ertoe doet_, niet dat er nog een beslissing over te nemen valt, en
de score laat dekking daarom zwaarder wegen dan frequentie.

### Hoeveel beoordelingen zijn er nodig

Gemeten, greedy, ingrediënten op volgorde van hoeveel gewogen dekking ze kopen:

| doel | beoordelingen                  |
| ---- | ------------------------------ |
| nu   | 94,8 %                         |
| 96 % | **1** (verse gember)           |
| 97 % | **2** (+ verse basilicum)      |
| 98 % | **onbereikbaar met deze bron** |
| 99 % | **onbereikbaar met deze bron** |

Eén beslissing tilt de gewogen dekking naar 96 %. Daarboven houdt het snel op,
en niet omdat de wachtrij op is: de resterende ingrediënten hebben geen enkel
bruikbaar product in de AH-feed. Dat blijft een `SOURCE_GAP` en wordt niet
opgelost met een soepelere match — zie AH_MATCHING_GAPS.md.

---

## Productkandidaten

### De verdeling

De aanname was een kandidaatexplosie — tientallen bijna identieke pakken pasta.
Dat klopt niet:

|                           | mediaan | p75 | p90 | p95 | max |
| ------------------------- | ------- | --- | --- | --- | --- |
| kandidaten per ingredient | 3       | 5   | 9   | 11  | 22  |

461 bruikbare aanbiedingen over 97 ingrediënten, gemiddeld 4,5. De zwaarste zijn
melk (22), kipfilet (18), cashewnoten (14), ei en rundergehakt (13).

Dat is geen explosie, en dus was kandidaatreductie nooit de grote hefboom. Het
was wel _een_ hefboom, zie hieronder.

### De regel

Eén regel, `IDENTICAL_PACKAGE_CHEAPER`: zelfde ingredient, zelfde winkel,
**exact dezelfde verpakkingsgrootte**, geen promotie, nutritioneel niet te
onderscheiden — dan overleeft alleen de goedkoopste.

Wat er bewust **niet** wegvalt:

- **andere verpakkingsgroottes.** 500 g voor € 1,00 domineert 1 kg voor € 1,80
  niet: een week die 900 g nodig heeft is met het grote pak goedkoper. Dit is
  precies waar een top-N op prijs per gram de fout in gaat.
- **alles met een promotie.** Een multi-buy kan bij het ene aantal wel en bij het
  andere niet goedkoper zijn, dus geen enkele prijsvergelijking beslist dat.
- **producten met afwijkende voedingswaarden.** Als de objective ze uit elkaar
  kan houden, zijn ze niet uitwisselbaar.

### Bewijs

Negen property tests, waarvan één de eigenlijke garantie draagt: over duizend
willekeurige catalogi en negen verschillende benodigde hoeveelheden moet de
goedkoopste manier om die hoeveelheid te kopen uit de _overgebleven_ producten
exact evenveel kosten als uit alle producten. Nul afwijkingen.

Verder: nooit een gepromoot product verwijderd, altijd minstens één product per
groep over, deterministisch en idempotent, en elke verwijdering noemt een
overlever die aantoonbaar niet duurder is.

### Wat het opleverde

461 → **319 aanbiedingen, 142 weg (30,8 %)**. Per ingredient zakt p95 van 11 naar
6 en het maximum van 22 naar 12.

Het echte effect zit in het werk dat de verpakkingssolver doet: **159.193 →
85.422 verpakkingsberekeningen** in één weekgeneratie, bijna een halvering.

---

## Waar de tijd zat

Kostenladder op één echte week, elke trede voegt één stap toe:

| tot en met                | ms    | weken geprijsd | score |
| ------------------------- | ----- | -------------- | ----- |
| stage A + B               | 240   | 20             | 7146  |
| + 1-swap, 1 startpunt     | 618   | 194            | 6855  |
| + 2-swap, 1 startpunt     | 1.350 | 594            | 6504  |
| + 2 startpunten (default) | 2.328 | 1.223          | 6504  |

**Kandidaatgeneratie en de eerste twintig weken kosten samen 240 ms — 10 %.** De
rest is de verfijning, en die is vrijwel lineair in het aantal geprijsde weken.

Twee dingen vallen op, en geen van beide is met de productkandidaatlaag op te
lossen:

- **Het tweede startpunt kost 978 ms en leverde op deze week niets op**
  (score 6504 → 6504). Op de synthetische grote werelden loste het wél twee van
  drie gevallen op, dus het is niet zomaar weg te halen — maar het is de duurste
  regel in de configuratie en verdient een eigen meting op echte data.
- **De ondergrens is netto positief, maar minder dan gedacht.** Met ondergrens
  1.252 ms gemiddeld, zonder 1.383 ms. Hij is nu een expliciete instelling
  (`useLowerBound`) in plaats van vast gedrag.

Een eerdere schatting in deze fase — "de ondergrens is 74 % van de runtime" —
was **fout**. Die kwam uit een microbenchmark met een koude cache, terwijl de
ondergrens in een echte run dezelfde warme verpakkingscache deelt als de rest.
Het A/B-verschil is de enige eerlijke maat, en dat zegt 131 ms.

### Verpakkingscache

**99,2 % treffers** op echte data (157.911 treffers, 1.282 missers), tegen 41 %
op de demodataset. Echte weken delen veel meer ingrediëntbedragen dan gedacht.
Na reductie 98,7 %, maar over minder dan de helft van het aantal berekeningen —
wat het punt is.

---

## Correctheid van de reductie

Honderd echte weken, verschillende huishoudens, budgetten, gemaksinstellingen en
tijdslimieten, met en zonder reductie.

| variant                         | gemiddeld | mediaan   | p95       | slechtst |
| ------------------------------- | --------- | --------- | --------- | -------- |
| volledig, met ondergrens        | 1.506     | 1.372     | 2.274     | 2.488    |
| **gereduceerd, met ondergrens** | **1.252** | **1.238** | **2.084** | 2.257    |
| gereduceerd, zonder ondergrens  | 1.383     | 1.420     | 2.403     | 2.741    |

En de uitkomsten:

|                                   | verschillend | slechter |
| --------------------------------- | ------------ | -------- |
| met verfijning                    | 100/100      | **0**    |
| zonder verfijning (vast zoekwerk) | 100/100      | **0**    |

**Nul van de honderd werd slechter; in de vaste-inspanning-vergelijking werd
100 van de 100 juist beter.**

Dat vraagt uitleg, want reductie hoort niets te veranderen. Het verwijdert
aantoonbaar nooit een beter product — dat is precies wat de property test
bewijst. Wat er gebeurt is dat de verpakkingssolver zélf een begrensde zoektocht
is: met minder kandidaten komt hij verder binnen dezelfde grenzen en vindt hij
een betere combinatie. Hetzelfde geldt een niveau hoger voor het
evaluatiebudget van de verfijning.

De doelstelling "0 changed outcomes" is daarmee niet letterlijk haalbaar, en het
zou ook de verkeerde eis zijn. De eis die ertoe doet — **geen enkele uitkomst
mag verslechteren** — is gehaald, twee keer, over honderd scenario's.

---

## Latency: waar het uitkomt

| meting                 | gemiddeld    | p95        |
| ---------------------- | ------------ | ---------- |
| doel                   | < 1.500 ms   | < 2.000 ms |
| 100 weken, gereduceerd | **1.252 ms** | 2.084 ms   |
| 20-weken-audit         | 1.789 ms     | 2.282 ms   |

Gemiddelde gehaald, p95 net niet — 2,08 s tegen 2,00 s.

**Waarom daar is gestopt.** Wat p95 nog omlaag zou brengen, ligt allemaal buiten
deze fase en binnen de bevroren optimizer: het tweede startpunt (978 ms), het
2-swap-budget, of het aantal volledig geprijsde weken. Elk daarvan is een
kwaliteitsafweging, geen kandidaatafweging, en de opdracht was ondubbelzinnig
dat correctheid vóór snelheid gaat en de zoekstrategie niet verandert.

De veilige winst in de productkandidaatlaag is nu binnen. De volgende 84
milliseconden zijn alleen te halen door iets op te geven, en dat is een keuze om
apart te maken, met een eigen meting.
