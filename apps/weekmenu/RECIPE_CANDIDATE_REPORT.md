# Recipe candidate report

Wat er uit 68.926 ingelezen kandidaten kwam, en waarom dat minder is dan het
klinkt.

## De uitkomst in drie regels

- **96 high-confidence dinners** overleven de hele pijplijn, niet 300.
- Van 50 met de hand nagelopen kandidaten is **16 % GOOD** — het doel was 95 %.
- De bereikbare promoties gaan van **54 naar 54**. Nul verandering.

Dat laatste is het belangrijkste getal van de fase en het verdient uitleg, want
het is niet wat iemand verwachtte.

## De trechter

| stap                                                   |   over |
| ------------------------------------------------------ | -----: |
| ingelezen kandidaten (3 bronnen)                       | 68.926 |
| score > 0 en licentie staat productie toe              | 37.431 |
| na deduplicatie (25.681 bijna-duplicaten samengevoegd) | 11.750 |
| TOP 500                                                |    500 |
| **high-confidence dinners**                            | **96** |

De sprong van 500 naar 96 is de eis: `DINNER` (niet POSSIBLE, niet AMBIGUOUS),
ingrediëntdekking ≥ 80 %, eenheden ≥ 80 % omrekenbaar, geen enkele ambiguë
regel, en een licentie die productie toestaat. Elk van die vijf is nodig en
samen laten ze 96 over.

### Herkomst van de selectie

| bron                 | top 500 | top 300 |    commercieel publiceerbaar     |
| -------------------- | ------: | ------: | :------------------------------: |
| Open Recipe Archive  |     426 |      84 |                ja                |
| ForkRecipe           |      74 |      12 |        **nee** (CC BY-SA)        |
| recipe-dataset (13k) |       0 |       0 | **nee** (`UNKNOWN`, geblokkeerd) |

De historische archiefbron domineert de shortlist, en dat is precies het
probleem — zie de audit.

## Handmatige audit, 50 kandidaten

De 50 hoogst scorende high-confidence dinners, één voor één beoordeeld tegen
expliciete criteria. Vastgelegd met reden per recept in
`data/recipes/manual-audit.json`.

|         |        aantal |
| ------- | ------------: |
| GOOD    |  **8 (16 %)** |
| FIXABLE |     21 (42 %) |
| REJECT  | **21 (42 %)** |

**Doel was ≥ 95 % GOOD. Gehaald: 16 %.**

De criteria staan in het auditbestand en zijn streng gehouden:

- **GOOD** — direct bruikbaar. Hoofdgerecht, hoofdcomponent aanwezig, élke
  hoeveelheid in gram/milliliter/stuks, alles in NL te koop.
- **FIXABLE** — het gerecht klopt, maar iemand moet met de hand hectogrammen,
  deciliters of "1 blik" omrekenen, of een portiegrootte vaststellen.
- **REJECT** — geen avondmaaltijd (voorgerechtsoep, dessert, deeg, bijgerecht),
  of een hoofdcomponent ontbreekt, of de hoeveelheden zijn niet te redden.

De acht GOOD-gevallen zijn zeven ForkRecipe-gerechten en één archiefrecept:
Koshari, Japchae, Mujadara, Misir Wot, Moros y Cristianos, Bacalhau à Brás,
Saag Aloo, Yangzhou Fried Rice. Dat zijn echte avondmaaltijden die een
Nederlands huishouden kan koken.

De REJECT-gevallen laten zien wat het archief werkelijk is:

| reden                    | voorbeelden                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| voorgerechtsoep          | Beet Soup, Cream of Celery Soup, Koolsoep, Zupa Pomidorowa, Corn Soup, Ris- og Tomat-Suppe                  |
| component, geen maaltijd | Pasta Dough (for Ravioles), Fideos (Noodle Dough), Grönsakspastejer                                         |
| historische eenheden     | Geroestete Wurfel (_0,5 liter bloem_, _deca boter_), Reis-Knödel (_deca_)                                   |
| dessert of zoet          | Nüdel oder Eferseln (vanillesuiker, opgeklopt eiwit), Äppelsoppa (appelsoep met suiker)                     |
| hoofdcomponent ontbreekt | Tomatbiff — de titel belooft rundvlees, de ingrediëntenlijst bevat het niet                                 |
| onbruikbare hoeveelheid  | Sopa Brasica ("1 little vegetable broth", "7 or eight egg yolks"), Kasvismureke ("2 lbs cooked vegetables") |

