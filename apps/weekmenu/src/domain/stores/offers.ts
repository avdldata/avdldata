import { isWithinValidity } from '../pricing/promotions';
import {
  DEFAULT_HISTORY_WEEKS,
  getHistoricalPriceStats,
  indexObservationsByProduct,
  referencePriceCents,
  windowEndingAt,
} from '../pricing/price-history';
import type { HistoricalPriceStats } from '../pricing/price-history';
import type { CanonicalIngredient } from '../ingredients/types';
import type { NutritionPer100, NutritionSource } from '../nutrition/facts';
import type {
  Brand,
  PriceObservation,
  PriceScope,
  Product,
  ProductNutrition,
  ProductOffer,
  Promotion,
  SupermarketLocation,
} from './types';

export interface OfferCatalogInput {
  readonly products: readonly Product[];
  readonly observations: readonly PriceObservation[];
  readonly promotions: readonly Promotion[];
  readonly brands: readonly Brand[];
  readonly productNutrition?: readonly ProductNutrition[];
  readonly ingredients?: ReadonlyMap<string, CanonicalIngredient>;
  /** ISO date the plan is priced for. Passed in — the domain never reads a clock. */
  readonly onDate: string;
  /** How far back the reference price looks. */
  readonly historyWeeks?: number;
}

export interface OfferResolutionIssue {
  readonly productId: string;
  readonly locationId: string;
  readonly reason: 'MISSING_PRICE' | 'NOT_STOCKED' | 'INACTIVE';
}

export interface ResolvedOffers {
  readonly offers: readonly ProductOffer[];
  readonly issues: readonly OfferResolutionIssue[];
  /** Price statistics per product, for the deal score and the UI. */
  readonly stats: ReadonlyMap<string, HistoricalPriceStats>;
}

/** Location beats region beats chain. */
function scopeSpecificity(scope: PriceScope): number {
  switch (scope.kind) {
    case 'location':
      return 3;
    case 'region':
      return 2;
    case 'chain':
      return 1;
  }
}

function scopeMatchesLocation(scope: PriceScope, location: SupermarketLocation): boolean {
  switch (scope.kind) {
    case 'location':
      return scope.locationId === location.id;
    case 'region':
      return scope.chainId === location.chainId && scope.regionId === location.regionId;
    case 'chain':
      return scope.chainId === location.chainId;
  }
}

function isStocked(product: Product, location: SupermarketLocation): boolean {
  if (product.chainId !== location.chainId) return false;
  if (!product.availableAtLocationIds) return true;
  return product.availableAtLocationIds.includes(location.id);
}

/**
 * Product nutrition when the article declares its own, otherwise the canonical
 * ingredient's generic values.
 *
 * The fallback is explicit and the origin is recorded, so the UI can say
 * "volgens het etiket" versus "gemiddelde waarde" instead of presenting a guess
 * as a fact.
 */
export function resolveProductNutrition(
  product: Product,
  productNutrition: ReadonlyMap<string, ProductNutrition>,
  ingredients: ReadonlyMap<string, CanonicalIngredient>,
): {
  per100?: NutritionPer100;
  source?: NutritionSource;
  origin: 'product' | 'ingredient' | 'none';
} {
  const own = productNutrition.get(product.id);
  if (own) return { per100: own.per100, source: own.source, origin: 'product' };

  const ingredient = ingredients.get(product.canonicalIngredientId);
  if (ingredient?.nutritionPer100) {
    return {
      per100: ingredient.nutritionPer100,
      ...(ingredient.nutritionSource ? { source: ingredient.nutritionSource } : {}),
      origin: 'ingredient',
    };
  }
  return { origin: 'none' };
}

/**
 * Resolve everything a store location sells today into flat `ProductOffer`s.
 *
 * This is the join between the six separate concerns — product, brand,
 * nutrition, price history, promotion and store — and the only place they meet.
 * Anything that cannot be priced is reported as an issue rather than silently
 * dropped, so the planner can say "dit product is hier niet verkrijgbaar"
 * instead of quietly producing a cheaper-looking week.
 */
