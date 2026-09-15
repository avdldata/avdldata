# Wat aanbiedingen aan de weekprijs veranderen

## REAL PROMOTION VALUE: NOT YET MEASURED

Dit document heeft twee delen die niet vermengd mogen worden.

| deel                                              | status     | mag gebruikt worden voor                                                                                                     |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Deel A — Synthetic promotion sensitivity test** | uitgevoerd | aantonen dát de promotie-engine werkt, dat de optimizer op promoties reageert, en dat menu- en winkelkeuze kúnnen veranderen |
| **Deel B — Real snapshot results**                | **leeg**   | de enige plek waar een uitspraak over de financiële waarde van echte promoties mag komen                                     |

**Deel A is een technische gevoeligheidstest, geen productbewijs.** De promoties
erin zijn gemodelleerd. Ze mogen niet gebruikt worden om te concluderen hoeveel
echte aanbiedingen opleveren, en al helemaal niet om te concluderen dat ze
weinig opleveren. Dat oordeel kan pas na een run met echte, asymmetrische AH- en
Jumbo-promoties.

De reden dat deel B leeg is: PrijsProfeet is vanuit deze omgeving niet
bereikbaar (403 op CONNECT via de egress-proxy, zie
[PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md)). Zodra er een export
in `data/external/promotions-snapshot.json` staat, draait `pnpm promo:bench`
automatisch de echte benchmark en vult deel B zich met metingen.

---

# Deel A — Synthetic promotion sensitivity test

**Dit zijn geen echte besparingen.** Wat deze test kan aantonen is beperkt en
technisch:

1. de promotie-engine prijst de vijf promotietypen correct door de hele
   pijplijn heen;
2. de optimizer reageert op promoties — hij koopt anders en kookt anders;
3. de winkelkeuze kán verschuiven.

Wat hij **niet** kan aantonen: hoeveel echte promoties opleveren, op welke
producten ze landen, en — bepalend voor de multi-store vraag — of AH en Jumbo
tegelijk dezelfde dingen in de aanbieding hebben. Het model trekt beide ketens
onafhankelijk en met hetzelfde percentage. Die aanname stuurt de uitkomst het
meest, en juist die aanname is niet te toetsen zonder echte data.

## De opzet

Elke week wordt zes keer gepland: drie winkelopstellingen × promoties aan/uit.
De twee runs verschillen in precies één ding, dus elk verschil hieronder is
toe te schrijven aan de promoties en aan niets anders.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| catalogus    | echt — Checkjebon, 14 september 2026, AH + Jumbo        |
| optimizer    | echt, ongewijzigd                                       |
| huishoudens  | 50, variërend in grootte, gemakvoorkeur en receptaanbod |
| opstellingen | alleen AH · alleen Jumbo · AH + Jumbo (max 2 winkels)   |
| promoties    | **gemodelleerd**, vijf vormen in gelijke verhouding     |
| geldigheid   | een folderweek rond de winkeldatum                      |

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
| ------: | -----------------: | --------------: | --------------------: | --------------------------------: |
|     5 % |                1,0 |           3,5 % |                € 0,45 |                            € 0,00 |
|    10 % |                1,4 |           5,0 % |                € 0,57 |                            € 0,00 |
|    15 % |                2,0 |           7,0 % |                € 1,09 |                            € 0,00 |
|    20 % |                2,2 |           7,9 % |                € 1,30 |                            € 0,00 |
|    30 % |                3,3 |          11,9 % |                € 1,97 |                            € 0,00 |
|    40 % |                4,3 |          15,8 % |                € 2,63 |                            € 0,00 |

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
kanten is voor het _verschil_ tussen de kanten neutraal.

**Wat dit dus zegt, precies:** symmetrische aanbiedingen activeren de
multi-store functie niet. Wat hem wél zou activeren is **asymmetrie** — dat de
ene keten deze week diep in de actie zit op wat jij nodig hebt en de andere
niet. Of Nederlandse ketens zo asymmetrisch zijn, is exact de vraag die echte
data moet beantwoorden, en het is de enige vraag die hier nog toe doet.

### 4. Aanbiedingen sturen wél het menu

| aandeel | zelfde menu | 1 gerecht anders | 2 of meer anders |
| ------: | ----------: | ---------------: | ---------------: |
|     5 % |       11/12 |                0 |                1 |
|    15 % |        9/12 |                1 |                2 |
|    20 % |        8/12 |                0 |                4 |
|    40 % |        6/12 |                2 |                4 |

