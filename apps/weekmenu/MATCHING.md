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

En op de echte data:

| dekking bij AH                      | voor   | na         |
| ----------------------------------- | ------ | ---------- |
| alle canonieke ingrediënten         | —      | 86,7 %     |
| ingrediënten die recepten gebruiken | 58,9 % | **89,7 %** |
| gewogen naar receptgebruik          | —      | **94,8 %** |

**Eén eerlijke kanttekening bij die 100 %.** De woordenlijst is uitgebreid
_terwijl_ er tegen dit corpus gemeten werd, dus een perfecte score is deels een
maat voor hoe goed de lijst op dit corpus past. Het onafhankelijke bewijs is de
audit over twintig weken, die producten koopt die het corpus nooit gezien heeft.

## De audit over twintig weken

`pnpm match:weeks` plant twintig echte AH-weken en controleert elke
boodschappenregel automatisch op: goedgekeurde match, geldige verpakking,
geldige prijs, en — de belangrijkste — **geen enkel product dat in review of
afgewezen staat**.

```
weken gepland        20/20
boodschappenregels   460
verschillende producten gekocht   31
niet-goedgekeurde producten       0
```

De 31 gekochte producten zijn met de hand nagelopen. Geen enkele semantisch
verkeerde aankoop. Wel één te brede alias gevonden — rode wijnazijn voor een
recept dat om witte vraagt — en die is daarop vernauwd.

## Latency

De hypothese was dat betere matching de runtime zou verlágen, doordat er minder
onleverbare kandidaatweken doorgerekend worden.

**Dat klopte niet.** Gemeten over twintig weken: gemiddeld 1.987 ms, p95
2.612 ms, tegen 2.613 ms voor één week vóór deze fase. Meer bruikbare producten
betekent ook meer kandidaten per ingrediënt, en dat heft de winst op.

De p95 zit daarmee boven de grens van 2 s. Dat is een openstaand punt, en het is
uitdrukkelijk _geen_ reden om aan de zoekstrategie te komen: de optimizer is
bevroren en er is geen aanwijzing dat de zoekstrategie het probleem is. De
volgende stap daarvoor is kandidaatreductie per ingrediënt, gemeten.

## Bestanden

| bestand                                       | rol                                              |
| --------------------------------------------- | ------------------------------------------------ |
| `src/domain/ingestion/match-ingredient.ts`    | de matcher: bewijs verzamelen, tier bepalen      |
| `src/domain/ingestion/matching-vocabulary.ts` | merk-, vorm- en diskwalificerende woorden        |
| `src/domain/ingestion/ingredient-aliases.ts`  | aliassen en ingrediënt-specifieke uitzonderingen |
| `src/data/matching/overrides.ts`              | menselijke beslissingen, permanent               |
| `tests/support/golden-matches.ts`             | 253 gelabelde beslissingen: de meetlat           |
| `tests/support/match-evaluation.ts`           | precision, recall, F1                            |
