import { describe, expect, it } from 'vitest';
import { cents, quantity, type Cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';
import { applyPromotions } from '@/services/promotions/apply-promotions';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import {
  dedupe,
  fileSnapshotProvider,
  PromotionStore,
} from '@/services/promotions/snapshot-provider';
import type { ExternalPromotion, PromotionProvider } from '@/services/promotions/types';

const offer = (productId: string, name: string, amount = 300, priceCents = 349): ProductOffer => ({
  productId,
  chainId: 'jumbo',
  locationId: 'jumbo-shadow',
  ingredientId: 'gehakt-half',
  name,
  brandName: 'Jumbo',
  isPrivateLabel: true,
  packageAmount: quantity(amount, 'g'),
  normalUnitPriceCents: cents(priceCents) as Cents,
  unitPriceCents: cents(priceCents) as Cents,
  pricePerBaseUnitCents: priceCents / amount,
  nutritionOrigin: 'ingredient',
});

const external = (over: Partial<ExternalPromotion> = {}): ExternalPromotion => ({
  externalPromotionId: 'p1',
  source: 'TestBron',
  chainId: 'jumbo',
  productName: 'Jumbo Rundergehakt',
  packageText: '300 g',
  promotionText: '1 + 1 gratis',
  validFrom: '2026-09-14',
  validUntil: '2026-09-20',
  fetchedAt: '2026-09-14T06:00:00.000Z',
  ...over,
});

const linkedFor = (promotions: readonly ExternalPromotion[], offers: readonly ProductOffer[]) =>
  linkPromotions({
    chainId: 'jumbo',
    candidates: promotions.map(toCandidate),
    offers,
    retailerIdByProduct: new Map(),
  }).linked;

/**
 * Which day decides, and why it is not today.
 *
 * A week planner made on Sunday for shopping on Saturday must price Saturday's
 * shelf. Getting this wrong in either direction is a real mistake: crediting an
 * expired offer inflates the saving, and refusing one that starts on the
 * shopping day throws it away.
 */
describe('a promotion belongs to the shopping date, not to today', () => {
  const offers = [offer('jumbo:a', 'Jumbo Rundergehakt')];

  it('applies an offer that is live on the shopping date', () => {
    const result = applyPromotions(offers, linkedFor([external()], offers), {
      shoppingDate: '2026-09-16',
    });
    expect(result.applied).toBe(1);
    expect(result.offers[0]!.promotion?.label).toBe('1 + 1 gratis');
  });

  it('does not use an offer that expires before the shopping day', () => {
    // Made on Sunday the 13th, shopping on Saturday the 19th, offer ends
    // Monday the 14th. The till will not honour it.
    const promotion = external({ validFrom: '2026-09-08', validUntil: '2026-09-14' });
    const result = applyPromotions(offers, linkedFor([promotion], offers), {
      shoppingDate: '2026-09-19',
    });
    expect(result.applied).toBe(0);
    expect(result.outOfWindow).toBe(1);
    expect(result.offers[0]!.promotion).toBeUndefined();
  });

  it('uses an offer that only starts on the shopping day', () => {
    // The reason upcoming promotions are worth fetching at all.
    const promotion = external({ validFrom: '2026-09-21', validUntil: '2026-09-27' });
    const planningDay = applyPromotions(offers, linkedFor([promotion], offers), {
      shoppingDate: '2026-09-20',
    });
    const shoppingDay = applyPromotions(offers, linkedFor([promotion], offers), {
      shoppingDate: '2026-09-21',
    });
    expect(planningDay.applied).toBe(0);
    expect(shoppingDay.applied).toBe(1);
  });

  it('treats both ends of the window as inclusive', () => {
    const promotion = external({ validFrom: '2026-09-14', validUntil: '2026-09-20' });
    for (const date of ['2026-09-14', '2026-09-20']) {
      expect(
        applyPromotions(offers, linkedFor([promotion], offers), { shoppingDate: date }).applied,
      ).toBe(1);
    }
    for (const date of ['2026-09-13', '2026-09-21']) {
      expect(
        applyPromotions(offers, linkedFor([promotion], offers), { shoppingDate: date }).applied,
      ).toBe(0);
    }
  });

  it('leaves the regular price untouched', () => {
    const result = applyPromotions(offers, linkedFor([external()], offers), {
      shoppingDate: '2026-09-16',
    });
    // A promotion sits beside the shelf price; it never overwrites it.
    expect(result.offers[0]!.unitPriceCents).toBe(349);
    expect(result.offers[0]!.normalUnitPriceCents).toBe(349);
  });
});

describe('two promotions on one product', () => {
  const offers = [offer('jumbo:a', 'Jumbo Rundergehakt')];
  const both = [
    external({ externalPromotionId: 'week', validFrom: '2026-09-14', validUntil: '2026-09-20' }),
    external({
      externalPromotionId: 'weekend',
      promotionText: '2 voor € 5',
      validFrom: '2026-09-19',
      validUntil: '2026-09-20',
    }),
  ];

  it('picks the narrower window and says so', () => {
    const result = applyPromotions(offers, linkedFor(both, offers), {
      shoppingDate: '2026-09-19',
    });
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]!.rule).toBe('SHORTEST_WINDOW');
    expect(result.overlaps[0]!.chosen).toBe('TestBron:weekend');
    expect(result.offers[0]!.promotion?.id).toBe('TestBron:weekend');
  });

  it('never stacks them', () => {
    const result = applyPromotions(offers, linkedFor(both, offers), {
      shoppingDate: '2026-09-19',
    });
    // One promotion on the offer, whatever the feed listed.
    expect(result.applied).toBe(1);
    expect(result.overlaps[0]!.rejected).toEqual(['TestBron:week']);
  });

  it('can be told to skip an overlap entirely', () => {
    const result = applyPromotions(offers, linkedFor(both, offers), {
      shoppingDate: '2026-09-19',
      onOverlap: 'SKIP',
    });
    expect(result.applied).toBe(0);
    expect(result.overlaps).toHaveLength(1);
  });

  it('is deterministic when the windows are identical', () => {
    const twins = [
      external({ externalPromotionId: 'b', promotionText: '2 voor € 5' }),
      external({ externalPromotionId: 'a' }),
    ];
    const first = applyPromotions(offers, linkedFor(twins, offers), {
      shoppingDate: '2026-09-16',
    });
    const second = applyPromotions(offers, linkedFor([...twins].reverse(), offers), {
      shoppingDate: '2026-09-16',
    });
    expect(first.overlaps[0]!.rule).toBe('FIRST_BY_ID');
    expect(first.overlaps[0]!.chosen).toBe(second.overlaps[0]!.chosen);
  });
});