Deze recepten zijn niet slecht geparseerd. Ze zijn correct geparseerd en het
zijn kookboekregels uit 1874.

Een eerdere, informelere pas over dezelfde lijst kwam op 34 % GOOD. Het verschil
is strengheid, niet data: een soep zonder eiwit telt nu als voorgerecht, en een
recept met onomrekenbare eenheden is FIXABLE in plaats van GOOD. Beide passes
halen 95 % bij lange na niet; de strengere maakt zichtbaar hoe ver.

## Impact op de kernmeting

| metriek                            |     nu | projectie top 300 | verschil |
| ---------------------------------- | -----: | ----------------: | -------: |
| canonical ingredients in recepten  |    112 |               115 |       +3 |
| recepten                           |     56 |               152 |      +96 |
| optimizer-eligible AH-producten    |    497 |               510 |      +13 |
| optimizer-eligible Jumbo-producten |    450 |               465 |      +15 |
| samen                              |    947 |               975 |      +28 |
| **bereikbare promoties**           | **54** |            **54** |    **0** |
| percentage van 5.190               |  1,0 % |             1,0 % |        — |

### Waarom nul

Bereikbaarheid van een promotie hangt af van of dát specifieke product in onze
koopbare set zit. De 96 nieuwe recepten zijn gemaakt van ingrediënten die we al
modelleren, dus ze voegen wat productvarianten toe (+28) maar niet de producten
die deze week in de folder staan.

Dit is nu twee keer los gemeten:

1. **Identiteitsverrijking** voegde 0 koppelingen toe — beide kanten hadden het
   artikelnummer al ([IDENTITY_BRIDGE.md](IDENTITY_BRIDGE.md)).
2. **Receptuitbreiding met bestaande ingrediënten** voegt 0 bereikbare promoties
   toe — dit rapport.

Wat wél werkt is de derde weg, en die is apart gemeten in
[INGREDIENT_EXPANSION_OPPORTUNITIES.md](INGREDIENT_EXPANSION_OPPORTUNITIES.md):
**nieuwe canonical ingredients** die producten binnenhalen die wél in de folder
staan. Plafond: 313 van 5.190 = **6,0 %**.

## Ontbrekende canonical ingredients volgens de corpora

De top 500 vraagt **468 concepten** die wij niet modelleren. De meest gevraagde:

| concept           | recepten | dinners |
| ----------------- | -------: | ------: |
| sugar             |       32 |      24 |
| bay leaf          |       13 |      13 |
| turnips           |       12 |      12 |
| celery            |       11 |      11 |
| bay leaves        |        7 |       7 |
| stock             |        7 |       6 |
| cloves (specerij) |        7 |       7 |
| parsnip           |        7 |       7 |
| pork              |        6 |       5 |
| broth             |        6 |       5 |
| cornstarch        |        5 |       5 |
| celeriac          |        5 |       5 |
| lard              |        5 |       3 |
| oyster sauce      |        4 |       4 |
| nutmeg            |        4 |       4 |

Twee dingen vallen op. **"bay leaf" en "bay leaves" staan er los in**, en
"pork" en "beef" staan erin terwijl we varkens- en rundvlees wél modelleren —
als `varkenshaas`, `gehakt-rund` en `runderstoof`, niet als het generieke woord.
De lijst is dus een lijst van _concepten die de matcher niet thuisbrengt_, niet
van gaten in de keuken. Dat onderscheid is bewust: liever een concept twee keer
op de lijst dan een regel die op goed geluk aan `varkenshaas` wordt gehangen.

