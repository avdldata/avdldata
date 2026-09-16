import { cents, type BaseUnit, type Cents, ZERO_CENTS } from '../units';
import {
  belowReferenceSavings,
  priceForUnits,
  promotionApplies,
  promotionSavings,
} from '../pricing/promotions';
import type { ProductOffer } from '../stores/types';
import type { IngredientId } from '../ingredients/types';
import {
  DEFAULT_PACKAGING_CONFIG,
  type PackagingConfig,
  type PackagingLine,
  type PackagingResult,
} from './types';

/**
 * Package optimisation for ONE canonical ingredient at ONE store.
 *
 * Given "we need 1.180 g of chicken this week" and the packs that store sells
 * (400 g for €4,00 and 600 g for €5,50, one of them on 1+1), choose the
 * multiset of packs that covers the requirement for the lowest checkout price.
 *
 * This deliberately is not "cheapest price per kilo × required weight":
 *   - you cannot buy 0,3 of a pack;
 *   - promotions make cost non-linear in the number of packs, so buying MORE
 *     than you need is sometimes strictly cheaper;
 *   - the cheapest-per-kilo pack is often the wrong answer once you round up.
 *
 * What "cheapest" means is set by `ProductSelectionWeights`: the objective is
 * the checkout price plus a configurable cost for the leftover it creates. With
 * the default weights price dominates, but a household that hates waste — or a
 * future setting that values nutrition — changes the answer without changing
 * this code.
 *
 * Algorithm: depth-first search over the pack variants (sorted cheapest per
 * base unit first), with an admissible lower bound for pruning and a node
 * budget as a guard. In practice a store sells 2–5 variants of an ingredient,
 * so the search finishes in microseconds; the bound keeps a pathological
 * catalogue from ever exploding. Complexity is documented in OPTIMIZER.md.
 */
