import { cents, type Cents, sumCents } from '../units';
import type { SupermarketChain, SupermarketLocation, ProductOffer } from '../stores/types';
import { optimisePackaging } from '../packaging/optimise';
import type { PackagingConfig, PackagingResult, PackagingSolution } from '../packaging/types';
import type { WeekIngredientRequirement } from '../aggregation/aggregate';
import { estimateTripCost, type TripCostConfig, type TripCostEstimate } from '../trip/trip-cost';
import type { GeoPoint } from '../trip/distance';

export interface StoreCandidate {
  readonly location: SupermarketLocation;
  readonly chain: SupermarketChain;
  readonly distanceKm: number;
  readonly offers: readonly ProductOffer[];
}

export interface IngredientAssignment {
  readonly ingredientId: string;
  readonly name: string;
  readonly category: WeekIngredientRequirement['category'];
  readonly locationId: string;
  readonly chainId: string;
  readonly packaging: PackagingSolution;
}

export interface UnavailableItem {
  readonly ingredientId: string;
  readonly name: string;
  readonly triedLocationIds: readonly string[];
}

export interface StoreCombination {
  /** Locations that actually get an item assigned, sorted for determinism. */
  readonly locationIds: readonly string[];
  readonly chainIds: readonly string[];
  readonly assignments: readonly IngredientAssignment[];
  readonly unavailable: readonly UnavailableItem[];
  readonly groceryCents: Cents;
  /** Only what promotions knock off the shelf price — never a mere price drop. */
  readonly promotionSavingsCents: Cents;
  /** What the basket is below its reference prices, promotions included. */
  readonly belowReferenceSavingsCents: Cents;
  readonly purchasedByIngredient: ReadonlyMap<string, number>;
  /**
   * Per shopping category, the chain that is genuinely cheapest for this week's
   * requirements — filled in by `enumerateStoreOptions`, which is the only place
   * that can see every candidate store. Empty when there is nothing to compare.
   */
  readonly categoryWinners: ReadonlyMap<string, string>;
}

export interface StoreOption extends StoreCombination {
  readonly trip: TripCostEstimate;
  readonly extraStorePenaltyCents: Cents;
  /** groceries + travel + the "extra store is a hassle" allowance. */
  readonly practicalTotalCents: Cents;
  /**
   * What the items this combination cannot supply are charged at when ranking.
   *
   * Kept apart from `practicalTotalCents` on purpose: that number is what the
   * week actually costs you and must stay comparable to the shop receipt. This
   * one only exists to rank options against each other.
   */
  readonly unavailablePenaltyCents: Cents;
  /**
   * The ranking key: practical total plus the unavailability charge.
   *
   * Without it a store that simply does not stock the salmon looks cheaper than
   * one that stocks everything, because the salmon is missing from its bill.
   */
  readonly comparableTotalCents: Cents;
}

export type PackagingMatrix = ReadonlyMap<string, ReadonlyMap<string, PackagingResult>>;

/**
 * Price every ingredient at every candidate store once.
 *
 * Store combinations are then evaluated by looking values up in this matrix
 * instead of re-running the packaging search, which is what keeps comparing
 * dozens of store combinations cheap.
 */
/**
 * Memo for `optimisePackaging`, keyed by ingredient, amount and shop.
 *
 * How many packs of rice you buy at the Lidl depends on how much rice the week
 * needs and on nothing else. The swap-one-dish refinement prices hundreds of
 * weeks that differ by a single dish, so six of the seven dishes ask for the
 * exact same amounts every time — and this is the most expensive step in
 * pricing a week. Caching it is a memo, not an approximation: the same key
 * always had the same answer.
 *
 * One cache per `optimiseWeek` call. It must not outlive the offers it was
 * built from, which is why it is passed in rather than kept in module scope.
 */
export type PackagingCache = Map<string, PackagingResult>;

export function buildPackagingMatrix(
  requirements: readonly WeekIngredientRequirement[],
  stores: readonly StoreCandidate[],
  config: PackagingConfig,
  cache?: PackagingCache,
): PackagingMatrix {
  const matrix = new Map<string, Map<string, PackagingResult>>();
  for (const requirement of requirements) {
    const row = new Map<string, PackagingResult>();
    for (const store of stores) {
      const key = `${requirement.ingredientId}|${requirement.totalAmount}|${store.location.id}`;
      let solved = cache?.get(key);
      if (!solved) {
        solved = optimisePackaging(
          requirement.ingredientId,
          requirement.totalAmount,
          store.offers,
          config,
        );
        cache?.set(key, solved);
      }
      row.set(store.location.id, solved);
    }
    matrix.set(requirement.ingredientId, row);
  }
  return matrix;
}

