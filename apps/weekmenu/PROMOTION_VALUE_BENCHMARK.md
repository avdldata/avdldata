# Wat veranderen aanbiedingen aan de weekprijs?

## Lees dit eerst

Er zijn **geen echte aanbiedingen gemeten**. PrijsProfeet is vanuit deze
omgeving niet bereikbaar — de egress-proxy weigert de host met 403 op CONNECT,
zie [PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

Wat hieronder staat is een **gevoeligheidsanalyse** met gemodelleerde
aanbieddingen: promoties van realistische vórm, in een aandeel dat we variëren,
over de echte AH- en Jumbo-catalogus en de echte optimizer. De vraag die dat
eerlijk kan beantwoorden is niet "hoeveel besparen aanbiedingen" maar:

> *Bij welk aandeel aanbiedingen gaat een tweede supermarkt lonen?*

Een curve is wat hier verdedigbaar is. Eén verzonnen bedrag zou dat niet zijn.

Wat het model **niet** kan weten, en wat de uiteindelijke uitkomst bepaalt:
hoeveel promoties er werkelijk zijn, op welke producten ze landen, en — het
allerbelangrijkste — of de twee ketens **dezelfde** dingen tegelijk in de
aanbieding hebben. Het model trekt beide ketens onafhankelijk en met hetzelfde
percentage. Dat is de neutrale aanname, en het is precies de aanname die de
uitkomst het meest stuurt.

Draai `pnpm promo:bench` met een echte momentopname in
`data/external/promotions-snapshot.json` en hetzelfde script rapporteert
metingen in plaats van een curve.

---

## De opzet

Elke week wordt zes keer gepland: drie winkelopstellingen × promoties aan/uit.
De twee runs verschillen in precies één ding, dus elk verschil hieronder is
toe te schrijven aan de promoties en aan niets anders.

| | |
| --- | --- |
| catalogus | echt — Checkjebon, 14 september 2026, AH + Jumbo |
| optimizer | echt, ongewijzigd |
| huishoudens | 50, variërend in grootte, gemakvoorkeur en receptaanbod |
| opstellingen | alleen AH · alleen Jumbo · AH + Jumbo (max 2 winkels) |
| promoties | **gemodelleerd**, vijf vormen in gelijke verhouding |
| geldigheid | een folderweek rond de winkeldatum |

De vijf vormen zijn de vormen die de parser aankan: `1+1 gratis`, `2+1 gratis`,
`2 voor € X`, `25% korting`, `2e halve prijs`. Ze worden in **gelijke** delen
getrokken — niet omdat Nederlandse folders er zo uitzien, maar omdat we niet
weten hoe ze eruitzien, en een gelijke verdeling is de afwezigheid van een
bewering in plaats van een verzonnen bewering.

---

## De curve

`pnpm promo:bench -- --sweep --weeks 12`. Het aandeel is het percentage van het
assortiment dat in de aanbieding is.

| aandeel | promoties per week | regels in actie | promotievoordeel/week | tweede winkel levert op (mediaan) |
| ---: | ---: | ---: | ---: | ---: |
| 5 % | 1,0 | 3,5 % | € 0,45 | € 0,00 |
| 10 % | 1,4 | 5,0 % | € 0,57 | € 0,00 |
| 15 % | 2,0 | 7,0 % | € 1,09 | € 0,00 |
| 20 % | 2,2 | 7,9 % | € 1,30 | € 0,00 |
| 30 % | 3,3 | 11,9 % | € 1,97 | € 0,00 |
| 40 % | 4,3 | 15,8 % | € 2,63 | € 0,00 |

Drie dingen springen eruit, en het derde is het belangrijkste.

### 1. Het promotievoordeel groeit netjes mee

Van € 0,45 naar € 2,63 per week. Dat is de korting zelf, en die is precies wat
je zou verwachten: meer aanbiedingen, meer korting, ongeveer lineair. De
pijplijn doet wat hij moet doen.

### 2. Er wordt veel minder in de aanbieding gekocht dan er in de aanbieding is

Bij 20 % van het assortiment in de actie is maar 7,9 % van de gekochte regels
een actieregel — steeds ongeveer **de helft** van het aandeel. Dat is geen fout
maar een gevolg: de optimizer koopt sowieso al de goedkoopste producten, en die
staan minder vaak in de folder dan het gemiddelde product. Een aanbieding op een
duur merk verandert niets als het huismerk daarnaast alsnog goedkoper is.

Dat is een structurele dempende factor op alles wat promoties kunnen opleveren,
en hij verdwijnt niet met meer data.

### 3. Aanbiedingen maken de tweede winkel niet waardevoller

Dit is de uitkomst die ertoe doet. De mediane besparing van twee winkels ten
opzichte van alleen Albert Heijn is **€ 0,00 bij elk aandeel** — van 5 % tot
40 %. Het gemiddelde schommelt tussen −€ 1,00 en +€ 0,44, wat bij twaalf weken
ruis is en geen trend.

De reden is niet ingewikkeld: in dit model krijgt AH net zo veel aanbiedingen
als Jumbo. Wat Jumbo goedkoper maakt, maakt AH ook goedkoper, en met 94 van de
109 ingrediënten bij beide ketens te koop kan de optimizer binnen één winkel
uitwijken naar wat daar toevallig in de actie staat. Meer korting aan beide
kanten is voor het *verschil* tussen de kanten neutraal.

**Wat dit dus zegt, precies:** symmetrische aanbiedingen activeren de
multi-store functie niet. Wat hem wél zou activeren is **asymmetrie** — dat de
ene keten deze week diep in de actie zit op wat jij nodig hebt en de andere
niet. Of Nederlandse ketens zo asymmetrisch zijn, is exact de vraag die echte
data moet beantwoorden, en het is de enige vraag die hier nog toe doet.

### 4. Aanbiedingen sturen wél het menu

| aandeel | zelfde menu | 1 gerecht anders | 2 of meer anders |
| ---: | ---: | ---: | ---: |
| 5 % | 11/12 | 0 | 1 |
| 15 % | 9/12 | 1 | 2 |
| 20 % | 8/12 | 0 | 4 |
| 40 % | 6/12 | 2 | 4 |

Bij 20 % verandert de helft van de weken van menu, bij 40 % de helft plus. Dat
is een echt effect en het is het interessantste stukje productinzicht van deze
fase: aanbiedingen veranderen niet zozeer *waar* je koopt als wel *wat je eet*.
Een weekmenuplanner die de folder kent, kookt andere dingen — en dat is precies
het soort waarde dat een boodschappenlijstje-app niet heeft.

---

## Correctheid en snelheid

Promoties raken de correctheid niet en de snelheid nauwelijks.

| | zonder promoties | met promoties |
| --- | ---: | ---: |
| latency gemiddeld | 1.351 ms | 1.311 ms |
| latency p95 | 2.707 ms | 2.033 ms |

Binnen de targets (gemiddeld < 2 s, p95 < 3 s). Er gaat geen enkel
netwerkverzoek uit tijdens het optimaliseren — promoties zijn vóór het plannen
al aan de aanbiedingen gehangen — dus de enige kosten zijn een iets zwaardere
prijsfunctie, en die valt weg tegen de ruis.

De week wordt met promoties nooit duurder: de prijsmotor neemt bij elk aantal
de goedkoopste van schapprijs en actieprijs. Dat is een test, geen aanname.

---

## Wat dit betekent voor de beslisregel

De opdracht noemt twee drempels voor "sterk bewijs":

- mediane praktische multi-store besparing ≥ € 3, of
- ≥ 25 % van de weken bespaart ≥ € 5 praktisch.

Onder dit model wordt **geen van beide gehaald, bij geen enkel aandeel**. De
mediaan blijft € 0,00 en het aantal weken boven € 5 blijft 0 tot 1 op 12.

Dat plaatst de uitkomst in de categorie **zwak tot gemengd**: de korting zelf is
echt (tot € 2,63 per week bij 40 % actie-aandeel), maar hij komt niet terecht
bij de functie waar deze fase over ging. Voor de tweede supermarkt maakt het
niets uit.

Met de nadrukkelijke kanttekening: dit is een model, en het model neemt aan dat
de ketens symmetrisch zijn. Dat is de aanname die de uitkomst draagt, en het is
de aanname die als eerste getoetst moet worden.

---

## De volgende meting, in één commando

```bash
cp <opgehaalde-respons>.json data/external/promotions-snapshot.json
pnpm promo:probe        # wat zit erin
pnpm promo:prices       # hoe vers zijn onze prijzen
pnpm promo:bench        # dezelfde tabellen, dan als meting
```

Wat die run als eerste moet uitwijzen, in volgorde van belang:

1. **Hoe asymmetrisch zijn de twee ketens?** Van alle aanbiedingen die op een
   product landen dat wij verkopen: hoeveel daarvan zijn er bij AH én Jumbo
   tegelijk? Als dat aandeel hoog is, is de conclusie hierboven definitief.
2. **Gebruikt PrijsProfeet het winkelproduct-ID?** Zo ja, dan is de koppeling
   vrijwel gratis. Zo nee, dan bepaalt de naam-en-verpakking-tier de dekking.
3. **Hoeveel promoties zijn er per week op producten die wij überhaupt kopen?**
   Het model zegt dat maar de helft van het actie-aandeel in de mand belandt;
   dat getal is met echte data direct te controleren.
