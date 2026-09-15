# Product → ingredient matching

Hoe een supermarktproduct aan een receptingrediënt wordt gekoppeld, waarom het
zo conservatief is, en wat het meetbaar oplevert.

Reproduceren: `pnpm match:eval`, `pnpm match:review`, `pnpm match:weeks`,
`pnpm data:coverage`.

---

## De regel

**Een verkeerde match is erger dan geen match.** Een ontbrekend product maakt de
week iets duurder en meldt zichzelf als "niet verkrijgbaar". Een verkeerd
product verandert stilletjes wat iemand eet, en niemand ziet het.

Dat is geen slogan maar een gemeten les. Een eerdere, soepelere versie haalde
80,4 % dekking bij AH en kocht daarbij:

```
AH Knoflook croutons                   als knoflook
AH Roomboter custardcakes              als roomboter
AH Truffelsalami met Parmezaanse kaas  als kaas
```

Alle drie zijn één woord verwijderd van het ingrediënt en geen van drieën is
een vervanger ervan.

## Hoe het werkt

Geen similarity-score. De matcher verzamelt **bewijs**, en het bewijs bepaalt de
tier.

**Stap 1 — de naam moet het ingrediënt bevatten**, als hele woorden, via de
canonieke naam of een alias. Het langste alias wint, zodat "rode ui" het van
"ui" wint en "zilvervliesrijst" van "rijst". Het regelmatige Nederlandse
meervoud (-s, -en) telt mee.

**Stap 2 — elk overgebleven woord wordt geclassificeerd** met een woordenlijst
die uit drie klassen bestaat:

| klasse               | voorbeeld                                                            | effect                 |
| -------------------- | -------------------------------------------------------------------- | ---------------------- |
| merk / verpakking    | `ah`, `terra`, `biologisch`, `grootverpakking`, `2-pack`             | genegeerd              |
| vormbehoudend        | `gesneden`, `geraspt`, `gepeld`, `ongezouten`, `magere`, `diepvries` | genegeerd              |
| diskwalificerend     | `croutons`, `cake`, `soep`, `saus`, `verspakket`, `maaltijdhapje`    | **afgewezen**          |
| ingrediënt-specifiek | `gerookte` bij spekblokjes, `cheddar` bij geraspte kaas              | genegeerd, alleen daar |
| onbekend             | alles wat niet in een lijst staat                                    | **naar review**        |

Die laatste regel draagt het hele ontwerp: **een woord dat de matcher niet kent,
is een reden om een mens te vragen.** Nooit een reden om door te gaan. Recall
verbeteren gebeurt dus door woordenschat toe te voegen — reviewbaar, in data —
en niet door drempels te verlagen.

**Stap 3 — een handmatig oordeel wint altijd.** Overrides in
`src/data/matching/overrides.ts` worden nooit herberekend en overleven elke
importronde en elke regelwijziging.

### Waarom prijs er niet in zit

De functie krijgt geen prijs mee, en dat is expres. Een goedkoper product is
geen waarschijnlijker antwoord op de vraag "is dit hetzelfde ingrediënt". Pas
ná goedkeuring mag prijs meespelen, en dan alleen in de optimizer.

### Uitlegbaarheid

Elke match draagt reason codes — `EXACT_ALIAS`, `BRAND_PREFIX_REMOVED`,
`PRESERVING_MODIFIER`, `NEGATIVE_MODIFIER_FOUND`, `MANUAL_OVERRIDE` — plus de
woorden die de matcher niet kon plaatsen. De reviewwachtrij toont precies dat,
zodat een mens niet hoeft te raden waaróm er getwijfeld wordt.

## Wat het meet

Gemeten tegen **253 handmatig gelabelde product↔ingredient-beslissingen**
(`tests/support/golden-matches.ts`): 159 VALID, 81 INVALID, 13 AMBIGUOUS, met
opzet gekozen op de moeilijke gevallen — merkprefixen, meervouden, samengestelde
namen, gearomatiseerde en bereide producten, biologisch, diepvries,
voorgesneden, sauzen, desserts en maaltijdcomponenten.

|                       | voor    | na          |
| --------------------- | ------- | ----------- |
| precision (auto-tier) | 100,0 % | **100,0 %** |
| recall                | 40,3 %  | **100,0 %** |
| F1                    | 57,4 %  | **100,0 %** |

Sinds de Jumbo-fase draait dezelfde matcher ook tegen een **tweede corpus van
195 Jumbo-voorbeelden** (`tests/support/golden-matches-jumbo.ts`).
`pnpm match:eval --chain both` zet ze naast elkaar:

