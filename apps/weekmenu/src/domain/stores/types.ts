import type { Cents } from '../units';
import type { Quantity } from '../units';
import type { IngredientId } from '../ingredients/types';

export type ChainId = string;
export type LocationId = string;
export type ProductId = string;
export type RegionId = string;

export interface SupermarketChain {
  readonly id: ChainId;
  readonly name: string;
  readonly logoUrl: string;
  /** Brand colour used by the UI to tell stores apart at a glance. */
  readonly colorHex: string;
}

export interface SupermarketLocation {
  readonly id: LocationId;
  readonly chainId: ChainId;
  readonly name: string;
  readonly address: string;
  readonly postalCode: string;
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly regionId: RegionId;
}

/**
 * Prices and promotions rarely apply to exactly one shop. A chain price is the
 * common case, a regional price happens, and a single-store price exists.
 * Keeping the three apart from day one is why chain ≠ location ≠ price.
 */
export type PriceScope =
  | { readonly kind: 'chain'; readonly chainId: ChainId }
  | { readonly kind: 'region'; readonly chainId: ChainId; readonly regionId: RegionId }
  | { readonly kind: 'location'; readonly locationId: LocationId };

export interface Product {
  readonly id: ProductId;
  readonly chainId: ChainId;
  readonly name: string;
  readonly brand: string;
  readonly canonicalIngredientId: IngredientId;
  readonly packageAmount: Quantity;
  /**
   * When set, the product is only stocked at these locations. Absent means
   * "available across the chain".
   */
  readonly availableAtLocationIds?: readonly LocationId[];
}

export interface ProductPrice {
  readonly id: string;
  readonly productId: ProductId;
  readonly scope: PriceScope;
  readonly normalPriceCents: Cents;
  /** Shelf price today; equals the normal price unless there is a markdown. */
  readonly currentPriceCents: Cents;
  /** ISO dates, inclusive start / exclusive end. */
  readonly validFrom: string;
  readonly validUntil: string;
}

export const PROMOTION_TYPES = [
  'FIXED_PRICE',
  'PERCENT_OFF',
  'ONE_PLUS_ONE',
  'N_FOR_X',
] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export type PromotionParams =
  | { readonly type: 'FIXED_PRICE'; readonly unitPriceCents: Cents }
  | { readonly type: 'PERCENT_OFF'; readonly percent: number }
  | { readonly type: 'ONE_PLUS_ONE' }
  | { readonly type: 'N_FOR_X'; readonly bundleSize: number; readonly bundlePriceCents: Cents };

export interface Promotion {
  readonly id: string;
  readonly productId: ProductId;
  readonly scope: PriceScope;
  readonly params: PromotionParams;
  /** The promotion only kicks in from this many units (e.g. "2e halve prijs"). */
  readonly minUnits: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly label: string;
}

/**
 * A product, its effective price and any active promotion, resolved for one
 * specific store location on one specific date. This is the only shape the
 * pricing and packaging engines ever see.
 */
export interface ProductOffer {
  readonly productId: ProductId;
  readonly chainId: ChainId;
  readonly locationId: LocationId;
  readonly ingredientId: IngredientId;
  readonly name: string;
  readonly brand: string;
  readonly packageAmount: Quantity;
  readonly normalUnitPriceCents: Cents;
  /** Shelf price for a single unit, before multi-buy promotions. */
  readonly unitPriceCents: Cents;
  readonly promotion?: Promotion;
  /** Shelf price expressed per gram / ml / piece — for display and sorting only. */
  readonly pricePerBaseUnitCents: number;
}