/**
 * Given a set of stores we are willing to visit, buy each ingredient wherever
 * it is cheapest within that set.
 *
 * Because V1 has no cross-ingredient promotions, the cheapest assignment for
 * one ingredient does not depend on the others — so this per-ingredient argmin
 * is genuinely optimal for the chosen set, not a heuristic.
 */
export function evaluateStoreCombination(
  requirements: readonly WeekIngredientRequirement[],
  storeSubset: readonly StoreCandidate[],
  matrix: PackagingMatrix,
): StoreCombination {
  const assignments: IngredientAssignment[] = [];
  const unavailable: UnavailableItem[] = [];
  const purchased = new Map<string, number>();
  const lineTotals: Cents[] = [];
  const promotionSavings: Cents[] = [];
  const referenceSavings: Cents[] = [];

  for (const requirement of requirements) {
    const row = matrix.get(requirement.ingredientId);
    let best: { store: StoreCandidate; solution: PackagingSolution } | undefined;

    for (const store of storeSubset) {
      const result = row?.get(store.location.id);
      if (!result || result.status !== 'OK') continue;
      if (
        !best ||
        result.solution.totalCents < best.solution.totalCents ||
        (result.solution.totalCents === best.solution.totalCents &&
          store.location.id.localeCompare(best.store.location.id) < 0)
      ) {
        best = { store, solution: result.solution };
      }
    }

    if (!best) {
      unavailable.push({
        ingredientId: requirement.ingredientId,
        name: requirement.name,
        triedLocationIds: storeSubset.map((s) => s.location.id),
      });
      continue;
    }

    assignments.push({
      ingredientId: requirement.ingredientId,
      name: requirement.name,
      category: requirement.category,
      locationId: best.store.location.id,
      chainId: best.store.chain.id,
      packaging: best.solution,
    });
    purchased.set(requirement.ingredientId, best.solution.purchasedAmount);
    lineTotals.push(best.solution.totalCents);
    promotionSavings.push(sumCents(best.solution.lines.map((l) => l.promotionSavingsCents)));
    referenceSavings.push(sumCents(best.solution.lines.map((l) => l.savingsCents)));
  }

  const usedLocationIds = [...new Set(assignments.map((a) => a.locationId))].sort();
  const usedChainIds = [...new Set(assignments.map((a) => a.chainId))].sort();

  return {
    locationIds: usedLocationIds,
    chainIds: usedChainIds,
    assignments,
    unavailable,
    groceryCents: sumCents(lineTotals),
    promotionSavingsCents: sumCents(promotionSavings),
    belowReferenceSavingsCents: sumCents(referenceSavings),
    purchasedByIngredient: purchased,
    categoryWinners: new Map(),
  };
}

/**
 * Which chain is really cheapest per shopping category, this week.
 *
 * Priced by asking what this week's requirements in that category would cost at
 * each single chain, so the answer survives the question "cheaper than what?".
 * A category is left out unless at least two chains can supply all of it and one
 * of them is strictly cheaper — otherwise there is no claim to make.
 */
export function cheapestChainPerCategory(
  requirements: readonly WeekIngredientRequirement[],
  stores: readonly StoreCandidate[],
  matrix: PackagingMatrix,
): Map<string, string> {
  const categories = [...new Set(requirements.map((r) => r.category))].sort();
  const winners = new Map<string, string>();

  for (const category of categories) {
    const inCategory = requirements.filter((r) => r.category === category);
    const totals: { chainId: string; total: number }[] = [];

    for (const store of stores) {
      let total = 0;
      let complete = true;
      for (const requirement of inCategory) {
        const result = matrix.get(requirement.ingredientId)?.get(store.location.id);
        if (!result || result.status !== 'OK') {
          complete = false;
          break;
        }
        total += result.solution.totalCents;
      }
      if (complete) totals.push({ chainId: store.chain.id, total });
    }

    if (totals.length < 2) continue;
    totals.sort((a, b) => a.total - b.total || a.chainId.localeCompare(b.chainId));
    if (totals[0]!.total < totals[1]!.total) winners.set(category, totals[0]!.chainId);
  }

  return winners;
}

