import { describe, expect, it } from 'vitest';
import { weekLowerBound } from '@/domain/optimization/lower-bound';
import { evaluateWeek } from '@/domain/optimization/evaluate-week';
import { prepareOptimization } from '@/domain/optimization/prepare';
import { combinations } from '@/domain/optimization/reference-solver';
import { priceForUnits } from '@/domain/pricing/promotions';
import { benchmarkSeeds } from '../../support/benchmark';
import { buildScenario } from '../../support/scenario';

/**
 * A bound that is wrong even once is worse than no bound at all: the search
 * would skip a week it should have priced and nobody would ever find out, since
 * the result still looks like a perfectly good plan.
 *
 * So this is checked exhaustively rather than by example — every legal week in
 * a few dozen generated worlds, against the real objective.
 */
describe('the lower bound never over-estimates', () => {
  it('stays at or below the true score for every week in every world', () => {
    let checked = 0;
    const violations: string[] = [];

    for (const seed of benchmarkSeeds(25)) {
      const scenario = buildScenario(seed);
      const prepared = prepareOptimization(scenario.input);
      if (prepared.status !== 'OK') continue;

      for (const week of combinations(prepared.candidates, prepared.config.days)) {
        const priced = evaluateWeek({
          recipes: week,
          portionsByRecipe: prepared.portionsByRecipe,
          household: scenario.input.household,
          memberNutrition: prepared.memberNutrition,
          ingredients: scenario.input.ingredients,
          stores: prepared.stores,
          matrixHome: prepared.home,
          maxStores: prepared.maxStores,
          extraStorePenalty: prepared.extraStorePenalty,
          budget: scenario.input.budget,
          startDate: scenario.input.startDate,
          config: prepared.config,
          excluded: prepared.excluded,
          explain: false,
        });
        if (!priced) continue;

        const bound = weekLowerBound({
          recipes: week,
          portionsByRecipe: prepared.portionsByRecipe,
          household: scenario.input.household,
          memberNutrition: prepared.memberNutrition,
          ingredients: scenario.input.ingredients,
          stores: prepared.stores,
          config: prepared.config,
        });

        checked += 1;
        const actual = priced.plan.score.totalPenaltyCents;
        if (bound > actual) {
          violations.push(
            `seed ${seed}: bound ${bound} exceeds ${actual} for ${week.map((r) => r.id).join(',')}`,
          );
        }
      }
    }

    // Twenty-five worlds is a few thousand complete weeks — enough that a bound
    // which is wrong on any realistic shape of problem shows up here.
    expect(checked).toBeGreaterThan(3_000);
    expect(violations.slice(0, 5)).toEqual([]);
  }, 600_000);

  it('is tight enough to be worth computing', () => {
    // A bound of zero is unimpeachable and useless. This is not a correctness
    // requirement — it is a guard against the bound quietly degrading into one.
    const scenario = buildScenario(benchmarkSeeds(1)[0]!);
    const prepared = prepareOptimization(scenario.input);
    if (prepared.status !== 'OK') throw new Error('scenario did not prepare');

    const week = prepared.candidates.slice(0, prepared.config.days);
    const priced = evaluateWeek({
      recipes: week,
      portionsByRecipe: prepared.portionsByRecipe,
      household: scenario.input.household,
      memberNutrition: prepared.memberNutrition,
      ingredients: scenario.input.ingredients,
      stores: prepared.stores,
      matrixHome: prepared.home,
      maxStores: prepared.maxStores,
      extraStorePenalty: prepared.extraStorePenalty,
      budget: scenario.input.budget,
      startDate: scenario.input.startDate,
      config: prepared.config,
      excluded: prepared.excluded,
      explain: false,
    })!;

    const bound = weekLowerBound({
      recipes: week,
      portionsByRecipe: prepared.portionsByRecipe,
      household: scenario.input.household,
      memberNutrition: prepared.memberNutrition,
      ingredients: scenario.input.ingredients,
      stores: prepared.stores,
      config: prepared.config,
    });

    expect(bound).toBeGreaterThan(priced.plan.score.totalPenaltyCents * 0.5);
  });
});

/**
 * Buying more can genuinely cost less, and the bound is built around that.
 *
 * A three-for-€2,60 bundle makes three packs cheaper than two — not a rounding
 * artefact but how the offer works, and `optimisePackaging` is right to take
 * it. This is pinned because it quietly invalidates the most natural way to
 * bound a grocery bill: "amount × the best price per gram anywhere" assumes
 * cost rises with quantity, and would sit *above* the real price whenever a
 * bundle like this applies — silently pruning the optimum.
 *
 * The bound therefore prices each ingredient through the same packaging solver
 * the evaluation uses, and relaxes only the limit on how many shops may be
 * visited. If this test ever goes quiet, that reasoning is worth revisiting.
 */
describe('the pricing this bound has to survive', () => {
  it('contains offers where an extra pack lowers the bill', () => {
    const cheaperWhenBuyingMore: string[] = [];

    for (const seed of benchmarkSeeds(20)) {
      const scenario = buildScenario(seed);
      for (const store of scenario.input.stores) {
        for (const offer of store.offers) {
          for (let units = 1; units < 24; units += 1) {
            if (priceForUnits(offer, units + 1) < priceForUnits(offer, units)) {
              cheaperWhenBuyingMore.push(`${offer.productId} at ${units}`);
            }
          }
        }
      }
    }

    expect(cheaperWhenBuyingMore.length).toBeGreaterThan(0);
  }, 120_000);

  it('never charges less than nothing, whatever the promotion', () => {
    for (const seed of benchmarkSeeds(20)) {
      const scenario = buildScenario(seed);
      for (const store of scenario.input.stores) {
        for (const offer of store.offers) {
          for (let units = 0; units < 24; units += 1) {
            expect(priceForUnits(offer, units)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  }, 120_000);
});