Bij 20 % verandert de helft van de weken van menu, bij 40 % de helft plus. Dat
is een echt effect en het is het interessantste stukje productinzicht van deze
fase: aanbiedingen veranderen niet zozeer _waar_ je koopt als wel _wat je eet_.
Een weekmenuplanner die de folder kent, kookt andere dingen — en dat is precies
het soort waarde dat een boodschappenlijstje-app niet heeft.

---

## Vijftig weken op één aandeel

De curve hierboven is twaalf weken per punt, wat genoeg is voor de vorm en te
weinig voor de staart. Daarom één punt — 20 % van het assortiment in de actie —
over vijftig weken: `pnpm promo:bench -- --weeks 50 --rate 0.2`.

### Per opstelling

|                     | zonder promoties | met promoties |   verschil | mist |
| ------------------- | ---------------: | ------------: | ---------: | ---: |
| alleen Albert Heijn |          € 42,85 |       € 41,54 | **€ 1,32** |  1,3 |
| alleen Jumbo        |          € 45,23 |       € 44,49 |     € 0,73 |  1,8 |
| AH + Jumbo          |          € 42,85 |       € 41,93 |     € 0,93 |  0,9 |

Promoties maken elke opstelling goedkoper. De laatste kolom staat erbij omdat
zonder die kolom een duurdere rij als verlies leest: AH + Jumbo betaalt iets
meer en mist 0,4 ingrediënt minder, en dat is de ruil die de optimizer
opzettelijk maakt.

### Wat de tweede winkel oplevert

|                  | gemiddeld | mediaan |    p75 |    p90 |         max |
| ---------------- | --------: | ------: | -----: | -----: | ----------: |
| zonder promoties |    € 0,00 |  € 0,00 | € 1,60 | € 2,58 | **€ 10,07** |
| met promoties    |  − € 0,39 |  € 0,13 | € 1,22 | € 2,66 |      € 4,34 |

En het aantal weken dat een drempel haalt:

| drempel   | zonder promoties | met promoties |
| --------- | ---------------: | ------------: |
| ≥ € 1,00  |            14/50 |     **18/50** |
| ≥ € 2,50  |             7/50 |          6/50 |
| ≥ € 5,00  |             2/50 |      **0/50** |
| ≥ € 7,50  |             1/50 |          0/50 |
| ≥ € 10,00 |             1/50 |          0/50 |

Dit bevestigt de curve: onder het model duwen promoties wat meer weken over de
drempel van één euro (14 → 18) maar verdwijnt de staart (≥ € 5: 2 → 0, maximum
€ 10,07 → € 4,34).

Het mechanisme is de moeite van het begrijpen waard, want het geldt ook voor
echte data. Een week waarin twee winkels veel opleveren, is een week waarin AH
toevallig duur uitkomt op iets wat het menu nodig heeft. Geeft AH op dat product
óók korting, dan verdwijnt precies die uitschieter.

**Maar of dat in werkelijkheid gebeurt, hangt volledig af van iets wat dit
model per definitie niet kan hebben: asymmetrie.** Het model geeft beide ketens
even veel en even diepe aanbiedingen, dus het kan niet anders dan het verschil
tussen de ketens uitvlakken. Echte folders zijn niet symmetrisch — ketens
adverteren in verschillende weken op verschillende categorieën — en dat is nu
juist het geval waarin een tweede winkel loont. Deze rij is dus een eigenschap
van het model, geen bevinding over supermarkten.

### Waar de week gekocht wordt

| winkels      | zonder | met |
| ------------ | -----: | --: |
| alleen AH    |     25 |  25 |
| AH + Jumbo   |     13 |  15 |
| alleen Jumbo |     12 |  10 |

Nauwelijks beweging — bij symmetrische promoties. Dat is te verwachten en het
zegt niets over echte folders.

### Promotiegebruik

|                                        |        |
| -------------------------------------- | -----: |
| toegepaste promoties per week          |    2,8 |
| aandeel gekochte regels in de actie    | 10,0 % |
| promotievoordeel per week (AH + Jumbo) | € 1,93 |
| waarvan bij AH alleen                  | € 1,53 |
| waarvan bij Jumbo alleen               | € 1,18 |

### Menu

|                  |       |
| ---------------- | ----: |
| zelfde menu      | 33/50 |
| 1 gerecht anders | 10/50 |
| 2 of meer anders |  7/50 |

**In 17 van de 50 weken kookt het huishouden iets anders doordat er
aanbiedingen zijn.**

