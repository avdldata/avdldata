# Casecanvas — Slim leveranciers- en factuurproces

> **Status:** Concept / Proof-of-concept  
> **Auteur:** Arjan van der Laan (AVDLData)  
> **Datum:** 11 juni 2026  
> **Labels:** `#administratie #factuurverwerking #leveranciersbeheer #procesoptimalisatie`

---

## 1. Titel

**Slim leveranciers- en factuurproces**

---

## 2. Probleem

> **Label:** 🔍 **Bekend**

Leveranciersaanmaak en factuurverwerking bevatten veel handmatige stappen, controles, overdrachten en documentverwerking. Daardoor kost het proces veel bewerkingstijd en is onduidelijk waar de grootste verbeterkans zit.

**Subproblemen:**

- Geen centraal overzicht van doorlooptijden per processtap
- Status van aanvragen is niet inzichtelijk (wie, wanneer, hoelang)
- Documenten (offertes, contracten, KvK-uittreksels) worden handmatig gecontroleerd
- Geen duidelijk volume bekend — onmogelijk om prioriteit te bepalen zonder cijfers

---

## 3. Bekende cijfers

> **Label:** 🔍 **Bekend** (tenzij anders vermeld)

### Proces 1 — Leveranciersaanmaak

| Metriek | Waarde | Label |
|---------|--------|-------|
| Maximale handelingstijd (alle stappen) | ±93 min | 🔍 Bekend |
| Gewogen gemiddelde | ±45 min | 🔍 Bekend |
| Praktische inschatting | ±40 min | 💡 Aanname |
| Kostenindicatie per leverancier | ±€36–€41 | 💡 Aanname |
| Jaarlijks volume | ❓ **Onbekend** | ⚠️ Nog te valideren |

### Proces 2 — Factuurverwerking

| Metriek | Waarde | Label |
|---------|--------|-------|
| Gem. tijd — Grootboek | 27 min | 🔍 Bekend |
| Gem. tijd — Onderhoud | 16 min | 🔍 Bekend |
| Gem. tijd — Projecten | 34 min | 🔍 Bekend |
| Gem. tijd — Voorraad | 12 min | 🔍 Bekend |
| **Gemiddeld over alle typen** | **19 min** | 🔍 Bekend |
| Kosten per factuur | ±€16 | 💡 Aanname |
| Volume (dashboard A) | ±25.000 | ⚠️ Nog te valideren |
| Volume (dashboard B) | ±90.000 | ⚠️ Nog te valideren |

**Let op:**  
Het is nog onduidelijk wat de dashboards precies tellen:
- Unieke facturen?
- Factuurregels?
- Boekingsregels?
- Iets anders?

> **Label:** ⚠️ **Nog te valideren**

---

## 4. Hypothese

> **Label:** 💡 **Aanname**

Door betere intake, documentcontrole, statusoverzicht en procesinzicht kan een deel van de handmatige bewerkingstijd worden verminderd.

**Deelhypothesen:**

1. **Intake & controle (30-50% reductie)** — Een gestandaardiseerde intake met checklist en automatische documentcontrole kan handmatige controletijd verminderen.
2. **Statusinzicht (10-20% reductie)** — Een dashboard met statusoverzicht voorkomt dat er gevraagd wordt "waar staat mijn aanvraag?"
3. **Dossieropbouw (20-30% reductie)** — Automatische dossieropbouw uit aangeleverde documenten vermindert zoek- en invultijd.
4. **AI-documentextractie (40-60% reductie)** — Automatisch uitlezen van KvK, facturen en contracten bespaart de meeste handmatige stappen.

---

## 5. Eerste oplossing (proof-of-concept)

> **Label:** 🛠️ **Mogelijke verbetering**

**Een Power BI/prototype-dashboard** met:

- Proceskostenoverzicht (huidige situatie)
- Volumescenario's (25k / 50k / 90k)
- Besparingsscenario's (10% / 20% / 30% tijdsreductie)
- Visualisatie van knelpunten per processtap
- Duidelijk onderscheid tussen **bekende cijfers** en **aannames**

**Doel:** Inzichtelijk maken hoeveel tijd en kosten er mogelijk zitten in leveranciersaanmaak en factuurverwerking, met duidelijke scenario's en aannames.

**Niet** als eindproduct — als *bewijsstuk* voor verdere investering.

---

## 6. Latere mogelijke oplossing

> **Label:** 🧠 **Idee** (nog niet bouwen)

- Slimme intake met checklist
- Automatische KvK-controle
- AI-documentextractie (offertes, facturen, contracten)
- Statusdashboard met notificaties
- Dossieropbouw en terugkoppeling
- Automatische matching factuur ↔ inkooporder ↔ ontvangst

---

## 7. Belangrijkste onzekerheden

| Onzekerheid | Label |
|-------------|-------|
| Wat tellen de bestaande dashboards precies? | ⚠️ Nog te valideren |
| Hoeveel unieke facturen per jaar? | ⚠️ Nog te valideren |
| Hoeveel leveranciersaanvragen per jaar? | ⚠️ Nog te valideren |
| Welke stappen zijn echt beïnvloedbaar? | 💡 Aanname |
| Waar zit de meeste frustratie in het proces? | 💡 Aanname |
| Wat is het huidige foutpercentage? | ❓ Onbekend |
| Wat kost een foutieve leverancier/factuur gemiddeld? | ❓ Onbekend |

---

## 8. Volumescenario's

> **Label:** 💡 **Scenario-analyse** (geen harde claim)

| Scenario | Factuurvolume | Kosten (€16/stuk) | Tijd (19 min/stuk) |
|----------|--------------|-------------------|-------------------|
| Laag | 25.000 | €400.000 | 7.917 uur |
| Middel | 50.000 | €800.000 | 15.833 uur |
| Hoog | 90.000 | €1.440.000 | 28.500 uur |

---

## 9. Besparingsscenario's (procentueel)

| Reductie | Besparing 25k vol. | Besparing 50k vol. | Besparing 90k vol. |
|----------|-------------------|-------------------|-------------------|
| 10% | €40.000 / 792 uur | €80.000 / 1.583 uur | €144.000 / 2.850 uur |
| 20% | €80.000 / 1.583 uur | €160.000 / 3.167 uur | €288.000 / 5.700 uur |
| 30% | €120.000 / 2.375 uur | €240.000 / 4.750 uur | €432.000 / 8.550 uur |

> ⚠️ **Eerstvalideren!** Deze scenario's zijn rekensommen op basis van aannames. Harde besparingsclaims pas maken als volume en huidige kosten gevalideerd zijn.

---

## 10. Eerstvolgende acties

1. ☐ Ophelderen wat de dashboards precies tellen (25k vs 90k)
2. ☐ Jaarlijks volume leveranciersaanvragen achterhalen
3. ☐ Processtappen in detail in kaart brengen (wie doet wat, hoe lang, welke tools)
4. ☐ Prototype-datamodel uitwerken
5. ☐ Power BI proof-of-concept bouwen

---

*Dit document is een concept en bevat aannames. Alles gelabeld met ⚠️ of 💡 moet gevalideerd worden voordat er harde uitspraken gedaan worden.*