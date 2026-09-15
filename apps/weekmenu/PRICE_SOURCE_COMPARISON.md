# Normale prijs: Checkjebon tegenover de promotiebron

## Status: niet gemeten, wel gebouwd

Deze vergelijking vraagt om twee bronnen die allebei een normale prijs noemen
voor hetzelfde product. Er is er één. PrijsProfeet is vanuit deze omgeving niet
te bereiken — de egress-proxy weigert de host met 403 op CONNECT — dus er is
geen tweede prijs om tegenaan te houden. Het bewijs staat in
[PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

Wat er wél is: `pnpm promo:prices` draait de vergelijking volledig, zodra er een
momentopname in `data/external/promotions-snapshot.json` staat. Er is niets meer
aan te bouwen; er is alleen data voor nodig.

---

## Wat het script meet, en waarom precies dat

### Alleen exact gekoppelde producten

De vergelijking gebruikt uitsluitend koppelingen op tier 1 (het winkelproduct-ID)
of tier 2 (GTIN). Een koppeling op naam en verpakking is goed genoeg om een
aanbieding op toe te passen, maar niet om een conclusie over versheid uit te
trekken: een prijsverschil zou dan net zo goed kunnen betekenen dat er aan een
buurproduct gekoppeld is. Een freshness-signaal dat een matchingfout kan zijn,
is geen signaal.

### De buckets

| bucket   | wat het betekent                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| identiek | beide bronnen zeggen exact hetzelfde                                                                             |
| ≤ € 0,05 | afrondingsverschil of één statiegeldcent; ruis                                                                   |
| ≤ 5 %    | normale prijsbeweging tussen twee ophaalmomenten                                                                 |
| > 5 %    | één van de twee loopt achter                                                                                     |
| > 25 %   | uitschieter — waarschijnlijk een verkeerde koppeling of een verkeerde eenheid, en die worden bij naam uitgeprint |

Naast de verdeling rapporteert het script het **teken** van het verschil: hoe
vaak de bron hoger zit dan Checkjebon en hoe vaak lager. Dat is het
interessantste getal van de hele tabel. Ruis in beide richtingen betekent dat
allebei de bronnen af en toe achterlopen. Een consistent teken betekent dat er
één systematisch achterloopt, en dan weet je meteen welke.

---

## Wat er hoe dan ook niet gebeurt

**De promotiebron overschrijft nooit onze reguliere prijs.** Ook niet als hij
verser blijkt. De interne stroom is en blijft:

```
reguliere retail offer (Checkjebon)
+ optionele actieve promotie (promotiebron)
↓
kassaprijs
```

Twee redenen. De eerste is herkomst: een prijs op de boodschappenlijst moet
terug te voeren zijn op één bron met één datum, en een stilzwijgend gemengde
prijs is dat niet. De tweede is dat "verser" niet hetzelfde is als "juister" —
een promotiefeed noemt de doorgestreepte prijs, en dat is een marketinggetal
dat niet altijd de schapprijs van vorige week is.

Waar ze verschillen worden **beide bewaard met herkomst** en wordt het verschil
gerapporteerd. Dat is wat dit document over gaat.

---

## Draaien zodra er data is

```bash
# één opgehaalde respons, als array van ExternalPromotion
cp <opgehaalde-respons>.json data/external/promotions-snapshot.json

pnpm promo:probe     # welke velden zitten er echt in
pnpm promo:prices    # deze vergelijking
```

De uitkomst hoort hieronder ingevuld te worden, met de datum van de
momentopname erbij — een prijsvergelijking zonder datum vergelijkt niets.
