import type { Reason, ReasonCode } from '@/domain/optimization/reasons';
import { formatDistance, formatEuro, formatQuantity } from './format';
import { CATEGORY_LABELS } from './format';

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' ? value : fallback;
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Turns the optimizer's structured reason codes into Dutch sentences.
 *
 * The engine never writes prose — it records what happened and with which
 * numbers. All user-facing wording lives here, which is why the explanations
 * can never drift away from the actual calculation.
 */
export function explainReason(reason: Reason): string {
  const p = reason.params;
  switch (reason.code) {
    case 'STORE_CONSOLIDATION':
      return `Alles bij ${str(p.store)} — één keer boodschappen doen, ${formatDistance(num(p.distanceKm))} rijden.`;

    case 'EXTRA_STORE_WORTH_IT':
      return num(p.savingCents) > 0
        ? `${str(p.stores)} samen scheelt ${formatEuro(num(p.savingCents))} ten opzichte van alles bij één winkel, voor ongeveer ${formatDistance(num(p.extraKm))} extra rijden.`
        : `We verdelen de boodschappen over ${num(p.storeCount)} winkels: ${str(p.stores)}.`;

    case 'EXTRA_STORE_NOT_WORTH_IT':
      return `Een extra supermarkt zou nog ${formatEuro(num(p.savingCents))} besparen, maar kost ongeveer ${formatDistance(num(p.extraKm))} extra rijden. Dat weegt niet op.`;

    case 'CHEAPEST_STORE_FOR_CATEGORY':
      return `${str(p.store)} is deze week het voordeligst voor ${(CATEGORY_LABELS[str(p.category)] ?? str(p.category)).toLowerCase()}.`;

    case 'SHORT_TRAVEL_DISTANCE':
      return `De hele boodschappenrit is ongeveer ${formatDistance(num(p.distanceKm))}.`;

    case 'PROMOTION_USED':
      return `${str(p.ingredient)} valt onder "${str(p.label)}" — dat scheelt ${formatEuro(num(p.savingCents))}.`;

    case 'REUSED_LEFTOVER':
      return `${str(p.ingredient)} gebruik je op ${num(p.days)} dagen, dus één verpakking van ${formatQuantity(num(p.purchased), unitOf(p.unit))} is genoeg.`;

    case 'BULK_PACKAGE_CHEAPER':
      return `Van ${str(p.ingredient)} nemen we ${num(p.units)} verpakkingen — dat is samen goedkoper dan losse kleine verpakkingen.`;

    case 'LOW_WASTE':
      return num(p.leftoverGrams) === 0
        ? 'Er blijft vrijwel niets van de verse producten over.'
        : `Er blijft maar zo'n ${formatQuantity(num(p.leftoverGrams), 'g')} aan verse producten over.`;

    case 'LOW_PRICE':
      return `Deze maaltijd kost ongeveer ${formatEuro(num(p.perPersonCents))} per persoon.`;

    case 'NUTRITION_ON_TARGET':
      return `De porties sluiten goed aan op ieders geschatte behoefte (gemiddeld ${num(p.deviationKcal)} kcal verschil).`;

    case 'NUTRITION_OFF_TARGET':
      return `De porties wijken gemiddeld ${num(p.deviationKcal)} kcal af van de geschatte behoefte.`;

    case 'PREGNANCY_SAFE':
      return `Alle ${num(p.count)} gerechten zijn geschikt tijdens de zwangerschap.`;

    case 'ALLERGY_SAFE':
      return `Geen enkel gerecht bevat ${str(p.allergens)}.`;

    case 'GOOD_VARIETY':
      return `Gevarieerde week: ${num(p.cuisines)} verschillende keukens en ${num(p.proteins)} verschillende eiwitbronnen.`;

    case 'PREFERRED_RECIPE':
      return `Past bij jullie voorkeuren: ${str(p.terms)}.`;

    case 'PREFERRED_CUISINE':
      return `Een keuken die jullie lekker vinden: ${str(p.terms)}.`;

    case 'BUDGET_MET':
      return `Binnen het budget: ${formatEuro(num(p.actualCents))} van ${formatEuro(num(p.budgetCents))}.`;

    case 'BUDGET_EXCEEDED':
      return `De goedkoopste week die aan al jullie eisen voldoet kost ${formatEuro(num(p.actualCents))}, dat is ${formatEuro(num(p.shortfallCents))} boven je budget. We passen geen voedingsregels of uitsluitingen aan om eronder te komen.`;

    case 'ITEM_UNAVAILABLE':
      return `${str(p.ingredient)} is niet verkrijgbaar bij de gekozen supermarkten.`;
  }
}

function unitOf(value: unknown): 'g' | 'ml' | 'piece' {
  return value === 'ml' || value === 'piece' ? value : 'g';
}

/** Reason codes that read as a positive point in the "waarom deze week" list. */
const POSITIVE: ReadonlySet<ReasonCode> = new Set([
  'LOW_PRICE',
  'PROMOTION_USED',
  'REUSED_LEFTOVER',
  'LOW_WASTE',
  'BULK_PACKAGE_CHEAPER',
  'PREFERRED_RECIPE',
  'PREFERRED_CUISINE',
  'GOOD_VARIETY',
  'NUTRITION_ON_TARGET',
  'PREGNANCY_SAFE',
  'ALLERGY_SAFE',
  'STORE_CONSOLIDATION',
  'EXTRA_STORE_WORTH_IT',
  'BUDGET_MET',
  'SHORT_TRAVEL_DISTANCE',
]);

export function reasonTone(code: ReasonCode): 'positive' | 'neutral' | 'warning' {
  if (POSITIVE.has(code)) return 'positive';
  if (code === 'BUDGET_EXCEEDED' || code === 'ITEM_UNAVAILABLE' || code === 'NUTRITION_OFF_TARGET') {
    return 'warning';
  }
  return 'neutral';
}

const EXCLUSION_LABELS: Record<string, string> = {
  ALLERGEN: 'allergie',
  PREGNANCY: 'zwangerschap',
  VEGETARIAN_REQUIRED: 'vegetarisch',
  VEGAN_REQUIRED: 'veganistisch',
  PESCETARIAN_REQUIRED: 'pescotarisch',
  EXCLUDED_INGREDIENT: 'uitgesloten ingrediënt',
  DISLIKED_EXCLUDED_TAG: 'uitgesloten categorie',
  DISLIKED_EXCLUDED_CUISINE: 'uitgesloten keuken',
  TOO_MUCH_TIME: 'te veel bereidingstijd',
};

export function explainExclusion(reason: string): string {
  return EXCLUSION_LABELS[reason] ?? reason;
}