export interface StoreOptionsInput {
  readonly requirements: readonly WeekIngredientRequirement[];
  readonly stores: readonly StoreCandidate[];
  readonly matrix: PackagingMatrix;
  readonly home: GeoPoint;
  readonly maxStores: number;
  readonly extraStorePenaltyCents: Cents;
  /** What one item this combination cannot supply costs it in the ranking. */
  readonly unavailableItemPenaltyCents: Cents;
  readonly tripConfig: TripCostConfig;
}

/**
 * Compare every allowed combination of stores.
 *
 * With at most one branch per chain and a cap of three stores this is at most
 * a few dozen combinations — small enough to evaluate exhaustively, which means
 * the recommendation is provably the best under the stated objective rather
 * than the first decent thing a heuristic found.
 */
export function enumerateStoreOptions(input: StoreOptionsInput): StoreOption[] {
  const subsets = combinations(input.stores, 1, Math.max(1, input.maxStores));
  const categoryWinners = cheapestChainPerCategory(input.requirements, input.stores, input.matrix);
  const seen = new Map<string, StoreOption>();

  for (const subset of subsets) {
    const combination = evaluateStoreCombination(input.requirements, subset, input.matrix);
    if (combination.assignments.length === 0) continue;

    // Two different subsets can collapse to the same effective set of stores
    // (e.g. {Lidl, AH} where nothing is actually cheaper at AH). Keep one.
    const key = combination.locationIds.join('|');
    const existing = seen.get(key);
    if (existing && existing.groceryCents <= combination.groceryCents) continue;

    const visited = input.stores.filter((s) => combination.locationIds.includes(s.location.id));
    const trip = estimateTripCost({
      home: input.home,
      stores: visited.map((s) => s.location),
      config: input.tripConfig,
    });
    const extraStores = Math.max(0, combination.locationIds.length - 1);
    const extraStorePenalty = cents(extraStores * input.extraStorePenaltyCents);
    const practicalTotal = cents(
      combination.groceryCents + trip.estimatedTravelCostCents + extraStorePenalty,
    );
    const unavailablePenalty = cents(
      combination.unavailable.length * input.unavailableItemPenaltyCents,
    );

    seen.set(key, {
      ...combination,
      categoryWinners,
      trip,
      extraStorePenaltyCents: extraStorePenalty,
      practicalTotalCents: practicalTotal,
      unavailablePenaltyCents: unavailablePenalty,
      comparableTotalCents: cents(practicalTotal + unavailablePenalty),
    });
  }

  // Completeness comes first, and not as a penalty you could out-price: the
  // user asked for these seven dishes, so a combination that cannot deliver one
  // of them is not the best way to shop for them, however low its bill looks.
  // Any charge per missing item would just be a number to tune — and a pack of
  // salmon costs more than any such charge would sensibly be.
  //
  // Incomplete combinations stay in the list (they are still worth showing when
  // nothing can supply everything) and are ranked among themselves on the
  // comparable total, which does price the gaps.
  return [...seen.values()].sort(
    (a, b) =>
      a.unavailable.length - b.unavailable.length ||
      a.comparableTotalCents - b.comparableTotalCents ||
      a.practicalTotalCents - b.practicalTotalCents ||
      a.groceryCents - b.groceryCents ||
      a.locationIds.length - b.locationIds.length ||
      a.locationIds.join('|').localeCompare(b.locationIds.join('|')),
  );
}

/**
 * Visiting two branches of the same chain is pointless: prices are the same and
 * you drive twice. Keep only the nearest selected branch per chain.
 */
export function representativeStoresPerChain(stores: readonly StoreCandidate[]): StoreCandidate[] {
  const nearest = new Map<string, StoreCandidate>();
  for (const store of stores) {
    const current = nearest.get(store.chain.id);
    if (
      !current ||
      store.distanceKm < current.distanceKm ||
      (store.distanceKm === current.distanceKm &&
        store.location.id.localeCompare(current.location.id) < 0)
    ) {
      nearest.set(store.chain.id, store);
    }
  }
  return [...nearest.values()].sort((a, b) => a.chain.id.localeCompare(b.chain.id));
}

function combinations<T>(items: readonly T[], min: number, max: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];

  const walk = (start: number): void => {
    if (current.length >= min && current.length <= max) result.push([...current]);
    if (current.length === max) return;
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };

  walk(0);
  return result.filter((c) => c.length >= min);
}
