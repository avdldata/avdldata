import type { Cents } from '../units';
import type { Quantity } from '../units';
import type { IngredientId } from '../ingredients/types';
import type { NutritionPer100, NutritionSource } from '../nutrition/facts';

export type ChainId = string;
export type LocationId = string;
export type ProductId = string;
export type RegionId = string;
export type BrandId = string;

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
 * A brand, as its own record.
 *
 * "Campina" is not a property of one carton of milk — it spans products and
 * chains, and a private label belongs to exactly one chain. Modelling it as a
 * string on the product made both of those impossible to express.
 */
export interface Brand {
  readonly id: BrandId;
  readonly name: string;
  readonly isPrivateLabel: boolean;
  /** Set for a private label: the chain that owns it. */
  readonly chainId?: ChainId;
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

/**
 * A concrete, sellable article — one SKU.
 *
 * Each pack size is its own product, because that is what a barcode identifies
 * and what a product feed delivers: "Jumbo Kipfilet 500 g" and "Jumbo Kipfilet
 * 300 g" are two articles, not one article with two options.
 *
 * Note what is NOT here: price. Product data is comparatively stable, price
 * changes weekly — see `PriceObservation`.
 */
export interface Product {
  readonly id: ProductId;
  /** GTIN/EAN barcode, when the source provides one. */
  readonly gtin?: string;
  readonly brandId: BrandId;
  readonly productName: string;
  readonly canonicalIngredientId: IngredientId;
  readonly packageAmount: Quantity;
  readonly chainId: ChainId;
  /** Delisted products stay in the catalogue for price history, but are not sold. */
  readonly active: boolean;
  readonly imageUrl?: string;
  /**
   * When set, the product is only stocked at these locations. Absent means
   * "available across the chain".
   */
  readonly availableAtLocationIds?: readonly LocationId[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Nutrition as declared on this specific article.
 *
 * Two tubs of Greek yoghurt can differ meaningfully in fat and sugar, so a
 * product may carry its own values. Where it does not, the canonical
 * ingredient's generic values are used instead — see `resolveProductNutrition`.
 */
export interface ProductNutrition {
  readonly productId: ProductId;
  readonly per100: NutritionPer100;
  readonly source: NutritionSource;
  readonly updatedAt: string;
}

/**
 * One observation of a price at a point in time.
 *
 * Prices are events, not fields. Every new observation is appended rather than
 * overwriting the last one, which is what makes "cheapest in twelve weeks" and
 * an honest discount calculation possible at all.
 */
export interface PriceObservation {
  readonly id: string;
  readonly productId: ProductId;
  readonly scope: PriceScope;
  readonly priceCents: Cents;
  /** Price per base unit at the time of observation, when the source gives it. */
  readonly unitPriceCents?: number;
  /** ISO dates. `validUntil` absent means "still on the shelf". */
  readonly validFrom: string;
  readonly validUntil?: string;
  /** When this price was seen. Two observations never overwrite each other. */
  readonly observedAt: string;
  readonly source: PriceSource;
}

export const PRICE_SOURCES = ['demo-seed', 'chain-api', 'folder', 'handmatig'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PROMOTION_TYPES = ['FIXED_PRICE', 'PERCENT_OFF', 'ONE_PLUS_ONE', 'N_FOR_X'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export type PromotionParams =
  | { readonly type: 'FIXED_PRICE'; readonly unitPriceCents: Cents }
  | { readonly type: 'PERCENT_OFF'; readonly percent: number }
  | { readonly type: 'ONE_PLUS_ONE' }
  | { readonly type: 'N_FOR_X'; readonly bundleSize: number; readonly bundlePriceCents: Cents }
  /**
   * Every nth item is discounted: "2e halve prijs" is `{ nth: 2, percent: 50 }`
   * and "3e gratis" is `{ nth: 3, percent: 100 }`.
   *
   * This is the shape `PERCENT_OFF` cannot express. A percentage off with a
   * minimum quantity discounts *every* pack you buy, which is a different and
   * cheaper offer than discounting only the second one — modelling the Dutch
   * standard that way understates the bill.
   */
  | { readonly type: 'BUY_NTH_DISCOUNT'; readonly nth: number; readonly percent: number };

export interface Promotion {
  readonly id: string;
  readonly productId: ProductId;
  readonly scope: PriceScope;
  readonly params: PromotionParams;
  /**
   * The promotion only applies from this many units ("vanaf 3 stuks").
   *
   * Note what this does NOT model: a PERCENT_OFF with minUnits 2 discounts both
   * packs, so it is "2 stuks, beide 50% korting" and not "2e halve prijs". The
   * latter needs its own promotion type; see DATA_SOURCES.md.
   */
  readonly minUnits: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly label: string;
  readonly source?: PriceSource;
}

/**
 * A product, its effective price, its nutrition and any active promotion,
 * resolved for one specific store location on one specific date.
 *
 * This is the only shape the pricing, packaging and optimisation engines ever
 * see: they never touch the product catalogue, the price history or the
 * nutrition tables directly.
 */
export interface ProductOffer {
  readonly productId: ProductId;
  readonly chainId: ChainId;
  readonly locationId: LocationId;
  readonly ingredientId: IngredientId;
  /** Full display name, brand included. */
  readonly name: string;
  readonly brandName: string;
  readonly isPrivateLabel: boolean;
  readonly packageAmount: Quantity;
  /**
   * The reference price this offer is compared against: the median of recent
   * observations rather than a self-declared list price.
   */
  readonly normalUnitPriceCents: Cents;
  /** Shelf price for a single unit today, before multi-buy promotions. */
  readonly unitPriceCents: Cents;
  readonly promotion?: Promotion;
  /** Shelf price expressed per gram / ml / piece — for display and sorting only. */
  readonly pricePerBaseUnitCents: number;
  /** Product-specific values when declared, otherwise the ingredient's generic ones. */
  readonly nutritionPer100?: NutritionPer100;
  readonly nutritionSource?: NutritionSource;
  /** Which of the two the nutrition above came from. */
  readonly nutritionOrigin: 'product' | 'ingredient' | 'none';
}
