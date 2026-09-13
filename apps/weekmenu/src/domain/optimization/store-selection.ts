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
  readonly promotionSavingsCents: Cents;
  readonly purchasedByIngredient: ReadonlyMap<string, number>;
  /** Cheapest single store per shopping category, for the explanation. */
  readonly categoryWinners: ReadonlyMap<string, string>;
}

export interface StoreOption extends StoreCombination {
  readonly trip: TripCostEstimate;
  readonly extraStorePenaltyCents: Cents;
  /** groceries + travel + the "extra store is a hassle" allowance. */
  readonly practicalTotalCents: Cents;
}

export type PackagingMatrix = ReadonlyMap<string, ReadonlyMap<string, PackagingResult>>;

/**
 * Price every ingredient at every candidate store once.
 *
 * Store combinations are then evaluated by looking values up in this matrix
 * instead of re-running the packaging search, which is what keeps comparing
 * dozens of store combinations cheap.
 */
export function buildPackagingMatrix(
  requirements: readonly WeekIngredientRequirement[],
  stores: readonly StoreCandidate[],
  config: PackagingConfig,
): PackagingMatrix {
  const matrix = new Map<string, Map<string, PackagingResult>>();
  for (const requirement of requirements) {
    const row = new Map<string, PackagingResult>();
    for (const store of stores) {
      row.set(
        store.location.id,
        optimisePackaging(requirement.ingredientId, requirement.totalAmount, store.offers, config),
      );
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
  const categoryTotals = new Map<string, Map<string, number>>();
  const lineTotals: Cents[] = [];
  const savings: Cents[] = [];

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
    savings.push(sumCents(best.solution.lines.map((l) => l.savingsCents)));

    const byCategory = categoryTotals.get(requirement.category) ?? new Map<string, number>();
    byCategory.set(
      best.store.chain.id,
      (byCategory.get(best.store.chain.id) ?? 0) + best.solution.totalCents,
    );
    categoryTotals.set(requirement.category, byCategory);
  }

  const usedLocationIds = [...new Set(assignments.map((a) => a.locationId))].sort();
  const usedChainIds = [...new Set(assignments.map((a) => a.chainId))].sort();

  const categoryWinners = new Map<string, string>();
  for (const [category, byChain] of categoryTotals) {
    const winner = [...byChain.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (winner) categoryWinners.set(category, winner[0]);
  }

  return {
    locationIds: usedLocationIds,
    chainIds: usedChainIds,
    assignments,
    unavailable,
    groceryCents: sumCents(lineTotals),
    promotionSavingsCents: sumCents(savings),
    purchasedByIngredient: purchased,
    categoryWinners,
  };
}

export interface StoreOptionsInput {
  readonly requirements: readonly WeekIngredientRequirement[];
  readonly stores: readonly StoreCandidate[];
  readonly matrix: PackagingMatrix;
  readonly home: GeoPoint;
  readonly maxStores: number;
  readonly extraStorePenaltyCents: Cents;
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

    seen.set(key, {
      ...combination,
      trip,
      extraStorePenaltyCents: extraStorePenalty,
      practicalTotalCents: cents(
        combination.groceryCents + trip.estimatedTravelCostCents + extraStorePenalty,
      ),
    });
  }

  return [...seen.values()].sort(
    (a, b) =>
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
