
import { isWithinValidity } from '../pricing/promotions';
import type {
  PriceScope,
  Product,
  ProductOffer,
  ProductPrice,
  Promotion,
  SupermarketLocation,
} from './types';

export interface OfferCatalogInput {
  readonly products: readonly Product[];
  readonly prices: readonly ProductPrice[];
  readonly promotions: readonly Promotion[];
  /** ISO date the plan is priced for. Passed in — the domain never reads a clock. */
  readonly onDate: string;
}

export interface OfferResolutionIssue {
  readonly productId: string;
  readonly locationId: string;
  readonly reason: 'MISSING_PRICE' | 'NOT_STOCKED';
}

export interface ResolvedOffers {
  readonly offers: readonly ProductOffer[];
  readonly issues: readonly OfferResolutionIssue[];
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
 * Resolve everything a store location sells today into flat `ProductOffer`s.
 *
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

  for (const product of input.products) {
    if (product.chainId !== location.chainId) continue;

    if (!isStocked(product, location)) {
      issues.push({ productId: product.id, locationId: location.id, reason: 'NOT_STOCKED' });
      continue;
    }

    const price = pickMostSpecific(
      input.prices.filter(
        (p) =>
          p.productId === product.id &&
          scopeMatchesLocation(p.scope, location) &&
          isWithinValidity(p, input.onDate),
      ),
      (p) => scopeSpecificity(p.scope),
      (p) => p.id,
    );

    if (!price) {
      issues.push({ productId: product.id, locationId: location.id, reason: 'MISSING_PRICE' });
      continue;
    }

    const promotion = pickMostSpecific(
      input.promotions.filter(
        (p) =>
          p.productId === product.id &&
          scopeMatchesLocation(p.scope, location) &&
          isWithinValidity(p, input.onDate),
      ),
      (p) => scopeSpecificity(p.scope),
      (p) => p.id,
    );

    offers.push({
      productId: product.id,
      chainId: product.chainId,
      locationId: location.id,
      ingredientId: product.canonicalIngredientId,
      name: product.name,
      brand: product.brand,
      packageAmount: product.packageAmount,
      normalUnitPriceCents: price.normalPriceCents,
      unitPriceCents: price.currentPriceCents,
      ...(promotion ? { promotion } : {}),
      pricePerBaseUnitCents:
        product.packageAmount.amount > 0
          ? price.currentPriceCents / product.packageAmount.amount
          : Number.POSITIVE_INFINITY,
    });
  }

  // Deterministic order: cheapest per base unit first, product id as tie-break.
  offers.sort(
    (a, b) =>
      a.pricePerBaseUnitCents - b.pricePerBaseUnitCents || a.productId.localeCompare(b.productId),
  );

  return { offers, issues };
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

/** Group offers by canonical ingredient — the shape the packaging optimizer wants. */
export function groupOffersByIngredient(
  offers: readonly ProductOffer[],
): ReadonlyMap<string, readonly ProductOffer[]> {
  const grouped = new Map<string, ProductOffer[]>();
  for (const offer of offers) {
    const list = grouped.get(offer.ingredientId);
    if (list) list.push(offer);
    else grouped.set(offer.ingredientId, [offer]);
  }
  return grouped;
}

