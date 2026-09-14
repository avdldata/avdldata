# Checkjebon-data, gemeten

Datum: 14 september 2026 · Momentopname `data/supermarkets.json` uit
`supermarkt/checkjebon`, commit van 14 september 2026 (10,1 MB, 107.611
producten).

Reproduceren: `pnpm data:probe` en `pnpm data:coverage`. Beide lezen een lokale
momentopname, zodat de meting herhaalbaar is en niet van het netwerk afhangt.

---

## Wat er in zit

Per product vier velden: naam, link-suffix, prijs (float euro), maataanduiding.

**Wat er niet in zit, en wat dat kost:**

| ontbrekend              | gevolg                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| GTIN/EAN                | geen betrouwbare koppeling met Open Food Facts of GS1; matching moet op naam  |
| categorie               | geen goedkope voorfiltering van non-food                                      |
| merk als apart veld     | merk zit in de naam en moet eruit geparsed worden                             |
| promoties               | geen enkele aanbieding; de optimizer rekent met schapprijzen                  |
| voedingswaarden         | volledig terugvallen op canonical ingredient                                  |
| filiaal                 | prijzen zijn hoogstens ketenbreed — scope is `CHAIN`, nooit `LOCATION`        |
| tijdstempel per product | versheid is af te leiden uit de commitdatum van het bestand, niet uit de data |

Dat laatste is een echte beperking: er is geen `observedAt` per prijs, dus
"prijs gecontroleerd 3 uur geleden" kan deze bron niet onderbouwen. Het beste
wat eerlijk gezegd kan worden is "momentopname van 14 september 2026".

---

## Datakwaliteit per keten

`pnpm data:probe`:

| keten     | producten | geldige prijs | bruikbaar pakket | leeg       | niet-food eenheid | onleesbaar | duplicaten |
| --------- | --------- | ------------- | ---------------- | ---------- | ----------------- | ---------- | ---------- |
| **ah**    | 16.173    | 100,0 %       | **96,8 %**       | 0,0 %      | 1,4 %             | 1,0 %      | 0          |
| plus      | 16.129    | 100,0 %       | 99,5 %           | 0,2 %      | 0,0 %             | 0,0 %      | 0          |
| spar      | 7.831     | 100,0 %       | 100,0 %          | 0,0 %      | 0,0 %             | 0,0 %      | 0          |
| hoogvliet | 7.410     | 100,0 %       | 99,6 %           | 0,0 %      | 0,4 %             | 0,1 %      | 0          |
| poiesz    | 1.728     | 100,0 %       | 99,9 %           | 0,0 %      | 0,1 %             | 0,0 %      | 0          |
| dirk      | 7.438     | 100,0 %       | 98,9 %           | 0,0 %      | 0,5 %             | 0,6 %      | 0          |
| dekamarkt | 10.728    | 100,0 %       | 98,6 %           | 0,0 %      | 0,5 %             | 0,7 %      | 0          |
| **jumbo** | 17.217    | 100,0 %       | **58,0 %**       | **41,7 %** | 0,1 %             | 0,2 %      | 0          |
| vomar     | 887       | 100,0 %       | 57,6 %           | 41,7 %     | 0,0 %             | 0,7 %      | 0          |
| **lidl**  | 22.070    | 100,0 %       | **24,3 %**       | **75,7 %** | 0,0 %             | 0,0 %      | 0          |
| aldi      | 0         | —             | —                | —          | —                 | —          | —          |
| ekoplaza  | 0         | —             | —                | —          | —                 | —          | —          |

Totaal 107.611 producten; 82.453 (76,6 %) hebben zowel een prijs als een
leesbaar pakket.

**Prijs is nooit het probleem — pakket wel.** Elke keten heeft 100 % geldige
prijzen. Het verschil zit volledig in de maataanduiding, en daar lopen de
ketens extreem uiteen: AH mist er vrijwel geen, Jumbo mist er 41,7 % en Lidl
75,7 %. Voor een optimizer die op verpakkingsgrootte rekent is een product
zonder maat onbruikbaar, hoe correct de prijs ook is.

**Geen duplicaten.** Op (link, naam) zijn er nul dubbele records in de hele
dataset.

### Wat de parser niet kon lezen

De meest voorkomende onleesbare labels, na twee verbeterrondes op basis van deze
lijst:

```
  43  Per pak            geen hoeveelheid
  32  6 x 750 ml • Zonder doos   opgelost: alles na de bullet is marketing
  17  4 pers | 25 min    een receptkaart in de productfeed
  13  75 Centiliter      opgelost: eenheidswoord toegevoegd
  12  185 GRM            opgelost
   9  1 kg (ca. 5 stuks) opgelost: de tussenzin is een toelichting
```

De receptkaarten (`4 pers | 25 min`) zijn geen parserprobleem maar een
datakwaliteitsprobleem bij de bron: maaltijdboxen komen als product binnen met
een bereidingsduur in het maatveld.

### Twee labels die stil fout zouden gaan

- **`per kilo`** (32 stuks bij PLUS) is een prijs per kilo, geen pak van één
  kilo. Als package gelezen zou de optimizer een kilo kopen tegen de kiloprijs
  en met overtuiging het verkeerde antwoord geven. De parser weigert dit
  expliciet met reden `PRICE_PER_MEASURE`.
