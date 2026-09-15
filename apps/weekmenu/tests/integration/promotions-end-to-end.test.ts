import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { applyPromotions } from '@/services/promotions/apply-promotions';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import { PromotionStore } from '@/services/promotions/snapshot-provider';
import { attributionsFor } from '@/services/promotions/attribution';
import type { PromotionProvider } from '@/services/promotions/types';
import { loadRealChains, snapshotAvailable } from '../support/real-data-store';
import { weekScenarios } from '../support/week-scenarios';
import { EVEN_MIX, modelPromotions } from '../support/modelled-promotions';

/**
 * Promotions through the whole pipeline, on the real catalogue.
 *
 * The promotions here are modelled, not measured — the source is unreachable
 * from this environment (see PRIJSPROFEET_INTEGRATION.md). That does not weaken
 * these tests: what they check is that the *pipeline* behaves, and a modelled
 * promotion exercises linking, validity, pricing and packaging exactly as a
 * real one would. What it cannot tell us is how much money real promotions
 * save, and no test here claims to.
 */
const describeReal = snapshotAvailable() ? describe : describe.skip;

describeReal('promotions on the real two-chain catalogue', () => {
  const fixture = loadRealChains(['ah', 'jumbo']);
  const scenario = weekScenarios(1)[0]!;

  const retailerIdByProduct = new Map<string, string>();
  for (const chain of fixture.chains) {
    for (const offer of chain.reducedOffers) {
      const id = extractRetailerProductId(
        chain.chainId,
        offer.productId.slice(chain.chainId.length + 1),
      );
      if (id) retailerIdByProduct.set(offer.productId, id.id);
    }
  }

  const promotionsFor = (chainId: 'ah' | 'jumbo', rate = 0.2) => {
    const chain = fixture.chains.find((c) => c.chainId === chainId)!;
    return modelPromotions(chain.reducedOffers, {
      rate,
      mix: EVEN_MIX,
      seed: chainId === 'ah' ? 11 : 22,
      // The window has to contain the scenario's shopping date, or every test
      // below would be measuring the validity filter instead of the pipeline.
      validFrom: scenario.startDate,
      validUntil: '2026-12-31',
    });
  };

  const linkFor = (chainId: 'ah' | 'jumbo', rate = 0.2) => {
    const chain = fixture.chains.find((c) => c.chainId === chainId)!;
    return linkPromotions({
      chainId,
      candidates: promotionsFor(chainId, rate).map(toCandidate),
      offers: chain.reducedOffers,
      retailerIdByProduct,
    });
  };

  it('links a promotion feed to real products through the retailer id', () => {
    const result = linkFor('jumbo');
    expect(result.metrics.fetched).toBeGreaterThan(20);
    // The article number is in the Checkjebon slug on both sides, so tier 1
    // should carry essentially everything. If a future format change breaks the
    // slug parser, this is where it shows up.
    expect(result.metrics.byTier.EXACT_RETAILER_ID).toBe(result.metrics.fetched);
    expect(result.metrics.byTier.NEEDS_REVIEW).toBe(0);
  });

  it('never links a promotion to a product from the other chain', () => {
    for (const chainId of ['ah', 'jumbo'] as const) {
      for (const entry of linkFor(chainId).linked) {
        expect(entry.offer.chainId).toBe(chainId);
      }
    }
  });

  it(
    'plans a cheaper week with promotions than without, on the same catalogue',
    { timeout: 60_000 },
    () => {
      const chain = fixture.chains.find((c) => c.chainId === 'ah')!;
      const withPromotions = applyPromotions(chain.reducedOffers, linkFor('ah').linked, {
        shoppingDate: scenario.startDate,
      });
      expect(withPromotions.applied).toBeGreaterThan(0);

      const plan = (offers: typeof chain.reducedOffers) =>
        optimiseWeek({
          household: scenario.household,
          recipes: scenario.recipes(fixture.recipes),
          ingredients: fixture.ingredientIndex,
          stores: [{ ...chain.store, offers }],
          maxStores: 1,
          conveniencePreference: scenario.conveniencePreference,
          budget: {},
          startDate: scenario.startDate,
          today: scenario.today,
        });

      const off = plan(chain.reducedOffers);
      const on = plan(withPromotions.offers);
      expect(off.status).toBe('OK');
      expect(on.status).toBe('OK');
      if (off.status !== 'OK' || on.status !== 'OK') return;

      // A promotion can never make the week dearer: the engine takes the cheaper
      // of shelf and promotional price at every quantity.
      expect(on.plan.recommendedOption.groceryCents).toBeLessThanOrEqual(
        off.plan.recommendedOption.groceryCents,
      );
    },
  );

  it('leaves the week unchanged when every promotion is out of window', () => {
    const chain = fixture.chains.find((c) => c.chainId === 'ah')!;
    const resolved = applyPromotions(chain.reducedOffers, linkFor('ah').linked, {
      // The folder starts on the scenario's date; shopping happens before it.
      shoppingDate: '2026-01-05',
    });
    expect(resolved.applied).toBe(0);
    expect(resolved.outOfWindow).toBeGreaterThan(0);
    for (const offer of resolved.offers) expect(offer.promotion).toBeUndefined();
  });

  it('plans a full week when the promotion source is down', async () => {
    const broken: PromotionProvider = {
      name: 'PrijsProfeet',
      fetchPromotions: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    const store = new PromotionStore(broken, { now: () => new Date('2026-09-14T08:00:00Z') });
    const outcome = await store.refresh(['ah', 'jumbo']);
    expect(outcome.status).toBe('UNAVAILABLE');

    // The whole point: no promotions, but still a week.
    const result = optimiseWeek({
      household: scenario.household,
      recipes: scenario.recipes(fixture.recipes),
      ingredients: fixture.ingredientIndex,
      stores: fixture.stores,
      maxStores: 2,
      conveniencePreference: scenario.conveniencePreference,
      budget: {},
      startDate: scenario.startDate,
      today: scenario.today,
    });
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.plan.days).toHaveLength(7);
      expect(result.plan.recommendedOption.groceryCents).toBeGreaterThan(0);
    }
  });

  it('credits every source that contributed', () => {
    // Ook in de spelling die de momentopname zelf gebruikt: een credit die
    // wegvalt op een hoofdletterverschil is een licentieprobleem zonder symptoom.
    expect(attributionsFor(['PRIJSPROFEET']).map((a) => a.notice)).toContain(
      'Aanbiedingsdata: PrijsProfeet',
    );
    const notices = attributionsFor(['PrijsProfeet']).map((a) => a.notice);
    expect(notices).toContain('Prijs- en productdata: Checkjebon');
    expect(notices).toContain('Aanbiedingsdata: PrijsProfeet');
    // A plan with no promotions still credits where the prices came from.
    expect(attributionsFor([]).map((a) => a.notice)).toEqual(['Prijs- en productdata: Checkjebon']);
  });
});
