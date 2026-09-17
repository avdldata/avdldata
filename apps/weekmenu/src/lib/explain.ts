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
export interface ExplainOptions {
  /**
   * Do we know where the branches are?
   *
   * In REAL mode we do not: the price snapshot is a catalogue, not a map. The
   * engine still computes a distance from the seeded coordinates, and four of
   * its reasons quote it — which put "11,6 km rijden" on the same screen as
   * "we kennen de echte filiaaladressen nog niet". The number is dropped here
   * rather than in the engine, because what the user is told is this layer's
   * job and the engine's arithmetic is unchanged.
   */
  readonly travelKnown?: boolean;
}

/** A reason that says nothing once its distance is removed. */
export const DISTANCE_ONLY_REASONS: readonly ReasonCode[] = ['SHORT_TRAVEL_DISTANCE'];

export function explainReason(reason: Reason, options: ExplainOptions = {}): string {
  const p = reason.params;
  const travelKnown = options.travelKnown ?? true;
  switch (reason.code) {
    case 'STORE_CONSOLIDATION':
      return travelKnown
        ? `Alles bij ${str(p.store)} — één keer boodschappen doen, ${formatDistance(num(p.distanceKm))} rijden.`
        : `Alles bij ${str(p.store)} — één keer boodschappen doen.`;

    case 'EXTRA_STORE_WORTH_IT':
      if (num(p.savingCents) <= 0) {
        return `We verdelen de boodschappen over ${num(p.storeCount)} winkels: ${str(p.stores)}.`;
      }
      return travelKnown
        ? `${str(p.stores)} samen scheelt ${formatEuro(num(p.savingCents))} ten opzichte van alles bij één winkel, voor ongeveer ${formatDistance(num(p.extraKm))} extra rijden.`
        : `${str(p.stores)} samen scheelt ${formatEuro(num(p.savingCents))} ten opzichte van alles bij één winkel.`;

    case 'EXTRA_STORE_NOT_WORTH_IT':
      return travelKnown
        ? `Een extra supermarkt zou nog ${formatEuro(num(p.savingCents))} besparen, maar kost ongeveer ${formatDistance(num(p.extraKm))} extra rijden. Dat weegt niet op.`
        : `Een extra supermarkt zou nog ${formatEuro(num(p.savingCents))} besparen, maar dat weegt niet op tegen een tweede keer boodschappen doen.`;

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

    case 'VARIETY_COMPROMISED':
      return `Deze week herhaalt zichzelf op ${num(p.violations)} punt${num(p.violations) === 1 ? '' : 'en'}. Met jullie instellingen blijven er te weinig gerechten over om alle variatieregels te halen; we kiezen dan liever voor een volledige week dan voor geen week.`;

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
  if (
    code === 'BUDGET_EXCEEDED' ||
    code === 'ITEM_UNAVAILABLE' ||
    code === 'NUTRITION_OFF_TARGET' ||
    code === 'VARIETY_COMPROMISED'
  ) {
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