| keten        |   n | precision |  recall |      F1 |
| ------------ | --: | --------: | ------: | ------: |
| Albert Heijn | 253 |   100,0 % | 100,0 % | 100,0 % |
| Jumbo        | 195 |   100,0 % |  98,5 % |  99,2 % |

Er is **geen tweede matcher**: dezelfde functie, dezelfde woordenlijst, dezelfde
regels. Dat is wat de tweede keten tot bewijs maakt in plaats van tot een tweede
implementatie.

En op de echte data:

| dekking                             | AH         | Jumbo      | samen      |
| ----------------------------------- | ---------- | ---------- | ---------- |
| ingrediënten die recepten gebruiken | **89,7 %** | **84,1 %** | **92,5 %** |
| gewogen naar receptgebruik          | **96,6 %** | **90,1 %** | **97,4 %** |

**Eén eerlijke kanttekening bij die 100 %.** De woordenlijst is uitgebreid
_terwijl_ er tegen deze corpora gemeten werd, dus een perfecte score is deels
een maat voor hoe goed de lijst op dit corpus past. Het onafhankelijke bewijs is
de weekaudit, die producten koopt die de corpora nooit gezien hebben.

## De audit over vijftig weken

`pnpm match:weeks -- --chains ah,jumbo --max-stores 2` plant vijftig echte weken
en controleert elke boodschappenregel automatisch op: goedgekeurde match,
geldige verpakking, geldige prijs, regeltotaal gelijk aan stuksprijs × aantal in
hele centen, verpakkingseenheid gelijk aan de recepteenheid, aantal onder de
twintig, gekocht ≥ nodig en < nodig + één verpakking, toegewezen winkel wordt
ook bezocht, en de regels tellen op tot het weektotaal.

```
weken gepland        50/50   (waarvan 24 met twee winkels)
boodschappenregels   1.403
verschillende producten gekocht  143
problemen            0
```

**Nul automatische problemen, en tóch drie fouten.** Het handmatig nalopen van
de gekochte producten vond wat de assertions niet zochten: een potje babypuree
dat als pompoen gekocht werd, 5,16 wraps waar de doos er acht bevat, en
knoflook per teen gerekend terwijl de winkel per bol verkoopt. Alle drie staan
uitgewerkt in `JUMBO_DATA_QUALITY.md` §1 en alle drie hebben een regressietest
met de echte productnaam erin. Een boodschappenlijst wordt op het oog geloofd;
"hij ziet er goed uit" is daarom geen bewijs.

Na herstel: 143 producten nagelopen, nul semantische fouten.

## Latency

Gemeten over vijftig weken per opstelling:

|           |       AH |    Jumbo |   AH + Jumbo |
| --------- | -------: | -------: | -----------: |
| gemiddeld | 1.689 ms | 1.780 ms | **1.432 ms** |
| p95       | 2.997 ms | 3.103 ms | **2.449 ms** |

Twee ketens zijn niet trager maar sneller: met meer aanbod hoeft de optimizer
minder dure uitwijkweken door te rekenen. Eén meting per opstelling, dus geen
schone A/B.

De zoekstrategie is niet aangepast, en er is ook geen aanleiding voor. Profiling
(`pnpm perf:real -- --chains ah,jumbo --max-stores 2`) laat zien dat de tweede
keten het aantal winkelcombinaties verdrievoudigt maar het aantal geprijsde
weken gelijk houdt, en dat de verpakkingscache 83,2 % raak blijft.

## Bestanden

| bestand                                       | rol                                              |
| --------------------------------------------- | ------------------------------------------------ |
| `src/domain/ingestion/match-ingredient.ts`    | de matcher: bewijs verzamelen, tier bepalen      |
| `src/domain/ingestion/matching-vocabulary.ts` | merk-, vorm- en diskwalificerende woorden        |
| `src/domain/ingestion/ingredient-aliases.ts`  | aliassen en ingrediënt-specifieke uitzonderingen |
| `src/data/matching/overrides.ts`              | menselijke beslissingen, permanent               |
| `tests/support/golden-matches.ts`             | 253 gelabelde AH-beslissingen: de meetlat        |
| `tests/support/golden-matches-jumbo.ts`       | 195 gelabelde Jumbo-beslissingen                 |
| `src/domain/ingestion/provenance.ts`          | herkomst per regel: keten, bron, datum, maat     |
| `tests/support/match-evaluation.ts`           | precision, recall, F1                            |