export function optimisePackaging(
  ingredientId: IngredientId,
  requiredAmount: number,
  offers: readonly ProductOffer[],
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG,
  /**
   * The unit `requiredAmount` is expressed in.
   *
   * Optional only so that the many callers who already guarantee the match do
   * not have to be rewritten; pass it and the solver will refuse to price a
   * pack measured in something else. Without it, a requirement of 186 grams met
   * by a pack of "1 stuk" is silently read as 186 pieces — a shopping list that
   * looks entirely normal apart from costing €146,94 for peppers. The ingestion
   * layer converts packs into the ingredient's unit so this never fires in
   * practice; it is here so that a future source cannot make it fire quietly.
   */
  requiredUnit?: BaseUnit,
): PackagingResult {
  // A non-finite requirement used to reach the cost table and surface as
  // `RangeError: Invalid array length` from `new Array(NaN + 1)` — a message
  // that says nothing about the household field that produced the NaN. The
  // refusal is named instead, so the caller can point at the actual cause.
  if (!Number.isFinite(requiredAmount)) {
    return { status: 'UNAVAILABLE', ingredientId, reason: 'REQUIREMENT_NOT_FINITE' };
  }

  const relevant = offers.filter((o) => o.ingredientId === ingredientId);
  if (relevant.length === 0) {
    return { status: 'UNAVAILABLE', ingredientId, reason: 'NO_PRODUCTS' };
  }

  const unit = requiredUnit ?? relevant[0]!.packageAmount.unit;
  const variants = [...relevant]
    .filter((o) => o.packageAmount.unit === unit && o.packageAmount.amount > 0)
    .sort(
      (a, b) =>
        a.pricePerBaseUnitCents - b.pricePerBaseUnitCents || a.productId.localeCompare(b.productId),
    )
    .slice(0, config.maxVariants);

  if (variants.length === 0) {
    return { status: 'UNAVAILABLE', ingredientId, reason: 'NO_MATCHING_UNIT' };
  }

  if (requiredAmount <= 0) {
    return {
      status: 'OK',
      solution: {
        ingredientId,
        unit,
        requiredAmount: 0,
        purchasedAmount: 0,
        leftoverAmount: 0,
        totalCents: ZERO_CENTS,
        lines: [],
        objectiveCents: 0,
      },
    };
  }

  const maxUnits = variants.map((variant) =>
    Math.min(
      config.maxUnitsPerVariant,
      Math.max(
        Math.ceil(requiredAmount / variant.packageAmount.amount) + config.promotionSlackUnits,
        // A "vanaf 4 stuks" deal is invisible if we only ever price the packs we
        // strictly need. Reach far enough to see the first full bundle.
        promotionReach(variant),
      ),
    ),
  );

  // Precomputed cost tables: cost[i][n] is what n packs of variant i cost.
  const costTable = variants.map((variant, i) => {
    const row: number[] = new Array(maxUnits[i]! + 1);
    for (let n = 0; n <= maxUnits[i]!; n += 1) row[n] = priceForUnits(variant, n);
    return row;
  });

  // Cost is NOT monotone in the number of packs: "vanaf 3 stuks €0,80" makes
  // three packs cheaper than two. Pruning on the cost of exactly n packs would
  // therefore cut away the quantity that wins. suffixMin[i][n] is the cheapest
  // any quantity >= n can be, which is a sound floor to prune against.
  const suffixMinCost = costTable.map((row) => {
    const suffix: number[] = new Array(row.length);
    let best = Number.POSITIVE_INFINITY;
    for (let n = row.length - 1; n >= 0; n -= 1) {
      best = Math.min(best, row[n]!);
      suffix[n] = best;
    }
    return suffix;
  });

  // Admissible lower bound: the cheapest achievable cost per base unit across
  // all variants and all quantities (promotions included).
  let bestRate = Number.POSITIVE_INFINITY;
  variants.forEach((variant, i) => {
    for (let n = 1; n <= maxUnits[i]!; n += 1) {
      const rate = costTable[i]![n]! / (n * variant.packageAmount.amount);
      if (rate < bestRate) bestRate = rate;
    }
  });

  const weights = config.selection;

  /**
   * What a candidate really costs us: money paid, plus what the leftover is
   * worth throwing away. Pieces and millilitres are treated as grams here —
   * a rough equivalence, but consistent, and only ever used to break ties
   * between combinations of the same ingredient.
   */
  const objectiveOf = (spent: number, purchased: number): number =>
    weights.price * spent +
    (weights.wastePerKiloCents * Math.max(0, purchased - requiredAmount)) / 1000;

  let bestObjective = Number.POSITIVE_INFINITY;
  let bestCounts: number[] | undefined;
  let bestPurchased = 0;
  const counts = new Array<number>(variants.length).fill(0);
  let nodes = 0;
  let exhausted = false;

  const search = (index: number, purchased: number, spent: number): void => {
    nodes += 1;
    if (nodes > config.maxSearchNodes) {
      exhausted = true;
      return;
    }

    if (purchased >= requiredAmount) {
      const objective = objectiveOf(spent, purchased);
      // Prefer the better objective; on a tie prefer less leftover, then a
      // stable order so the same catalogue always yields the same basket.
      if (objective < bestObjective || (objective === bestObjective && purchased < bestPurchased)) {
        bestObjective = objective;
        bestPurchased = purchased;
        bestCounts = [...counts];
      }
      return;
    }

    if (index >= variants.length) return;

    // Lower bound: even buying the rest at the best rate seen, with no waste,
    // this branch cannot beat the incumbent.
    const remaining = requiredAmount - purchased;
    if (weights.price * (spent + remaining * bestRate) >= bestObjective) return;

    const variant = variants[index]!;
    const packSize = variant.packageAmount.amount;
    const needed = Math.ceil(remaining / packSize);
    const limit = Math.min(
      maxUnits[index]!,
      Math.max(needed + config.promotionSlackUnits, promotionReach(variant)),
    );

    for (let n = 0; n <= limit; n += 1) {
      // Stop only when no quantity at or above n can still beat the incumbent.
      if (weights.price * (spent + suffixMinCost[index]![n]!) >= bestObjective) break;
      counts[index] = n;
      search(index + 1, purchased + n * packSize, spent + costTable[index]![n]!);
      if (exhausted) break;
    }
    counts[index] = 0;
  };

  search(0, 0, 0);

  if (!bestCounts) {
    // Reached when the node budget ran out before any covering combination was
    // found. Fall back to the simple honest answer: buy enough packs of a
    // single variant, whichever variant works out cheapest that way.
    const fallback = buildFallback(variants, config.maxUnitsPerVariant, requiredAmount);
    if (!fallback) {
      return { status: 'UNAVAILABLE', ingredientId, reason: 'NO_VALID_COMBINATION' };
    }
    bestCounts = fallback.counts;
    bestPurchased = fallback.purchased;
    bestObjective = objectiveOf(fallback.cost, fallback.purchased);
  }

  const lines: PackagingLine[] = [];
  let total = 0;
  bestCounts.forEach((units, i) => {
    if (units === 0) return;
    const offer = variants[i]!;
    const lineTotal = priceForUnits(offer, units);
    total += lineTotal;
    const amount = units * offer.packageAmount.amount;
    lines.push({
      offer,
      units,
      lineTotalCents: lineTotal,
      promotionApplied: promotionApplies(offer, units),
      savingsCents: belowReferenceSavings(offer, units),
      promotionSavingsCents: promotionSavings(offer, units),
      ...(offer.nutritionPer100
        ? { kcalContribution: Math.round((offer.nutritionPer100.kcal * amount) / 100) }
        : {}),
    });
  });

  const purchasedAmount = bestCounts.reduce(
    (sum, units, i) => sum + units * variants[i]!.packageAmount.amount,
    0,
  );

  return {
    status: 'OK',
    solution: {
      ingredientId,
      unit,
      requiredAmount,
      purchasedAmount,
      leftoverAmount: Math.max(0, purchasedAmount - requiredAmount),
      totalCents: cents(total) as Cents,
      lines,
      objectiveCents: Number.isFinite(bestObjective)
        ? Math.round(bestObjective)
        : Math.round(objectiveOf(total, purchasedAmount)),
    },
  };
}

