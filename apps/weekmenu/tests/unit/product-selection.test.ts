import { describe, expect, it } from 'vitest';
import { optimisePackaging } from '@/domain/packaging/optimise';
import {
  DEFAULT_PACKAGING_CONFIG,
  DEFAULT_PRODUCT_SELECTION_WEIGHTS,
} from '@/domain/packaging/types';
import { makeOffer, makePromotion, onePlusOne } from '../support/builders';

/**
 * One canonical ingredient, several concrete products. This is the step the new
 * data model exists for: the recipe asked for "chicken breast", and only here
 * does that become a specific pack of a specific brand at a specific shop.
 */
describe('choosing between products for one ingredient', () => {
  const offers = [
    makeOffer({
      ingredientId: 'kipfilet',
      productId: 'ah-600',
      packAmount: 600,
      priceCents: 649,
      brandName: 'AH',
    }),
    makeOffer({
      ingredientId: 'kipfilet',
      productId: 'jumbo-300',
      packAmount: 300,
      priceCents: 310,
      brandName: 'Jumbo',
    }),
    makeOffer({
      ingredientId: 'kipfilet',
      productId: 'lidl-750',
      packAmount: 750,
      priceCents: 549,
      brandName: 'Lidl',
    }),
  ];

  it('finds every product that can satisfy the ingredient', () => {
    const candidates = offers.filter((offer) => offer.ingredientId === 'kipfilet');
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((o) => o.brandName)).size).toBe(3);
  });

  it('ignores products for a different ingredient', () => {
    const withOther = [
      ...offers,
      makeOffer({ ingredientId: 'rijst', productId: 'rijst-1', packAmount: 1000, priceCents: 199 }),
    ];
    const result = optimisePackaging('kipfilet', 570, withOther);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines.every((line) => line.offer.ingredientId === 'kipfilet')).toBe(
      true,
    );
  });

  it('picks the combination with the best objective, not the smallest leftover', () => {
    // 570 g needed. AH 1x600 = 649 (30 g over), Jumbo 2x300 = 620 (30 g over),
    // Lidl 1x750 = 549 (180 g over). Lidl wins on price despite the leftover.
    const result = optimisePackaging('kipfilet', 570, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.offer.productId).toBe('lidl-750');
    expect(result.solution.totalCents).toBe(549);
    expect(result.solution.leftoverAmount).toBe(180);
  });

  it('switches to the tighter pack once waste is valued highly enough', () => {
    // At €12 per kilo of waste, Lidl's 180 g leftover costs 216 cents on top of
    // its 549, which is worse than Jumbo's 620 with only 30 g over.
    const wasteAverse = {
      ...DEFAULT_PACKAGING_CONFIG,
      selection: { ...DEFAULT_PRODUCT_SELECTION_WEIGHTS, wastePerKiloCents: 1200 },
    };
    const result = optimisePackaging('kipfilet', 570, offers, wasteAverse);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.offer.productId).toBe('jumbo-300');
    expect(result.solution.lines[0]!.units).toBe(2);
  });

  it('reports the weighted objective alongside the plain price', () => {
    const result = optimisePackaging('kipfilet', 570, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    // 549 paid + 180 g leftover at the default 150 cents per kilo.
    expect(result.solution.objectiveCents).toBe(549 + Math.round((150 * 180) / 1000));
  });

  it('records what each line contributes nutritionally when the data is there', () => {
    const withNutrition = [
      makeOffer({
        ingredientId: 'kipfilet',
        productId: 'met-label',
        packAmount: 600,
        priceCents: 500,
        nutritionPer100: {
          kcal: 106,
          protein: 22.5,
          carbohydrates: 0,
          sugars: 0,
          fat: 1.8,
          saturatedFat: 0.5,
          fiber: 0,
          salt: 0.15,
        },
      }),
    ];
    const result = optimisePackaging('kipfilet', 570, withNutrition);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.kcalContribution).toBe(Math.round((106 * 600) / 100));
  });

  it('still lets a promotion beat a tighter pack', () => {
    const promoted = [
      makeOffer({ ingredientId: 'kipfilet', productId: 'tight', packAmount: 600, priceCents: 649 }),
      makeOffer({
        ingredientId: 'kipfilet',
        productId: 'promo',
        packAmount: 500,
        priceCents: 549,
        promotion: makePromotion(onePlusOne(), { minUnits: 2 }),
      }),
    ];
    // Two promo packs: 1000 g for 549, versus one tight pack at 649.
    const result = optimisePackaging('kipfilet', 570, promoted);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.offer.productId).toBe('promo');
    expect(result.solution.totalCents).toBe(549);
  });
});
