import { describe, expect, it } from 'vitest';
import { cents } from '@/domain/units';
import {
  groupOffersByIngredient,
  resolveOffersForLocation,
  resolveProductNutrition,
} from '@/domain/stores/offers';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import type {
  Brand,
  PriceObservation,
  Product,
  ProductNutrition,
  Promotion,
  SupermarketLocation,
} from '@/domain/stores/types';
import type { NutritionPer100 } from '@/domain/nutrition/facts';
import { makeIngredient } from '../support/builders';

const location: SupermarketLocation = {
  id: 'jumbo-1',
  chainId: 'jumbo',
  name: 'Jumbo',
  address: '',
  postalCode: '',
  city: 'Groningen',
  latitude: 53.2,
  longitude: 6.5,
  regionId: 'noord',
};

const otherLocation: SupermarketLocation = { ...location, id: 'jumbo-2', regionId: 'zuid' };

const brands: Brand[] = [
  { id: 'brand-jumbo', name: 'Jumbo', isPrivateLabel: true, chainId: 'jumbo' },
  { id: 'brand-campina', name: 'Campina', isPrivateLabel: false },
];

const INGREDIENT_NUTRITION: NutritionPer100 = {
  kcal: 106,
  protein: 22.5,
  carbohydrates: 0,
  sugars: 0,
  fat: 1.8,
  saturatedFat: 0.5,
  fiber: 0,
  salt: 0.15,
};

const PRODUCT_NUTRITION: NutritionPer100 = { ...INGREDIENT_NUTRITION, kcal: 121, protein: 24 };

const ingredients = buildIngredientIndex([
  makeIngredient('kipfilet', { nutritionPer100: INGREDIENT_NUTRITION }),
  makeIngredient('rijst'),
]);

const product: Product = {
  id: 'p1',
  gtin: '2000000000001',
  brandId: 'brand-jumbo',
  productName: 'Kipfilet',
  canonicalIngredientId: 'kipfilet',
  packageAmount: { amount: 500, unit: 'g' },
  chainId: 'jumbo',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function observation(overrides: Partial<PriceObservation> = {}): PriceObservation {
  return {
    id: `obs-${overrides.observedAt ?? 'default'}-${overrides.priceCents ?? 549}`,
    productId: 'p1',
    scope: { kind: 'chain', chainId: 'jumbo' },
    priceCents: cents(549),
    validFrom: '2026-02-23',
    observedAt: '2026-02-23',
    source: 'demo-seed',
    ...overrides,
  };
}

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'promo-1',
    productId: 'p1',
    scope: { kind: 'chain', chainId: 'jumbo' },
    params: { type: 'ONE_PLUS_ONE' },
    minUnits: 2,
    validFrom: '2026-03-01',
    validUntil: '2026-03-08',
    label: '1 + 1 gratis',
    ...overrides,
  };
}

const baseInput = {
  products: [product],
  observations: [observation()],
  promotions: [],
  brands,
  ingredients,
  onDate: '2026-03-02',
};

describe('offer resolution', () => {
  it('joins product, brand and price into a flat offer', () => {
    const { offers, issues } = resolveOffersForLocation(location, baseInput);
    expect(issues).toHaveLength(0);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.unitPriceCents).toBe(549);
    expect(offers[0]!.name).toBe('Jumbo Kipfilet');
    expect(offers[0]!.brandName).toBe('Jumbo');
    expect(offers[0]!.isPrivateLabel).toBe(true);
    expect(offers[0]!.pricePerBaseUnitCents).toBeCloseTo(549 / 500, 6);
  });

  it('prefers a store price over a regional price over a chain price', () => {
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [
        observation({ id: 'chain', priceCents: cents(549) }),
        observation({
          id: 'region',
          scope: { kind: 'region', chainId: 'jumbo', regionId: 'noord' },
          priceCents: cents(529),
        }),
        observation({
          id: 'store',
          scope: { kind: 'location', locationId: 'jumbo-1' },
          priceCents: cents(499),
        }),
      ],
    });
    expect(offers[0]!.unitPriceCents).toBe(499);
  });

  it('does not apply a regional price outside its region', () => {
    const { offers } = resolveOffersForLocation(otherLocation, {
      ...baseInput,
      observations: [
        observation({ id: 'chain', priceCents: cents(549) }),
        observation({
          id: 'region',
          scope: { kind: 'region', chainId: 'jumbo', regionId: 'noord' },
          priceCents: cents(529),
        }),
      ],
    });
    expect(offers[0]!.unitPriceCents).toBe(549);
  });

  it('takes the most recent observation within the same scope', () => {
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [
        observation({ id: 'old', priceCents: cents(599), observedAt: '2026-02-16' }),
        observation({ id: 'new', priceCents: cents(529), observedAt: '2026-03-02' }),
      ],
    });
    expect(offers[0]!.unitPriceCents).toBe(529);
  });

  it('reports a product with no valid price instead of pricing it at zero', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [observation({ validFrom: '2019-01-01', validUntil: '2019-12-31' })],
    });
    expect(offers).toHaveLength(0);
    expect(issues[0]).toEqual({ productId: 'p1', locationId: 'jumbo-1', reason: 'MISSING_PRICE' });
  });

  it('reports a product that this branch does not stock', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      ...baseInput,
      products: [{ ...product, availableAtLocationIds: ['jumbo-2'] }],
    });
    expect(offers).toHaveLength(0);
    expect(issues[0]!.reason).toBe('NOT_STOCKED');
  });

  it('leaves a delisted product out of the offers but keeps it in the catalogue', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      ...baseInput,
      products: [{ ...product, active: false }],
    });
    expect(offers).toHaveLength(0);
    expect(issues[0]!.reason).toBe('INACTIVE');
  });

  it('attaches an active promotion and ignores an expired one', () => {
    const active = resolveOffersForLocation(location, {
      ...baseInput,
      promotions: [promotion()],
    });
    expect(active.offers[0]!.promotion?.label).toBe('1 + 1 gratis');

    const expired = resolveOffersForLocation(location, {
      ...baseInput,
      promotions: [promotion({ validFrom: '2026-02-01', validUntil: '2026-02-07' })],
    });
    expect(expired.offers[0]!.promotion).toBeUndefined();
  });

  it('ignores products from another chain entirely', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      ...baseInput,
      products: [{ ...product, chainId: 'lidl' }],
    });
    expect(offers).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it('groups offers by canonical ingredient', () => {
    const second: Product = { ...product, id: 'p2', canonicalIngredientId: 'rijst' };
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      products: [product, second],
      observations: [observation(), observation({ id: 'obs-p2', productId: 'p2' })],
    });
    const grouped = groupOffersByIngredient(offers);
    expect([...grouped.keys()].sort()).toEqual(['kipfilet', 'rijst']);
  });
});