export function resolveOffersForLocation(
  location: SupermarketLocation,
  input: OfferCatalogInput,
): ResolvedOffers {
  const offers: ProductOffer[] = [];
  const issues: OfferResolutionIssue[] = [];
  const stats = new Map<string, HistoricalPriceStats>();

  // Index once. Without this, a twelve-week history turns offer resolution into
  // a full scan of every observation for every product.
  const observationsByProduct = indexObservationsByProduct(input.observations);
  const promotionsByProduct = groupBy(input.promotions, (promotion) => promotion.productId);
  const brandsById = new Map(input.brands.map((brand) => [brand.id, brand]));
  const nutritionByProduct = new Map(
    (input.productNutrition ?? []).map((entry) => [entry.productId, entry]),
  );
  const ingredients = input.ingredients ?? new Map<string, CanonicalIngredient>();
  const window = windowEndingAt(input.onDate, input.historyWeeks ?? DEFAULT_HISTORY_WEEKS);

  for (const product of input.products) {
    if (product.chainId !== location.chainId) continue;

    if (!product.active) {
      issues.push({ productId: product.id, locationId: location.id, reason: 'INACTIVE' });
      continue;
    }
    if (!isStocked(product, location)) {
      issues.push({ productId: product.id, locationId: location.id, reason: 'NOT_STOCKED' });
      continue;
    }

    const history = observationsByProduct.get(product.id) ?? [];
    const current = pickCurrentObservation(history, location, input.onDate);
    if (!current) {
      issues.push({ productId: product.id, locationId: location.id, reason: 'MISSING_PRICE' });
      continue;
    }

    const productStats = getHistoricalPriceStats(product.id, history, window);
    if (productStats) stats.set(product.id, productStats);

    const promotion = pickMostSpecific(
      (promotionsByProduct.get(product.id) ?? []).filter(
        (candidate) =>
          scopeMatchesLocation(candidate.scope, location) &&
          isWithinValidity(candidate, input.onDate),
      ),
      (candidate) => scopeSpecificity(candidate.scope),
      (candidate) => candidate.id,
    );

    const brand = brandsById.get(product.brandId);
    const nutrition = resolveProductNutrition(product, nutritionByProduct, ingredients);

    offers.push({
      productId: product.id,
      chainId: product.chainId,
      locationId: location.id,
      ingredientId: product.canonicalIngredientId,
      name: brand ? `${brand.name} ${product.productName}` : product.productName,
      brandName: brand?.name ?? '',
      isPrivateLabel: brand?.isPrivateLabel ?? false,
      packageAmount: product.packageAmount,
      normalUnitPriceCents: referencePriceCents(productStats, current.priceCents),
      unitPriceCents: current.priceCents,
      ...(promotion ? { promotion } : {}),
      pricePerBaseUnitCents:
        product.packageAmount.amount > 0
          ? current.priceCents / product.packageAmount.amount
          : Number.POSITIVE_INFINITY,
      ...(nutrition.per100 ? { nutritionPer100: nutrition.per100 } : {}),
      ...(nutrition.source ? { nutritionSource: nutrition.source } : {}),
      nutritionOrigin: nutrition.origin,
      // Provenance travels with the price, not beside it.
      ...(current.source ? { priceSource: current.source } : {}),
      ...(current.observedAt ? { priceObservedAt: current.observedAt } : {}),
    });
  }

  // Deterministic order: cheapest per base unit first, product id as tie-break.
  offers.sort(
    (a, b) =>
      a.pricePerBaseUnitCents - b.pricePerBaseUnitCents || a.productId.localeCompare(b.productId),
  );

  return { offers, issues, stats };
}

/**
 * The price on the shelf today: the most specific scope that is valid now, and
 * within that the most recently observed value.
 */
function pickCurrentObservation(
  history: readonly PriceObservation[],
  location: SupermarketLocation,
  onDate: string,
): PriceObservation | undefined {
  const valid = history.filter(
    (observation) =>
      scopeMatchesLocation(observation.scope, location) &&
      observation.validFrom <= onDate &&
      (observation.validUntil === undefined || observation.validUntil >= onDate),
  );
  if (valid.length === 0) return undefined;

  return [...valid].sort(
    (a, b) =>
      scopeSpecificity(b.scope) - scopeSpecificity(a.scope) ||
      b.observedAt.localeCompare(a.observedAt) ||
      a.id.localeCompare(b.id),
  )[0];
}

function pickMostSpecific<T>(
  candidates: readonly T[],
  specificity: (item: T) => number,
  id: (item: T) => string,
): T | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort(
    (a, b) => specificity(b) - specificity(a) || id(a).localeCompare(id(b)),
  )[0];
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(key(item));
    if (list) list.push(item);
    else grouped.set(key(item), [item]);
  }
  return grouped;
}

/** Group offers by canonical ingredient — the shape the packaging optimizer wants. */
export function groupOffersByIngredient(
  offers: readonly ProductOffer[],
): ReadonlyMap<string, readonly ProductOffer[]> {
  return groupBy(offers, (offer) => offer.ingredientId);
}
