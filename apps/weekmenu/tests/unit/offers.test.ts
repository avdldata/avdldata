import { describe, expect, it } from 'vitest';
import { cents } from '@/domain/units';
import { resolveOffersForLocation, groupOffersByIngredient } from '@/domain/stores/offers';
import type {
  Product,
  ProductPrice,
  Promotion,
  SupermarketLocation,
} from '@/domain/stores/types';

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

const product: Product = {
  id: 'p1',
  chainId: 'jumbo',
  name: 'Kipfilet',
  brand: 'Jumbo',
  canonicalIngredientId: 'kipfilet',
  packageAmount: { amount: 500, unit: 'g' },
};

function price(overrides: Partial<ProductPrice> = {}): ProductPrice {
  return {
    id: 'price-1',
    productId: 'p1',
    scope: { kind: 'chain', chainId: 'jumbo' },
    normalPriceCents: cents(549),
    currentPriceCents: cents(549),
    validFrom: '2020-01-01',
    validUntil: '2099-12-31',
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

describe('offer resolution', () => {
  it('resolves a chain price into a flat offer', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      products: [product],
      prices: [price()],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(issues).toHaveLength(0);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.unitPriceCents).toBe(549);
    expect(offers[0]!.pricePerBaseUnitCents).toBeCloseTo(549 / 500, 6);
  });

  it('prefers a store price over a regional price over a chain price', () => {
    const { offers } = resolveOffersForLocation(location, {
      products: [product],
      prices: [
        price({ id: 'chain', currentPriceCents: cents(549) }),
        price({ id: 'region', scope: { kind: 'region', chainId: 'jumbo', regionId: 'noord' }, currentPriceCents: cents(529) }),
        price({ id: 'store', scope: { kind: 'location', locationId: 'jumbo-1' }, currentPriceCents: cents(499) }),
      ],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(offers[0]!.unitPriceCents).toBe(499);
  });

  it('does not apply a regional price outside its region', () => {
    const { offers } = resolveOffersForLocation(otherLocation, {
      products: [product],
      prices: [
        price({ id: 'chain', currentPriceCents: cents(549) }),
        price({ id: 'region', scope: { kind: 'region', chainId: 'jumbo', regionId: 'noord' }, currentPriceCents: cents(529) }),
      ],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(offers[0]!.unitPriceCents).toBe(549);
  });

  it('reports a product with no valid price instead of pricing it at zero', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      products: [product],
      prices: [price({ validFrom: '2019-01-01', validUntil: '2019-12-31' })],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(offers).toHaveLength(0);
    expect(issues[0]).toEqual({ productId: 'p1', locationId: 'jumbo-1', reason: 'MISSING_PRICE' });
  });

  it('reports a product that this branch does not stock', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      products: [{ ...product, availableAtLocationIds: ['jumbo-2'] }],
      prices: [price()],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(offers).toHaveLength(0);
    expect(issues[0]!.reason).toBe('NOT_STOCKED');
  });

  it('attaches an active promotion and ignores an expired one', () => {
    const active = resolveOffersForLocation(location, {
      products: [product],
      prices: [price()],
      promotions: [promotion()],
      onDate: '2026-03-02',
    });
    expect(active.offers[0]!.promotion?.label).toBe('1 + 1 gratis');

    const expired = resolveOffersForLocation(location, {
      products: [product],
      prices: [price()],
      promotions: [promotion({ validFrom: '2026-02-01', validUntil: '2026-02-07' })],
      onDate: '2026-03-02',
    });
    expect(expired.offers[0]!.promotion).toBeUndefined();
  });

  it('ignores products from another chain entirely', () => {
    const { offers, issues } = resolveOffersForLocation(location, {
      products: [{ ...product, chainId: 'lidl' }],
      prices: [price()],
      promotions: [],
      onDate: '2026-03-02',
    });
    expect(offers).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it('groups offers by canonical ingredient', () => {
    const second: Product = { ...product, id: 'p2', canonicalIngredientId: 'rijst' };
    const { offers } = resolveOffersForLocation(location, {
      products: [product, second],
      prices: [price(), price({ id: 'price-2', productId: 'p2' })],
      promotions: [],
      onDate: '2026-03-02',
    });
    const grouped = groupOffersByIngredient(offers);
    expect([...grouped.keys()].sort()).toEqual(['kipfilet', 'rijst']);
  });
});