Belangrijker: deze lijst lijkt nauwelijks op de promotielijst. Deze corpora
vragen om laurierblad, nootmuskaat en koolraap; de folder biedt fusilli, hummus
en pesto aan. **De twee bronnen wijzen niet dezelfde kant op**, en dat is een
reden om promotiedekking en receptkwaliteit als twee aparte doelen te behandelen
in plaats van te hopen dat één ingreep beide dient.

## Spreiding van de shortlist

```
keukens: sweden 18, finland 11, poland 6, canada 6, austria 5, philippines 5,
         us-louisiana 4, american-historical 4, netherlands 4, denmark 3,
         united-kingdom 3, ethiopian 2
vormen:  soup 33, rice 18, pasta 11, bread 10, potato 15, stew 7, salad 2
```

Zweden en Finland domineren omdat het archief daar de dikste pre-1931
kookboekplank heeft, niet omdat Scandinavisch eten bijzonder geschikt is. Van de
gevraagde spreiding (Italiaans, mediterraan, Mexicaans, Aziatisch, Indiaas,
Midden-Oosters) levert deze shortlist bijna niets, en **33 van de 96 zijn soep**.

Dat is geen fout in de diversity-term van de score. Het is wat er in de bronnen
zit die we mogen gebruiken.

## Het licentiebesluit dat nog openstaat

De selectie bevat 74 ForkRecipe-kandidaten onder CC BY-SA 4.0. Die licentie is
besmettelijk: wie de tekst overneemt, moet zijn eigen afgeleide onder dezelfde
voorwaarden delen. Daarom draagt de staging **geen** instructieteksten en is dit
een besluit dat bewust genomen moet worden, niet een gevolg van wat er toevallig
is binnengehaald.

|                     | **A — share-alike accepteren**                                               | **B — alleen publiek domein**    |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| wat je gebruikt     | ForkRecipe-tekst én archieftekst                                             | alleen archieftekst (pre-1931)   |
| wat je moet doen    | de afgeleide receptteksten onder CC BY-SA 4.0 publiceren, met bronvermelding | niets; publiek domein bindt niet |
| wat je krijgt       | 7 van de 8 GOOD-recepten in de audit                                         | 1 van de 8                       |
| commerciële release | tekst blijft CC BY-SA; de rest van de app niet                               | vrij                             |
| risico              | share-alike moet correct worden nageleefd, ook bij latere bewerking          | geen licentierisico              |

**Advies: B, en de ForkRecipe-recepten als _structuurbron_ gebruiken in plaats
van als tekstbron.** De ingrediëntenlijst met hoeveelheden is een verzameling
feiten en draagt geen auteursrecht; de bereidingstekst wel. Zeven goede
gerechten overschrijven met zelfgeschreven instructies kost een uur en haalt de
share-alike-verplichting volledig weg. Bij 96 kandidaten is dat een reëel
alternatief; bij 3.000 zou het dat niet zijn.

Dit besluit hoeft pas te vallen als er daadwerkelijk recepten naar productie
gaan. Zolang de staging alleen structuur bevat, is er niets gepubliceerd en is
er niets te repareren.

## Conclusie

De pijplijn werkt: bronnen worden ingelezen, geparseerd, geclassificeerd,
gescoord, ontdubbeld en gemeten, en de licentiegrens wordt in het typesysteem
afgedwongen in plaats van in een afspraak. Het probleem zit in de data.

- de enige **grote** bron is historisch en levert 16 % direct bruikbare
  recepten;
- de enige **goed gestructureerde moderne** bron met een bruikbare licentie
  (ForkRecipe) heeft 594 recepten waarvan 170 dinners, en levert 12 van de 96 —
  maar wel 7 van de 8 GOOD-gevallen;
- de **best gestructureerde** bron (13k) mag niet gebruikt worden.

Automatisch 300 goede Nederlandse avondmaaltijden uit deze corpora halen kan
niet. Wat wel kan staat in de aanbeveling onderaan het slotantwoord.
