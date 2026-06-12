# Prototype-datamodel — Slim leveranciers- en factuurproces

> **Status:** Concept / Proof-of-concept  
> **Doel:** Eenvoudig sterrenschema voor Power BI-prototype  
> **Datum:** 11 juni 2026

---

## 1. Ontwerpkeuzes

- **Sterrenschema** — één feitentabel, meerdere dimensies
- Alle tijden in **minuten** (niet decimalen)
- Alle kosten in **euro's** (2 decimalen)
- Data wordt handmatig ingevoerd of uit schattingen gehaald (nog geen live bronsysteem)
- Labelsysteem: elke waarde heeft een `[betrouwbaarheid]` kolom (Bekend / Aanname / Scenario)

---

## 2. Feitentabel: `FactProces`

| Kolom | Type | Voorbeeld | Label |
|-------|------|-----------|-------|
| ProcesID | PK (integer) | 1001 | — |
| ProcesType | tekst | "Leveranciersaanmaak" / "Factuurverwerking" | 🔍 Bekend |
| ProcesSubType | tekst | "Grootboek" / "Onderhoud" / "Projecten" / "Voorraad" | 🔍 Bekend |
| Datum | datum | 2026-01-15 | 💡 Aanname |
| DoorlooptijdMin | decimaal | 45,0 | 🔍 / 💡 |
| KostenEuro | decimaal | 16,00 | 💡 Aanname |
| HandmatigeStappen | integer | 8 | 💡 Aanname |
| AutomatiseerbaarPct | decimaal | 40,0 | 💡 Aanname |
| FoutKansPct | decimaal | 3,5 | ❓ Onbekend |
| Betrouwbaarheid | tekst | "Bekend" / "Aanname" / "Scenario" / "Onbekend" | — |
| VolumeScenario | tekst | "Laag (25k)" / "Middel (50k)" / "Hoog (90k)" | — |

> **Opmerking:** In een prototype worden rijen gegenereerd op basis van gemiddelden en scenario's. Later kan dit worden vervangen door echte data uit een bronsysteem.

---

## 3. Dimensietabellen

### `DimProcesStap`

| Kolom | Type | Voorbeeld |
|-------|------|-----------|
| StapID | PK | S01 |
| ProcesType | FK → FactProces | "Leveranciersaanmaak" |
| StapNaam | tekst | "Leverancierslijst checken" |
| StapVolgorde | integer | 1 |
| GeschatteTijdMin | decimaal | 5,0 |
| HandmatigJN | boolean | TRUE |
| AutomatiseerbaarJN | boolean | TRUE |
| VerantwoordelijkeRol | tekst | "Inkoper" |
| AfhankelijkVanStapID | FK (nullable) | null |
| Betrouwbaarheid | tekst | "Bekend" / "Aanname" |

**Processtappen Leveranciersaanmaak:**

| Volg | Stap | Tijd (min) | Automatiseerbaar? |
|------|------|-----------|-------------------|
| 1 | Leverancierslijst checken | 3 | ✅ Ja |
| 2 | Offerte en inkoopvoorwaarden ontvangen | 5 | ✅ Ja (intake) |
| 3 | Voorwaarden beoordelen | 10 | ⚠️ Deels |
| 4 | Contractvoorwaarden onderhandelen | 15 | ❌ Nee |
| 5 | Factuur/offerte doorsturen | 2 | ✅ Ja |
| 6 | Controleren of er al een geschikte leverancier is | 5 | ✅ Ja |
| 7 | Leveranciergegevens controleren (KvK, website, telefoon) | 10 | ✅ Ja (AI) |
| 8 | Aanvullende gegevens verzamelen | 10 | ✅ Ja (intake) |
| 9 | Verzoek sturen om leverancier op te voeren | 3 | ✅ Ja |
| 10 | Leverancier opvoeren in systeem | 20 | ⚠️ Deels |
| 11 | Terugkoppeling en dossier vastleggen | 5 | ✅ Ja |
| | **Totaal** | **~88 min / ±45 gewogen** | |

