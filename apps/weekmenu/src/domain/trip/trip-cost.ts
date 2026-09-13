import { cents, type Cents, ZERO_CENTS } from '../units';
import type { SupermarketLocation } from '../stores/types';
import { type GeoPoint, roadDistanceKm, DEFAULT_ROAD_DETOUR_FACTOR } from './distance';

export const TRANSPORT_MODES = ['auto', 'fiets', 'lopen'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export interface TransportProfile {
  readonly averageSpeedKmh: number;
  /** Marginal cost per kilometre. Zero for walking; configurable for the car. */
  readonly costPerKmCents: Cents;
  /** Time spent inside a shop, per stop. */
  readonly minutesPerStop: number;
}

export interface TripCostConfig {
  readonly mode: TransportMode;
  readonly profiles: Readonly<Record<TransportMode, TransportProfile>>;
  readonly detourFactor: number;
}

export const DEFAULT_TRIP_COST_CONFIG: TripCostConfig = {
  mode: 'auto',
  profiles: {
    // Marginal cost of driving (fuel + wear), not the full cost of car ownership.
    auto: { averageSpeedKmh: 40, costPerKmCents: 23 as Cents, minutesPerStop: 12 },
    fiets: { averageSpeedKmh: 15, costPerKmCents: 0 as Cents, minutesPerStop: 12 },
    lopen: { averageSpeedKmh: 5, costPerKmCents: 0 as Cents, minutesPerStop: 12 },
  },
  detourFactor: DEFAULT_ROAD_DETOUR_FACTOR,
};

export interface TripCostInput {
  readonly home: GeoPoint;
  readonly stores: readonly SupermarketLocation[];
  readonly config?: TripCostConfig;
}

export interface TripCostEstimate {
  readonly estimatedDistanceKm: number;
  readonly estimatedTravelCostCents: Cents;
  readonly estimatedMinutes: number;
  readonly storeCount: number;
  /** Ordered stops as the estimate assumes you would drive them. */
  readonly route: readonly string[];
  readonly mode: TransportMode;
}

/**
 * Estimate what a shopping trip costs on top of the groceries.
 *
 * V1 assumes one round trip from home, visiting the chosen stores in a
 * nearest-neighbour order and returning home. That is deliberately simple and
 * deliberately separate from the grocery price: the UI always shows the two
 * numbers apart, because pretending petrol is part of a supermarket bill would
 * be dishonest.
 *
 * A real routing provider only has to replace `roadDistanceKm` and the ordering
 * below; the rest of the optimizer does not change.
 */
export function estimateTripCost(input: TripCostInput): TripCostEstimate {
  const config = input.config ?? DEFAULT_TRIP_COST_CONFIG;
  const profile = config.profiles[config.mode];

  if (input.stores.length === 0) {
    return {
      estimatedDistanceKm: 0,
      estimatedTravelCostCents: ZERO_CENTS,
      estimatedMinutes: 0,
      storeCount: 0,
      route: [],
      mode: config.mode,
    };
  }

  const route = nearestNeighbourRoute(input.home, input.stores, config.detourFactor);
  let distanceKm = 0;
  let current: GeoPoint = input.home;
  for (const store of route) {
    distanceKm += roadDistanceKm(current, store, config.detourFactor);
    current = store;
  }
  distanceKm += roadDistanceKm(current, input.home, config.detourFactor);

  const drivingMinutes = (distanceKm / profile.averageSpeedKmh) * 60;
  const shoppingMinutes = route.length * profile.minutesPerStop;

  return {
    estimatedDistanceKm: round1(distanceKm),
    estimatedTravelCostCents: cents(distanceKm * profile.costPerKmCents),
    estimatedMinutes: Math.round(drivingMinutes + shoppingMinutes),
    storeCount: route.length,
    route: route.map((s) => s.id),
    mode: config.mode,
  };
}

/**
 * Deterministic nearest-neighbour ordering. With at most three stops this is
 * within a rounding error of optimal, and it never depends on input order.
 */
function nearestNeighbourRoute(
  home: GeoPoint,
  stores: readonly SupermarketLocation[],
  detourFactor: number,
): SupermarketLocation[] {
  const remaining = [...stores].sort((a, b) => a.id.localeCompare(b.id));
  const route: SupermarketLocation[] = [];
  let current: GeoPoint = home;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((store, index) => {
      const distance = roadDistanceKm(current, store, detourFactor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    route.push(next!);
    current = next!;
  }

  return route;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