describe('fetching, caching and staying up when the source is not', () => {
  const clock = (iso: string) => () => new Date(iso);
  const working = (promotions: readonly ExternalPromotion[]): PromotionProvider => ({
    name: 'TestBron',
    fetchPromotions: async () => promotions,
  });
  const broken = (message: string): PromotionProvider => ({
    name: 'TestBron',
    fetchPromotions: async () => {
      throw new Error(message);
    },
  });

  it('fetches once and then serves the cache', async () => {
    let calls = 0;
    const provider: PromotionProvider = {
      name: 'TestBron',
      fetchPromotions: async () => {
        calls += 1;
        return [external()];
      },
    };
    const store = new PromotionStore(provider, {
      ttlMinutes: 60,
      now: clock('2026-09-14T08:00:00.000Z'),
    });
    expect((await store.refresh(['jumbo'])).status).toBe('FETCHED');
    expect((await store.refresh(['jumbo'])).status).toBe('CACHED');
    expect(calls).toBe(1);
  });

  it('refetches once the snapshot goes stale', async () => {
    let at = new Date('2026-09-14T08:00:00.000Z');
    const store = new PromotionStore(working([external()]), {
      ttlMinutes: 60,
      now: () => at,
    });
    await store.refresh(['jumbo']);
    at = new Date('2026-09-14T09:30:00.000Z');
    const outcome = await store.refresh(['jumbo']);
    expect(outcome.status).toBe('FETCHED');
  });

  it.each([
    ['offline', 'fetch failed'],
    ['timeout', 'ETIMEDOUT'],
    ['rate limit', 'HTTP 429 Too Many Requests'],
    ['malformed', 'Unexpected token < in JSON'],
  ])('keeps serving the last snapshot when the source fails: %s', async (_label, message) => {
    let at = new Date('2026-09-14T08:00:00.000Z');
    let provider = working([external()]);
    const store = new PromotionStore(
      { name: 'TestBron', fetchPromotions: (ids) => provider.fetchPromotions(ids) },
      { ttlMinutes: 60, now: () => at },
    );
    await store.refresh(['jumbo']);

    provider = broken(message);
    at = new Date('2026-09-14T10:00:00.000Z');
    const outcome = await store.refresh(['jumbo']);

    expect(outcome.status).toBe('STALE');
    if (outcome.status === 'STALE') {
      expect(outcome.error).toContain(message.split(' ')[0]!);
      expect(outcome.snapshot.promotions).toHaveLength(1);
    }
  });

  it('reports unavailable rather than pretending, when there is nothing at all', async () => {
    const store = new PromotionStore(broken('fetch failed'), {
      now: clock('2026-09-14T08:00:00.000Z'),
    });
    const outcome = await store.refresh(['jumbo']);
    expect(outcome.status).toBe('UNAVAILABLE');
    expect(store.snapshot()).toBeUndefined();
  });

  it('keeps the previous observation instead of overwriting it', async () => {
    let at = new Date('2026-09-14T08:00:00.000Z');
    let promotions = [external({ promotionalPriceCents: 349 })];
    const store = new PromotionStore(
      { name: 'TestBron', fetchPromotions: async () => promotions },
      { ttlMinutes: 60, now: () => at },
    );
    await store.refresh(['jumbo']);
    at = new Date('2026-09-21T08:00:00.000Z');
    promotions = [external({ promotionalPriceCents: 299 })];
    await store.refresh(['jumbo']);

    expect(store.history()).toHaveLength(1);
    expect(store.history()[0]!.promotions[0]!.promotionalPriceCents).toBe(349);
    expect(store.snapshot()!.promotions[0]!.promotionalPriceCents).toBe(299);
  });

  it('collapses a promotion the feed listed twice', () => {
    const twice = [external(), external()];
    expect(dedupe(twice)).toHaveLength(1);
  });

  it('reads a saved response from disk without any network', async () => {
    const saved = JSON.stringify([
      external(),
      external({ chainId: 'ah', externalPromotionId: 'q' }),
    ]);
    const provider = fileSnapshotProvider(
      'Opgeslagen',
      () => saved,
      (raw) => raw as ExternalPromotion[],
    );
    const promotions = await provider.fetchPromotions(['jumbo']);
    expect(promotions).toHaveLength(1);
    expect(promotions[0]!.chainId).toBe('jumbo');
  });
});