**Processtappen Factuurverwerking:**

| Type | Tijd (min) | Belangrijkste handmatige stappen |
|------|-----------|----------------------------------|
| Grootboek | 27 | Invoeren, controleren, coderen, boeken |
| Onderhoud | 16 | Controleren, matchen, boeken |
| Projecten | 34 | Uren/toewijzing controleren, doorbelasten, boeken |
| Voorraad | 12 | Ontvangst controleren, prijs matchen, boeken |

---

### `DimVolumeScenario`

| Kolom | Type | Voorbeeld |
|-------|------|-----------|
| ScenarioID | PK | S1 |
| ScenarioNaam | tekst | "Laag — 25k facturen" |
| FactuurVolume | integer | 25.000 |
| LeverancierVolume | integer | 500 (aanname: 2% van factuurvolume) |
| Label | tekst | "Scenario" |

### `DimTijdsreductie`

| Kolom | Type | Voorbeeld |
|-------|------|-----------|
| ReductieID | PK | R1 |
| ReductiePct | decimaal | 10,0 |
| Label | tekst | "Voorzichtig scenario" |

---

## 4. Relaties

```
FactProces —[ProcesType]—→ DimProcesStap
FactProces —[VolumeScenario]—→ DimVolumeScenario
(Via berekende kolom of what-if-parameter —[ReductiePct]—→ DimTijdsreductie)
```

---

## 5. Belangrijkste metrieken (DAX / Measures)

| Metriek | Formule (concept) | Label |
|---------|-------------------|-------|
| **Totale kosten** | `SUM(FactProces[KostenEuro]) * geselecteerd volume` | Scenario |
| **Totale tijd (uren)** | `SUM(FactProces[DoorlooptijdMin]) * volume / 60` | Scenario |
| **Kostenbesparing** | `[Totale kosten] * geselecteerd reductiepct / 100` | Scenario |
| **Tijdsbesparing (uren)** | `[Totale tijd] * geselecteerd reductiepct / 100` | Scenario |
| **Kosten per factuur** | `AVERAGE(FactProces[KostenEuro])` | Bekend / Aanname |
| **Gem. doorlooptijd** | `AVERAGE(FactProces[DoorlooptijdMin])` | Bekend |
| **Automatiseerbaar %** | `AVERAGE(FactProces[AutomatiseerbaarPct])` | Aanname |

---

## 6. Dashboard-pagina's (concept)

| Pagina | Inhoud |
|--------|--------|
| **1. Samenvatting** | Totale kosten, uren, besparingspotentieel — volume- en reductieselectie bovenaan |
| **2. Proceskosten** | Kosten per processtap, uitsplitsing leverancier vs factuur |
| **3. Scenario's** | Wat-als-analyse: 25k / 50k / 90k × 10% / 20% / 30% |
| **4. Verbeterkansen** | Automatiseerbare stappen per proces, prioriteit op basis van tijd × volume |
| **5. Verantwoording** | Overzicht van welke waarden 🔍 Bekend, 💡 Aanname of ⚠️ Nog te valideren zijn |

---

## 7. Volgende stappen (data)

1. ☐ Volume valideren: wat tellen de dashboards precies?
2. ☐ Jaarlijks aantal leveranciersaanvragen achterhalen
3. ☐ Processtappen valideren met iemand die het proces dagelijks uitvoert
4. ☐ Huidige kosten per stap valideren (niet alleen tijden, maar ook eventuele systeemkosten)
5. ☐ Power BI-prototype bouwen met dit datamodel

---

*Dit datamodel is een concept. Het is bewust eenvoudig gehouden om snel een werkend prototype te kunnen bouwen. Uitbreidingen (meerdere bronnen, historische data, real-time status) zijn later mogelijk.*