Dit is de enige uitkomst van deel A die niet afhangt van de symmetrie-aanname:
of AH en Jumbo nu dezelfde dingen in de actie hebben of niet, korting op iets
wat een recept nodig heeft verschuift de receptkeuze. Het effect zal met echte
data anders van omvang zijn, maar de richting is niet aan het model te wijten.

---

## Correctheid en snelheid

Promoties raken de correctheid niet en de snelheid nauwelijks.

Over de vijftig weken, drie opstellingen:

|                   | zonder promoties | met promoties |
| ----------------- | ---------------: | ------------: |
| latency gemiddeld |         1.649 ms |      1.627 ms |
| latency p95       |         3.042 ms |      2.979 ms |

Het gemiddelde zit ruim binnen de target van 2 s; de p95 schuurt tegen de 3 s.
Met promoties is hij lager dan zonder, dus de promotielaag is niet de oorzaak —
deze run deelde de machine met andere taken, en de eerdere meting zonder
promoties (`pnpm match:weeks`, 1.432 ms / 2.449 ms) lag lager. Het is dus geen
regressie, maar het is ook geen ruime marge.

Er gaat geen enkel
netwerkverzoek uit tijdens het optimaliseren — promoties zijn vóór het plannen
al aan de aanbiedingen gehangen — dus de enige kosten zijn een iets zwaardere
prijsfunctie, en die valt weg tegen de ruis.

De week wordt met promoties nooit duurder: de prijsmotor neemt bij elk aantal
de goedkoopste van schapprijs en actieprijs. Dat is een test, geen aanname.

---

## Wat deel A wel en niet zegt over de beslisregel

De opdracht noemt twee drempels voor "sterk bewijs": een mediane praktische
multi-store besparing ≥ € 3, of ≥ 25 % van de weken die ≥ € 5 bespaart.

**Deze drempels zijn met deel A niet te toetsen.** Onder het model wordt geen
van beide gehaald, maar dat is een eigenschap van het model — waarin beide
ketens per definitie evenveel en even diepe aanbiedingen krijgen — en niet een
bevinding over Nederlandse supermarkten. Symmetrische promoties kunnen het
verschil tussen twee winkels niet vergroten; dat is bijna een tautologie, geen
meting.

Wat deel A wél laat zien, en wat overeind blijft:

- **de engine werkt door de hele keten heen.** Promoties worden gelezen,
  gekoppeld, op de winkeldatum toegepast en correct doorgerekend, en de weekprijs
  daalt navenant (€ 0,45 tot € 2,63 per week naarmate het aandeel stijgt);
- **de optimizer reageert.** Bij 20 % actie-aandeel verandert in 17 van de 50
  weken het menu. Aanbiedingen sturen dus aantoonbaar de gerechtkeuze, en dat
  effect is niet afhankelijk van de symmetrie-aanname;
- **er wordt structureel minder in de actie gekocht dan er in de actie is** —
  bij 20 % aandeel is 10 % van de gekochte regels een actieregel. De optimizer
  koopt toch al het goedkoopste, en dat staat minder vaak in de folder. Deze
  demping is een eigenschap van de optimizer, niet van het model, en blijft dus
  ook bij echte data gelden.

De financiële vraag — loont een tweede supermarkt met echte aanbiedingen —
staat open. **REAL PROMOTION VALUE: NOT YET MEASURED.**

---

# Deel B — Real snapshot results

**Leeg.** Er is nog geen `data/external/promotions-snapshot.json`.

Zodra die er is, vult `pnpm promo:bench` dit deel met, per keten en per
opstelling:

- promotieaantallen, actief tegenover komend, en identiteitsdekking
  (stable id / retailer id / GTIN);
- koppeldekking per tier en de precision van de automatisch toegepaste
  koppelingen;
- gemiddelde, mediaan, p90 en maximum van de promotiebesparing;
- praktische multi-store besparing vóór en met promoties, en het aantal weken
  boven € 1 / € 2,50 / € 5 / € 7,50 / € 10;
- winkelwinnaars zonder en met promoties;
- menuverandering;
- latency.

Dezelfde vijftig scenario's als de bestaande no-promotions baseline, met
dezelfde huishoudens en receptkeuzes. Alleen de winkeldata schuiven mee naar
binnen het venster dat de snapshot dekt — anders valt bijna elke week buiten
elke folder en meet de vergelijking de kalender in plaats van de aanbiedingen.