describe('reference price from history', () => {
  const weekly = (weeksAgo: number, priceCents: number): PriceObservation => {
    const date = new Date('2026-03-02T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - weeksAgo * 7);
    const iso = date.toISOString().slice(0, 10);
    return observation({ id: `obs-${iso}`, priceCents: cents(priceCents), validFrom: iso, observedAt: iso });
  };

  it('uses the median of recent observations as the normal price', () => {
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [weekly(3, 599), weekly(2, 599), weekly(1, 579), weekly(0, 449)],
    });
    expect(offers[0]!.unitPriceCents).toBe(449);
    expect(offers[0]!.normalUnitPriceCents).toBe(589); // median of 449/579/599/599
  });

  it('never invents a discount when today is the most expensive week', () => {
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [weekly(2, 399), weekly(1, 419), weekly(0, 599)],
    });
    expect(offers[0]!.normalUnitPriceCents).toBe(599);
  });

  it('falls back to the current price when there is barely any history', () => {
    const { offers } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [weekly(0, 549)],
    });
    expect(offers[0]!.normalUnitPriceCents).toBe(549);
  });

  it('returns the statistics alongside the offers', () => {
    const { stats } = resolveOffersForLocation(location, {
      ...baseInput,
      observations: [weekly(2, 599), weekly(1, 549), weekly(0, 449)],
    });
    const productStats = stats.get('p1')!;
    expect(productStats.observationCount).toBe(3);
    expect(productStats.minCents).toBe(449);
    expect(productStats.maxCents).toBe(599);
    expect(productStats.latestCents).toBe(449);
  });
});

describe('nutrition fallback', () => {
  const productNutrition: ProductNutrition[] = [
    { productId: 'p1', per100: PRODUCT_NUTRITION, source: 'product-label', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('uses the product’s own declaration when it has one', () => {
    const resolved = resolveProductNutrition(
      product,
      new Map(productNutrition.map((entry) => [entry.productId, entry])),
      ingredients,
    );
    expect(resolved.origin).toBe('product');
    expect(resolved.per100?.kcal).toBe(121);
    expect(resolved.source).toBe('product-label');
  });

  it('falls back to the canonical ingredient when the product declares nothing', () => {
    const resolved = resolveProductNutrition(product, new Map(), ingredients);
    expect(resolved.origin).toBe('ingredient');
    expect(resolved.per100?.kcal).toBe(106);
  });

  it('reports no nutrition at all rather than guessing', () => {
    const resolved = resolveProductNutrition(
      { ...product, canonicalIngredientId: 'rijst' },
      new Map(),
      ingredients,
    );
    expect(resolved.origin).toBe('none');
    expect(resolved.per100).toBeUndefined();
  });

  it('carries the resolved nutrition onto the offer', () => {
    const withLabel = resolveOffersForLocation(location, { ...baseInput, productNutrition });
    expect(withLabel.offers[0]!.nutritionOrigin).toBe('product');
    expect(withLabel.offers[0]!.nutritionPer100?.kcal).toBe(121);

    const withoutLabel = resolveOffersForLocation(location, baseInput);
    expect(withoutLabel.offers[0]!.nutritionOrigin).toBe('ingredient');
    expect(withoutLabel.offers[0]!.nutritionPer100?.kcal).toBe(106);
  });
});