- **`ca. 500 g`** (523 stuks bij AH) is een echt gewicht, maar bij benadering —
  vers vlees en kaas op gewicht. Het bedrag is bruikbaar, de exactheid niet
  gegarandeerd; dat staat als `approximate` in het resultaat in plaats van te
  verdwijnen.

Beide staan als test vastgelegd.

---

## Dekking van onze eigen receptcatalogus

Dit is de meting die telt. Niet "hoeveel producten hebben we", maar: **kunnen de
56 recepten die we al hebben echt geprijsd worden?**

56 recepten vragen 109 canonieke ingrediënten, waarvan er 107 gekocht moeten
worden (2 zijn voorraadkast). `pnpm data:coverage`:

| keten     | gematcht | auto-goedgekeurd | review nodig | afgewezen | ingr. met ≥1 match | bruikbaar voor optimizer |
| --------- | -------- | ---------------- | ------------ | --------- | ------------------ | ------------------------ |
| **ah**    | 1.590    | 181              | 1.409        | 135       | 94 (87,9 %)        | **58,9 %**               |
| lidl      | 933      | 182              | 751          | 43        | 86 (80,4 %)        | 50,5 %                   |
| plus      | 1.524    | 117              | 1.407        | 165       | 91 (85,0 %)        | 50,5 %                   |
| jumbo     | 1.723    | 119              | 1.604        | 252       | 93 (86,9 %)        | 39,3 %                   |
| dekamarkt | 1.099    | 61               | 1.038        | 98        | 87 (81,3 %)        | 35,5 %                   |
| spar      | 683      | 72               | 611          | 83        | 83 (77,6 %)        | 32,7 %                   |
| hoogvliet | 791      | 57               | 734          | 65        | 85 (79,4 %)        | 29,0 %                   |
| dirk      | 794      | 36               | 758          | 70        | 87 (81,3 %)        | 27,1 %                   |
| poiesz    | 213      | 10               | 203          | 12        | 44 (41,1 %)        | 6,5 %                    |
| vomar     | 123      | 5                | 118          | 3         | 25 (23,4 %)        | 0,9 %                    |

"Bruikbaar" betekent: auto-goedgekeurde match **én** geldige prijs **én**
leesbaar pakket. Alleen die producten komen bij de optimizer.

**De bottleneck is matching, niet prijs en niet pakket.** Bij AH heeft 87,9 %
van de benodigde ingrediënten minstens één kandidaat, maar slechts 58,9 %
overleeft de kwaliteitspoort — het verschil is bijna volledig "kandidaat
gevonden, maar niet zeker genoeg om automatisch goed te keuren".

Dat is geen fout in de architectuur; het is het werk dat nog gedaan moet worden
en waar de reviewflow voor bestaat. 1.409 producten bij AH wachten op een
menselijk oordeel, en elke goedkeuring is permanent.

---

## Hoe conservatief de matching moest zijn

De eerste versie keurde ruimer goed en leverde 80,4 % bruikbare dekking bij AH.
De eerste echte boodschappenlijst liet zien wat die 80 % waard was:

```
  0.69   AH Knoflook croutons                    → gematcht als knoflook
  1.65   AH Roomboter custardcakes               → gematcht als roomboter
  3.29   AH Truffelsalami met Parmezaanse kaas   → gematcht als kaas
```

Croutons zijn geen knoflook, cake is geen roomboter en salami is geen kaas. Elk
van die matches is één woord verwijderd van het ingrediënt en geen van alle is
een vervanger ervan.

De regel is daarom aangescherpt tot: **automatisch goedkeuren alleen als er,
afgezien van merk- en maataanduiding, niets overblijft in de productnaam.** Dat
kostte 80,4 % → 58,9 % bruikbare dekking bij AH, en dat is de juiste ruil: een
ontbrekend product kost wat geld en meldt zichzelf, een verkeerd product
verandert stilletjes wat iemand eet.

De weggevallen dekking komt grotendeels terug via aliassen — "Gele uien" is een
ui, "Babyspinazie" is spinazie — en dat is curatiewerk, geen architectuurwerk.

### Ingrediënten zonder één bruikbaar product, bij welke keten dan ook

Na aanscherping 18 van de 107. Steekproefsgewijs nagetrokken in de brondata:
het product bestáát vrijwel altijd, maar de naam wijkt af van onze canonieke
naam. Voorbeelden:

| canoniek              | wat de winkel het noemt             |
| --------------------- | ----------------------------------- |
| Verse gember          | AH Gember                           |
| Tofu naturel          | AH Terra Biologische tofu           |
| Verse spinazie        | AH Babyspinazie, AH Bladspinazie    |
| Geraspte belegen kaas | AH Goudse belegen geraspte kaas 48+ |

Dit is precies wat de aliastabel voor bestaat en het is de goedkoopste
verbetering die er ligt: een handvol aliassen per ingrediënt.

---

## Conclusie over deze bron

**Bruikbaar als prijsbron, niet als productbron.** Prijzen zijn compleet en
schoon, pakketten zijn bij AH uitstekend en bij Jumbo en Lidl half tot
grotendeels afwezig, en alles wat een productcatalogus verder rijk maakt —
GTIN, categorie, voedingswaarden, promoties, filiaalprijzen — ontbreekt volledig.

Voor een weekmenu-optimizer die op verpakkingen en schapprijzen rekent is dat
genoeg om mee te beginnen, mits de matching serieus genomen wordt.