De volledige checklist voor die run staat onderaan in
[PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

---

---

# Slotantwoord — zonder snapshot

De opdracht vraagt in dit geval om elf antwoorden, en niet om een
productconclusie.

**1. Schema geïmplementeerd?** Ja. `snapshot-schema.ts` dekt alle vijftien
concepten die de opdracht opsomt, met Zod-validatie en strikte afwijzing van
onbekende velden. De namen zijn die van óns handover-contract: de officiële
specificatie was vanuit deze omgeving niet te lezen, en verzinnen wat er in
staat is erger dan een gat laten. De binding naar PrijsProfeets eigen spelling
is één tabel (`FIELD_BINDINGS`), niet code.

**2. Welke velden ondersteund?** `external_promotion_id`, `retailer`,
`base_product_id`, `retailer_product_id`, `external_product_id`, `gtin`,
`product_name`, `brand`, `package_text`, `current_price`, `regular_price`,
`unit_price`, `promotion_status`, `promotion_type`, `promotion_text`,
`valid_from`, `valid_until`, `is_active`, `fetched_at`. Verplicht zijn er vijf;
de rest bepaalt hoe goed de koppeling wordt, niet óf het werkt. Wat elk gemis
kost staat in [PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md).

**3. Snapshot loader werkt?** Ja. `loadPrijsProfeetSnapshot(path)` leest,
valideert en normaliseert, met omhulsel of als kale array. Bewezen end-to-end op
een tijdelijke testexport van 80 records over beide ketens: 100 % gekoppeld op
retailer-ID, alle vijf promotietypen gelezen. Die testexport is daarna
verwijderd — hij stond in de weg als iemand hem voor echt zou aanzien.

**4. AH/Jumbo-filtering werkt?** Ja. Andere ketens worden geteld en
overgeslagen; een onbekende _spelling_ van een keten die we wél dekken wordt
geweigerd, want dat is drift en geen ruis.

**5. Product linking tiers klaar?** Ja, in de volgorde die de opdracht vraagt:
`EXACT_STABLE_ID` → `EXACT_RETAILER_ID` → `EXACT_GTIN` → `NAME_PACKAGE` →
`NEEDS_REVIEW`. Niets fuzzy, en review wordt nooit automatisch toegepast.
`NAME_PACKAGE` eist naam én verpakking identiek. Aan onze kant is het
winkelartikelnummer voor 100 % van de 33.390 producten leesbaar en uniek.

**6. Promotion mapping klaar?** Ja. De typecodes uit de opdracht
(`one_plus_one`, `multi_buy`, `percentage`, `fixed_price`, `nth_discount`)
kiezen de leesregel; de tekst levert de getallen. Een `multi_buy` zonder
bundelgrootte wordt niet toegepast. Een onbekende code valt door naar de
tekstlezer.

**7. Validity klaar?** Ja. De winkeldatum beslist, nooit de draaidatum. Een
aanbieding die maandag afloopt telt niet voor zaterdag; een die maandag begint
telt wél voor maandag. `active` / `upcoming` / `expired` worden uit het venster
afgeleid, niet uit de vlag van de bron — die was waar toen de export gemaakt
werd.

**8. Fallback zonder data werkt?** Ja. Geen bestand betekent één logregel,
`PrijsProfeet snapshot unavailable; continuing without promotions`, en de week
plant door op Checkjebon-schapprijzen. Geen crash. Ook getest voor offline,
timeout, rate limit, malformed, verlopen, onbekend product, dubbel en
overlappend.

**9. Welke tests toegevoegd?** 103 over de promotielaag, van de 508 in totaal:
17 tekstparser, 9 retailer-ID (waarvan drie tegen de volledige catalogus van
33.390 producten), 22 koppeling, 19 geldigheid en cache, 13 promotie-engine,
23 snapshot-schema en loader. De meerderheid gaat over wat er _niet_ gekoppeld
of _niet_ geprijsd wordt. De eerder gevonden correctheidsfouten — gram versus
stuks, gebroken verpakkingsaantallen, knoflookbol versus teen, babyvoeding
versus groente, verpakkingsmaat — zijn opnieuw gepind vanuit de promotiekant.

**10. REAL PROMOTION VALUE: NOT YET MEASURED.**

**11. Wat is er nodig om verder te gaan?** Eén bestand:
`data/external/promotions-snapshot.json`, volgens
[PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md). Dan draaien
`pnpm promo:probe`, `pnpm promo:prices` en `pnpm promo:bench` de volledige
meting, en vult deel B zich met echte cijfers. Alternatief: `prijsprofeet.nl` op
de egress-allowlist, of de veldnamen uit een echte respons zodat `FIELD_BINDINGS`
ingevuld kan worden.