/**
 * The smallest number of packs at which this offer's promotion is fully in
 * play: its minimum quantity, rounded up to a whole bundle for an "N voor €X".
 * Zero when there is no promotion.
 *
 * Without this the search would never price a "vanaf 4 stuks" deal for a week
 * that happens to need only one pack — and that deal can genuinely be cheaper.
 */
function promotionReach(offer: ProductOffer): number {
  const promotion = offer.promotion;
  if (!promotion) return 0;
  const bundleSize = promotion.params.type === 'N_FOR_X' ? promotion.params.bundleSize : 1;
  const units = Math.max(promotion.minUnits, bundleSize);
  return bundleSize > 1 ? Math.ceil(units / bundleSize) * bundleSize : units;
}

function buildFallback(
  variants: readonly ProductOffer[],
  hardCeiling: number,
  requiredAmount: number,
): { counts: number[]; purchased: number; cost: number } | undefined {
  let best: { counts: number[]; purchased: number; cost: number } | undefined;
  variants.forEach((variant, i) => {
    const needed = Math.ceil(requiredAmount / variant.packageAmount.amount);
    if (needed > hardCeiling) return;
    const counts = new Array<number>(variants.length).fill(0);
    counts[i] = needed;
    const cost = priceForUnits(variant, needed);
    if (!best || cost < best.cost) {
      best = { counts, purchased: needed * variant.packageAmount.amount, cost };
    }
  });
  return best ? { counts: best.counts, purchased: best.purchased, cost: best.cost } : undefined;
}
